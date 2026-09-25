/**
 * Chat con el mentor de IA (F1-13): streaming SSE sobre POST /api/chat.
 *
 * Usa `fetch` + `ReadableStream` (no `EventSource`, que no permite POST ni cabeceras) y un
 * `AbortController` para cancelar; el backend cancela a su vez la petición a Anthropic cuando el
 * cliente se desconecta. Protocolo en docs/api-contract.md, sección "Mentor de IA".
 *
 * Decisiones de diseño:
 * - Una sola petición activa. `enviar()` mientras hay una en curso se IGNORA (devuelve `false`);
 *   la interfaz deshabilita el campo, esto es la red de seguridad contra doble envío.
 * - Cada petición tiene un número de serie. Al detener, limpiar o desmontar, el número avanza y
 *   todo lo que llegue de la petición anterior se descarta: no hay carreras entre streams.
 * - Al servidor solo viaja lo que cumple el contrato: máximo 40 mensajes, el último del
 *   estudiante, cada uno de 1 a 8000 caracteres (las respuestas largas del mentor se recortan
 *   al reenviarlas como historial). Los mensajes vacíos o fallidos no se reenvían.
 * - Nunca se muestra texto técnico crudo: los errores se traducen en `errores.ts`.
 * - Los mensajes viven solo en memoria; se borran al cerrar sesión. La persistencia llega en F3-09.
 * - Los eventos `tool_use` (acciones de cámara 3D, F3-08) y cualquier evento desconocido se ignoran.
 */
import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue';
import { ApiError, apiFetchRaw, leerApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useContextoStore } from '@/stores/contextoPedagogico';
import type { FalloMentor } from './errores';
import {
  FALLO_CORTE,
  FALLO_MENSAJE_LARGO,
  FALLO_SIN_TEXTO,
  falloDeApi,
  falloDeStream,
} from './errores';
import { MAX_CARACTERES, MAX_MENSAJES, acotarCaracteres, contarCaracteres } from './limites';
import type { EventoSse } from './sse';
import { leerEventosSse } from './sse';

export { MAX_CARACTERES, MAX_MENSAJES } from './limites';

export type RolMensaje = 'user' | 'assistant';
export type EstadoMensaje = 'completo' | 'transmitiendo' | 'interrumpido' | 'error';
export type FaseMentor = 'idle' | 'thinking' | 'streaming' | 'error';

export interface MensajeMentor {
  id: string;
  role: RolMensaje;
  content: string;
  status: EstadoMensaje;
}

/** Cuerpo de cada mensaje que viaja a POST /api/chat. */
export interface MensajeChat {
  role: RolMensaje;
  content: string;
}

/** Payload del evento SSE `usage` (docs/api-contract.md). */
export interface UsoTokens {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

let contadorId = 0;
/** Identificador local de mensaje. No usa `crypto.randomUUID` (solo existe en contextos seguros). */
function nuevoId(): string {
  contadorId += 1;
  return `m${Date.now().toString(36)}-${contadorId}`;
}

/**
 * Arma el historial que viaja al servidor a partir de los mensajes en pantalla:
 * descarta los vacíos (respuestas fallidas o en curso), recorta cada texto a 8000 caracteres,
 * conserva los `MAX_MENSAJES` más recientes y, si el recorte deja una respuesta del mentor al
 * principio, la quita (la conversación debe empezar con un mensaje del estudiante).
 */
export function construirHistorial(mensajes: readonly MensajeMentor[]): MensajeChat[] {
  const utiles = mensajes
    .filter((m) => m.content.trim().length > 0)
    .map<MensajeChat>((m) => ({ role: m.role, content: acotarCaracteres(m.content) }));
  const recientes = utiles.slice(-MAX_MENSAJES);
  while (recientes.length > 0 && recientes[0]!.role === 'assistant') recientes.shift();
  return recientes;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** JSON del campo `data`; `null` si no es un objeto válido (el evento se ignora). */
function leerDatos(evento: EventoSse): Record<string, unknown> | null {
  try {
    const valor: unknown = JSON.parse(evento.data);
    return esObjeto(valor) ? valor : null;
  } catch {
    return null;
  }
}

function numero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

export function useMentor() {
  const auth = useAuthStore();
  const contexto = useContextoStore();

  const mensajes = ref<MensajeMentor[]>([]);
  const fase = ref<FaseMentor>('idle');
  /** Mensaje legible para el estudiante; nunca texto técnico crudo. */
  const error = ref<string | null>(null);
  /** Consumo de tokens de la última respuesta (evento `usage`). */
  const uso = ref<UsoTokens | null>(null);
  /** `stop_reason` de la última respuesta terminada con `done`. */
  const motivoFin = ref<string | null>(null);

  /** Si el error actual tiene arreglo posible con "Reintentar". */
  const errorReintentable = ref(true);
  /** Número de serie de la petición vigente; avanzar lo invalida todo lo anterior. */
  let serie = 0;
  let controlActivo: AbortController | null = null;

  const ocupado = computed(() => fase.value === 'thinking' || fase.value === 'streaming');

  /**
   * ¿Hay algo que reintentar? Sí si el último mensaje es una respuesta fallida o interrumpida,
   * o un mensaje del estudiante sin respuesta (p. ej. tras detener antes del primer texto).
   */
  const puedeReintentar = computed(() => {
    if (ocupado.value) return false;
    const ultimo = mensajes.value.at(-1);
    if (!ultimo) return false;
    if (fase.value === 'error' && !errorReintentable.value) return false;
    if (ultimo.role === 'user') return true;
    return ultimo.status === 'error' || ultimo.status === 'interrumpido';
  });

  function cancelarActiva(): void {
    serie += 1;
    controlActivo?.abort();
    controlActivo = null;
  }

  /** Quita las respuestas fallidas sin texto: no aportan nada y no deben acumularse. */
  function purgarFallidasVacias(): void {
    mensajes.value = mensajes.value.filter(
      (m) => !(m.role === 'assistant' && m.status === 'error' && m.content === ''),
    );
  }

  function marcarFallo(asistente: MensajeMentor, fallo: FalloMentor): void {
    asistente.status = asistente.content ? 'interrumpido' : 'error';
    fase.value = 'error';
    error.value = fallo.mensaje;
    errorReintentable.value = fallo.reintentable;
  }

  /** Aplica un evento SSE al mensaje en curso. Devuelve `true` si fue terminal (`done`/`error`). */
  function aplicarEvento(evento: EventoSse, asistente: MensajeMentor): boolean {
    const datos = leerDatos(evento);
    switch (evento.event) {
      case 'text': {
        const delta = datos?.delta;
        if (typeof delta === 'string' && delta !== '') {
          asistente.content += delta;
          if (fase.value === 'thinking') fase.value = 'streaming';
        }
        return false;
      }
      case 'usage': {
        if (datos) {
          uso.value = {
            input_tokens: numero(datos.input_tokens),
            output_tokens: numero(datos.output_tokens),
            cache_read_input_tokens: numero(datos.cache_read_input_tokens),
            cache_creation_input_tokens: numero(datos.cache_creation_input_tokens),
          };
        }
        return false;
      }
      case 'done': {
        if (!asistente.content.trim()) {
          marcarFallo(asistente, FALLO_SIN_TEXTO);
          return true;
        }
        asistente.status = 'completo';
        fase.value = 'idle';
        error.value = null;
        motivoFin.value = typeof datos?.stop_reason === 'string' ? datos.stop_reason : null;
        return true;
      }
      case 'error': {
        marcarFallo(asistente, falloDeStream(datos?.code));
        return true;
      }
      default:
        // `tool_use` (F3-08) y cualquier evento futuro: se ignoran sin romper el flujo.
        return false;
    }
  }

  /**
   * Envía la conversación actual (cuyo último mensaje es del estudiante) y transmite la
   * respuesta al mensaje del mentor que se añade al final.
   */
  async function transmitir(): Promise<void> {
    const historial = construirHistorial(mensajes.value);
    mensajes.value.push({ id: nuevoId(), role: 'assistant', content: '', status: 'transmitiendo' });
    // Se toma el proxy reactivo del array para que cada cambio se refleje en pantalla.
    const asistente = mensajes.value[mensajes.value.length - 1]!;

    cancelarActiva();
    const miSerie = serie;
    const control = new AbortController();
    controlActivo = control;
    fase.value = 'thinking';
    error.value = null;
    errorReintentable.value = true;
    uso.value = null;
    motivoFin.value = null;

    try {
      const res = await apiFetchRaw('/chat', {
        method: 'POST',
        body: { messages: historial, contexto: contexto.toPayload() },
        headers: { Accept: 'text/event-stream' },
        signal: control.signal,
      });
      if (miSerie !== serie) return;
      if (!res.ok) throw await leerApiError(res);
      if (!res.body) throw new ApiError(res.status, 'respuesta_invalida', '');

      let terminal = false;
      for await (const evento of leerEventosSse(res.body)) {
        if (miSerie !== serie) return; // detenida o reemplazada: `return` cancela el lector
        if (aplicarEvento(evento, asistente)) {
          terminal = true;
          break; // exactamente un evento terminal; lo que venga después no cuenta
        }
      }
      if (miSerie !== serie) return;
      if (!terminal) marcarFallo(asistente, FALLO_CORTE);
    } catch (e) {
      if (miSerie !== serie || control.signal.aborted) return; // cancelación voluntaria
      if (e instanceof ApiError) {
        // Un 401 ya cerró la sesión dentro de `apiFetchRaw`.
        marcarFallo(asistente, falloDeApi(e));
      } else {
        // Error de lectura a mitad del stream (red caída, conexión reiniciada...).
        marcarFallo(asistente, FALLO_CORTE);
      }
    } finally {
      if (miSerie === serie) controlActivo = null;
    }
  }

  /**
   * Envía un mensaje del estudiante. Devuelve `true` si se envió; `false` si se ignoró (hay una
   * respuesta en curso, texto vacío o demasiado largo). La promesa se resuelve al terminar el stream.
   */
  async function enviar(texto: string): Promise<boolean> {
    if (ocupado.value) return false;
    const limpio = texto.trim();
    if (!limpio) return false;
    if (contarCaracteres(limpio) > MAX_CARACTERES) {
      fase.value = 'error';
      error.value = FALLO_MENSAJE_LARGO.mensaje;
      errorReintentable.value = false;
      return false;
    }
    purgarFallidasVacias();
    mensajes.value.push({ id: nuevoId(), role: 'user', content: limpio, status: 'completo' });
    await transmitir();
    return true;
  }

  /**
   * Detiene la respuesta en curso. Conserva el texto parcial marcado como interrumpido; si aún
   * no había texto, quita el mensaje vacío. No es un error: no se muestra aviso.
   */
  function detener(): void {
    if (!ocupado.value) return;
    cancelarActiva();
    const ultimo = mensajes.value.at(-1);
    if (ultimo?.role === 'assistant' && ultimo.status === 'transmitiendo') {
      if (ultimo.content) ultimo.status = 'interrumpido';
      else mensajes.value.pop();
    }
    fase.value = 'idle';
    error.value = null;
  }

  /**
   * Vuelve a pedir la respuesta al último mensaje del estudiante, descartando la respuesta
   * fallida o interrumpida. Devuelve `false` si no había nada que reintentar.
   */
  async function reintentar(): Promise<boolean> {
    if (ocupado.value) return false;
    const ultimo = mensajes.value.at(-1);
    if (
      ultimo?.role === 'assistant' &&
      (ultimo.status === 'error' || ultimo.status === 'interrumpido')
    ) {
      mensajes.value.pop();
    }
    if (mensajes.value.at(-1)?.role !== 'user') return false;
    await transmitir();
    return true;
  }

  /** Empieza una conversación nueva: cancela lo que esté en curso y borra los mensajes. */
  function limpiar(): void {
    cancelarActiva();
    mensajes.value = [];
    fase.value = 'idle';
    error.value = null;
    errorReintentable.value = true;
    uso.value = null;
    motivoFin.value = null;
  }

  // Al cerrar sesión (botón "Salir" o 401) la conversación del estudiante no debe sobrevivir.
  watch(
    () => auth.token,
    (token) => {
      if (!token) limpiar();
    },
  );

  if (getCurrentScope()) onScopeDispose(cancelarActiva);

  return {
    mensajes,
    fase,
    error,
    uso,
    motivoFin,
    ocupado,
    puedeReintentar,
    enviar,
    detener,
    reintentar,
    limpiar,
  };
}
