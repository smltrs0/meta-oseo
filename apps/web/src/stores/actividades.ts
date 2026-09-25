/**
 * Store de las actividades del módulo abierto (F2-08): resultados del estudiante, cola de envío a
 * la API, instantáneas de los intentos a medias y avisos de logro.
 *
 * Fuentes de verdad y orden de precedencia:
 *  - El SERVIDOR (`GET /api/activities/results?modulo=n`) es la fuente de los resultados. Sus
 *    filas se FUSIONAN con lo guardado en el navegador (nunca se pierde una actividad que el
 *    estudiante completó aquí y que el servidor aún no recibió o rechazó con 422).
 *  - El respaldo LOCAL (`localStorage`, siempre en try/catch, por usuario) permite abrir el módulo
 *    con los últimos resultados conocidos cuando la API falla, y guarda la cola de envío y las
 *    instantáneas de los intentos a medias (`ProgresoActividad`; el servidor no las guarda).
 *
 * Envío de resultados (docs/content-schema.md, "Cómo llega el resultado a la API"):
 *  - `registrarCompletada` calcula la petición con `aPeticionResultadoApi`, actualiza el resultado
 *    local y la encola. La cola se vacía en orden y una entrada se quita solo cuando la API la
 *    aceptó (o la rechazó de forma definitiva). Un fallo de red, un 5xx o un 429 la conservan y
 *    reintentan con espera creciente y al volver la conexión (`online`). Una misma
 *    actividad + intento nunca se encola dos veces.
 *  - Un rechazo definitivo (422 `actividad_desconocida`, `puntaje_invalido`...) se registra en
 *    `descartados` y en consola y NO bloquea al estudiante: la actividad sigue contando como
 *    hecha para el avance de secciones y módulos.
 *  - `PUT /api/progress/{n}` con `completado: true` solo sale cuando no queda ningún `POST` de ese
 *    módulo pendiente o en vuelo (nunca antes, ni si el `POST` falló). Un 409 `modulo_incompleto`
 *    se guarda en `faltantesDe(n)` y no se reintenta hasta que algo cambie.
 *
 * El store no monta nada ni escucha eventos por su cuenta: la vista llama a `iniciar()` al montar
 * (escucha `online` y procesa lo pendiente de una visita anterior) y a `detener()` al desmontar.
 */
import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { INSTANTANEA_MAX_BYTES, esProgresoTardio } from '@/activities/types';
import type {
  CuerpoResultadoApi,
  ProgresoActividad,
  ResultadoActividad,
  ResultadoGuardadoActividad,
} from '@/activities/types';
import { aPeticionResultadoApi } from '@/activities/types';
import { API_INTENTOS_MAX, API_PUNTAJE_MAX } from '@/content/constantes';
import { limitarPrecision } from '@/content/scoring';
import type { ResultadoConocido } from '@/content/scoring';
import { TIPOS_ACTIVIDAD } from '@/content/schema';
import type { Actividad } from '@/content/schema';
import type { NumeroModulo } from '@/data/modulos';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useProgresoStore } from '@/stores/progreso';
import type {
  CuerpoProgresoModulo,
  ModuloProgress,
  RespuestaProgresoModulo,
  RespuestaResultadoActividad,
  ResultadoActividadFila,
  ResultadosResponse,
} from '@/types/api';

/* -------------------------------------------------------------------------------------------
 * Tipos
 * ----------------------------------------------------------------------------------------- */

/** Mejor resultado conocido de una actividad (servidor fusionado con lo local). */
export interface ResultadoLocal {
  modulo: number;
  completada: boolean;
  /** Mejor puntaje. */
  puntaje: number;
  /** Mayor número de intento reportado. */
  intentos: number;
  /** Mejor precisión (0 a 1), si se conoce. */
  precision?: number;
}

export interface ItemCola {
  /** `{actividad}#{intentos}`: la identidad de un envío (evita duplicados). */
  clave: string;
  /** Ruta relativa a `API_BASE`. */
  ruta: string;
  cuerpo: CuerpoResultadoApi;
  creado: number;
}

export interface ResultadoDescartado {
  actividad: string;
  intentos: number;
  status: number;
  code: string;
  mensaje: string;
}

export interface AvisoLogro {
  /** Número creciente: sirve de `key` y para descartar el aviso. */
  clave: number;
  codigo: string;
  nombre: string;
  descripcion: string;
}

export type EstadoCarga = 'cargando' | 'listo' | 'error';

export type ResultadoPut =
  | { ok: true; modulo: ModuloProgress; logrosNuevos: string[] }
  | { ok: false; status: number; code: string; mensaje: string; faltantes: string[] };

/* -------------------------------------------------------------------------------------------
 * Almacenamiento local (siempre protegido: puede lanzar o no existir)
 * ----------------------------------------------------------------------------------------- */

const PREFIJO = 'ova.actividades';
const claveResultados = (uid: number) => `${PREFIJO}.resultados.${uid}`;
const claveCola = (uid: number) => `${PREFIJO}.cola.${uid}`;
const claveInstantanea = (uid: number, actividad: string) =>
  `${PREFIJO}.instantanea.${uid}.${actividad}`;

function leerJson(clave: string): unknown {
  try {
    const bruto = globalThis.localStorage?.getItem(clave);
    return bruto ? (JSON.parse(bruto) as unknown) : null;
  } catch {
    return null;
  }
}

function escribirJson(clave: string, valor: unknown): void {
  try {
    globalThis.localStorage?.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento o cuota llena: se sigue en memoria.
  }
}

function borrarClave(clave: string): void {
  try {
    globalThis.localStorage?.removeItem(clave);
  } catch {
    // Nada que borrar.
  }
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esEnteroEn(valor: unknown, min: number, max: number): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= min && valor <= max;
}

function bytesDe(valor: unknown): number {
  return new TextEncoder().encode(JSON.stringify(valor)).length;
}

function leerResultadosLocales(uid: number): Record<string, ResultadoLocal> {
  const bruto = leerJson(claveResultados(uid));
  const salida: Record<string, ResultadoLocal> = {};
  if (!esObjeto(bruto)) return salida;
  for (const [id, valor] of Object.entries(bruto)) {
    if (!esObjeto(valor) || !esEnteroEn(valor.modulo, 1, 6)) continue;
    if (typeof valor.completada !== 'boolean') continue;
    if (!esEnteroEn(valor.puntaje, 0, API_PUNTAJE_MAX)) continue;
    if (!esEnteroEn(valor.intentos, 0, API_INTENTOS_MAX)) continue;
    const precision =
      typeof valor.precision === 'number' && Number.isFinite(valor.precision)
        ? limitarPrecision(valor.precision)
        : undefined;
    salida[id] = {
      modulo: valor.modulo,
      completada: valor.completada,
      puntaje: valor.puntaje,
      intentos: valor.intentos,
      ...(precision === undefined ? {} : { precision }),
    };
  }
  return salida;
}

function esCuerpoValido(valor: unknown): valor is CuerpoResultadoApi {
  return (
    esObjeto(valor) &&
    esEnteroEn(valor.modulo, 1, 6) &&
    typeof valor.tipo === 'string' &&
    (TIPOS_ACTIVIDAD as readonly string[]).includes(valor.tipo) &&
    esEnteroEn(valor.puntaje, 0, API_PUNTAJE_MAX) &&
    esEnteroEn(valor.intentos, 1, API_INTENTOS_MAX) &&
    typeof valor.completada === 'boolean' &&
    (valor.detalle === undefined || esObjeto(valor.detalle))
  );
}

function leerColaLocal(uid: number): ItemCola[] {
  const bruto = leerJson(claveCola(uid));
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  const cola: ItemCola[] = [];
  for (const item of bruto) {
    if (!esObjeto(item) || typeof item.ruta !== 'string' || !esCuerpoValido(item.cuerpo)) continue;
    if (!/^\/activities\/[a-z0-9_-]{1,64}\/result$/.test(item.ruta)) continue;
    const clave = `${item.ruta}#${item.cuerpo.intentos}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    cola.push({
      clave,
      ruta: item.ruta,
      cuerpo: item.cuerpo,
      creado: typeof item.creado === 'number' ? item.creado : 0,
    });
  }
  return cola;
}

/** ¿Tiene la forma de un `ProgresoActividad` razonable? Lo demás se ignora. */
export function esProgresoValido(valor: unknown): valor is ProgresoActividad {
  return (
    esObjeto(valor) &&
    typeof valor.avance === 'number' &&
    valor.avance >= 0 &&
    valor.avance <= 1 &&
    esEnteroEn(valor.intentos, 1, API_INTENTOS_MAX) &&
    esObjeto(valor.instantanea) &&
    bytesDe(valor.instantanea) <= INSTANTANEA_MAX_BYTES * 2
  );
}

/* -------------------------------------------------------------------------------------------
 * Reintentos
 * ----------------------------------------------------------------------------------------- */

const ESPERA_REINTENTO_BASE_MS = 5_000;
const ESPERA_REINTENTO_MAX_MS = 120_000;
/** Avisos de logro que se conservan a la vez. */
const MAX_AVISOS = 3;

/** Red caída, servidor con problemas o límite de frecuencia: el envío se puede reintentar. */
function esReintentable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
}

function faltantesDe(error: unknown): string[] {
  if (!(error instanceof ApiError)) return [];
  const lista = error.detalle.faltantes;
  return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [];
}

function mayor(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

/* -------------------------------------------------------------------------------------------
 * Store
 * ----------------------------------------------------------------------------------------- */

export const useActividadesStore = defineStore('actividades', () => {
  const auth = useAuthStore();
  const progreso = useProgresoStore();

  const resultados = ref<Record<string, ResultadoLocal>>({});
  const estadoCarga = ref<Record<number, EstadoCarga>>({});
  const cola = ref<ItemCola[]>([]);
  const enVuelo = ref(false);
  const descartados = ref<ResultadoDescartado[]>([]);
  const avisosLogro = ref<AvisoLogro[]>([]);
  /** Mensaje si el último envío falló por red o servidor (se reintenta solo). */
  const errorEnvio = ref<string | null>(null);
  const faltantes = ref<Record<number, string[]>>({});
  /** Módulos cuyo `PUT completado` está pendiente. */
  const porCompletar = ref<number[]>([]);

  let uidCargado: number | null = null;
  /** Se incrementa al cambiar de usuario: lo que llega tarde de otro usuario se descarta. */
  let generacion = 0;
  let contadorAvisos = 0;
  let fallosSeguidos = 0;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let procesando: Promise<void> | null = null;
  let repetirProceso = false;
  let escuchandoConexion = false;
  const cargas = new Map<number, Promise<void>>();
  /** Intento de la última ejecución completada por actividad (defensa contra `progreso` tardío). */
  const ultimaCompletada = new Map<string, number>();

  /* ----- Usuario ----- */

  function uidActual(): number {
    return auth.usuario?.id ?? 0;
  }

  function limpiarMemoria(): void {
    generacion++;
    clearTimeout(temporizador);
    temporizador = undefined;
    cargas.clear();
    ultimaCompletada.clear();
    procesando = null;
    repetirProceso = false;
    fallosSeguidos = 0;
    resultados.value = {};
    estadoCarga.value = {};
    cola.value = [];
    enVuelo.value = false;
    descartados.value = [];
    avisosLogro.value = [];
    errorEnvio.value = null;
    faltantes.value = {};
    porCompletar.value = [];
  }

  /** Si cambió el usuario, olvida lo del anterior y carga lo guardado del nuevo. */
  function sincronizarUsuario(): void {
    const uid = uidActual();
    if (uid === uidCargado) return;
    limpiarMemoria();
    uidCargado = uid;
    resultados.value = leerResultadosLocales(uid);
    cola.value = leerColaLocal(uid);
  }

  watch(() => auth.usuario?.id, sincronizarUsuario);

  function persistirResultados(): void {
    escribirJson(claveResultados(uidActual()), resultados.value);
  }

  function persistirCola(): void {
    if (cola.value.length === 0) borrarClave(claveCola(uidActual()));
    else escribirJson(claveCola(uidActual()), cola.value);
  }

  /* ----- Lectura de resultados ----- */

  function fusionarServidor(filas: readonly ResultadoActividadFila[]): void {
    const siguiente = { ...resultados.value };
    for (const fila of filas) {
      if (typeof fila.activity_id !== 'string') continue;
      const local = siguiente[fila.activity_id];
      const precisionServidor =
        typeof fila.mejor_precision === 'number'
          ? limitarPrecision(fila.mejor_precision)
          : undefined;
      const precision = mayor(precisionServidor, local?.precision);
      siguiente[fila.activity_id] = {
        modulo: fila.modulo,
        completada: Boolean(fila.completada) || Boolean(local?.completada),
        puntaje: Math.max(fila.mejor_puntaje ?? 0, local?.puntaje ?? 0),
        intentos: Math.max(fila.intentos ?? 0, local?.intentos ?? 0),
        ...(precision === undefined ? {} : { precision }),
      };
    }
    resultados.value = siguiente;
    persistirResultados();
  }

  /**
   * Pide los resultados del módulo (`GET /api/activities/results?modulo=n`) y los fusiona con lo
   * local. Nunca rechaza: si la API falla queda `estadoCarga[n] = 'error'` y se usa el respaldo
   * local. Varias llamadas simultáneas comparten una sola petición.
   */
  function cargarResultados(modulo: number, opciones: { force?: boolean } = {}): Promise<void> {
    sincronizarUsuario();
    const enCurso = cargas.get(modulo);
    if (enCurso) return enCurso;
    if (estadoCarga.value[modulo] === 'listo' && !opciones.force) return Promise.resolve();

    const mia = generacion;
    estadoCarga.value = { ...estadoCarga.value, [modulo]: 'cargando' };
    const promesa = (async () => {
      try {
        const respuesta = await apiFetch<ResultadosResponse>(
          `/activities/results?modulo=${encodeURIComponent(String(modulo))}`,
        );
        if (mia !== generacion) return;
        fusionarServidor(Array.isArray(respuesta?.resultados) ? respuesta.resultados : []);
        estadoCarga.value = { ...estadoCarga.value, [modulo]: 'listo' };
      } catch {
        if (mia !== generacion) return;
        estadoCarga.value = { ...estadoCarga.value, [modulo]: 'error' };
      }
    })().finally(() => {
      if (cargas.get(modulo) === promesa) cargas.delete(modulo);
    });
    cargas.set(modulo, promesa);
    return promesa;
  }

  /** Mejor resultado conocido en la forma que entiende `scoring.ts`. */
  const conocidos = computed<Record<string, ResultadoConocido>>(() =>
    Object.fromEntries(
      Object.entries(resultados.value).map(([id, r]) => [
        id,
        { completada: r.completada, mejorPrecision: r.precision },
      ]),
    ),
  );

  /** Resultado guardado en la forma de `EstadoPrevioActividad.servidor`. */
  function servidorDe(id: string): ResultadoGuardadoActividad | undefined {
    const r = resultados.value[id];
    if (!r) return undefined;
    return {
      puntaje: r.puntaje,
      intentos: r.intentos,
      completada: r.completada,
      ...(r.precision === undefined ? {} : { precision: r.precision }),
    };
  }

  /** Puntaje por actividad (para `puntajeObtenidoModulo`). */
  const puntajes = computed<Record<string, number>>(() =>
    Object.fromEntries(Object.entries(resultados.value).map(([id, r]) => [id, r.puntaje])),
  );

  /* ----- Instantáneas de intentos a medias ----- */

  function guardarProgreso(id: string, valor: ProgresoActividad): boolean {
    sincronizarUsuario();
    if (esProgresoTardio(valor, ultimaCompletada.get(id))) return false;
    if (!esProgresoValido(valor)) return false;
    escribirJson(claveInstantanea(uidActual(), id), valor);
    return true;
  }

  function leerInstantanea(id: string): ProgresoActividad | undefined {
    sincronizarUsuario();
    const bruto = leerJson(claveInstantanea(uidActual(), id));
    if (!esProgresoValido(bruto)) return undefined;
    // Una instantánea de una ejecución que ya se completó es un resto: se ignora.
    if (esProgresoTardio(bruto, resultados.value[id]?.intentos)) {
      borrarClave(claveInstantanea(uidActual(), id));
      return undefined;
    }
    return bruto;
  }

  function borrarInstantanea(id: string): void {
    borrarClave(claveInstantanea(uidActual(), id));
  }

  function ultimoIntentoCompletado(id: string): number | undefined {
    return ultimaCompletada.get(id);
  }

  /* ----- Logros ----- */

  function avisarLogros(codigos: readonly string[]): void {
    if (codigos.length === 0) return;
    const nuevos: AvisoLogro[] = codigos.map((codigo) => {
      const logro = progreso.catalogoLogros.find((l) => l.codigo === codigo);
      return {
        clave: ++contadorAvisos,
        codigo,
        nombre: logro?.nombre ?? 'Nuevo logro',
        descripcion: logro?.descripcion ?? '',
      };
    });
    avisosLogro.value = [...avisosLogro.value, ...nuevos].slice(-MAX_AVISOS);
  }

  function descartarAviso(clave: number): void {
    avisosLogro.value = avisosLogro.value.filter((a) => a.clave !== clave);
  }

  /** Aplica logros nuevos al HUD y avisa solo de los que el estudiante aún no tenía. */
  function aplicarLogros(total: number | null, codigos: readonly string[]): string[] {
    const nuevos = codigos.filter((c) => !progreso.logros.includes(c));
    if (total !== null) progreso.aplicarResultado(total, codigos);
    avisarLogros(nuevos);
    return nuevos;
  }

  /* ----- Cola de envío ----- */

  function quitarDeCola(clave: string): void {
    cola.value = cola.value.filter((x) => x.clave !== clave);
    persistirCola();
  }

  function encolar(item: ItemCola): void {
    const i = cola.value.findIndex((x) => x.clave === item.clave);
    if (i >= 0) {
      // El envío en vuelo no se toca (su respuesta lo quitará); el resto se sustituye si mejora.
      const previo = cola.value[i]!;
      const enEnvio = enVuelo.value && i === 0;
      if (enEnvio || previo.cuerpo.puntaje > item.cuerpo.puntaje) return;
      cola.value = cola.value.map((x, j) => (j === i ? item : x));
    } else {
      cola.value = [...cola.value, item];
    }
    persistirCola();
  }

  function programarReintento(): void {
    fallosSeguidos++;
    const espera = Math.min(
      ESPERA_REINTENTO_MAX_MS,
      ESPERA_REINTENTO_BASE_MS * 2 ** Math.min(fallosSeguidos - 1, 8),
    );
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      temporizador = undefined;
      void procesar();
    }, espera);
  }

  /** Vacía la cola en orden. `false` si se detuvo por un fallo que se reintentará. */
  async function vaciarCola(): Promise<boolean> {
    const mia = generacion;
    while (cola.value.length > 0) {
      const item = cola.value[0]!;
      enVuelo.value = true;
      try {
        const respuesta = await apiFetch<RespuestaResultadoActividad>(item.ruta, {
          method: 'POST',
          body: item.cuerpo,
        });
        if (mia !== generacion) return false;
        quitarDeCola(item.clave);
        fallosSeguidos = 0;
        errorEnvio.value = null;
        aplicarLogros(respuesta.puntaje_total, respuesta.logros_nuevos ?? []);
      } catch (error) {
        if (mia !== generacion) return false;
        if (error instanceof ApiError && error.status === 401) {
          // La sesión se cerró: la cola queda guardada para el próximo ingreso de este usuario.
          return false;
        }
        if (esReintentable(error)) {
          errorEnvio.value =
            'No pudimos guardar tu último resultado. Sigue estudiando: lo reintentaremos solos.';
          programarReintento();
          return false;
        }
        // Rechazo definitivo (422...): se registra y se sigue; el estudiante no queda bloqueado.
        const api = error as ApiError;
        descartados.value = [
          ...descartados.value,
          {
            actividad: item.ruta.split('/')[2] ?? item.ruta,
            intentos: item.cuerpo.intentos,
            status: api.status,
            code: api.code,
            mensaje: api.message,
          },
        ];
        console.warn(
          `[actividades] La API rechazó el resultado de ${item.ruta} (${api.status} ${api.code}): ${api.message}`,
        );
        quitarDeCola(item.clave);
      } finally {
        enVuelo.value = false;
      }
    }
    return true;
  }

  /* ----- PUT /api/progress/{n} ----- */

  async function enviarProgresoModulo(
    modulo: number,
    cuerpo: CuerpoProgresoModulo,
    opciones: { keepalive?: boolean } = {},
  ): Promise<ResultadoPut> {
    const mia = generacion;
    try {
      const respuesta = await apiFetch<RespuestaProgresoModulo>(`/progress/${modulo}`, {
        method: 'PUT',
        body: cuerpo,
        ...(opciones.keepalive ? { keepalive: true } : {}),
      });
      const logros = respuesta.logros_nuevos ?? [];
      if (mia === generacion) {
        const nuevos = logros.filter((c) => !progreso.logros.includes(c));
        progreso.aplicarModulo(respuesta.modulo, logros);
        avisarLogros(nuevos);
      }
      return { ok: true, modulo: respuesta.modulo, logrosNuevos: logros };
    } catch (error) {
      if (error instanceof ApiError) {
        return {
          ok: false,
          status: error.status,
          code: error.code,
          mensaje: error.message,
          faltantes: faltantesDe(error),
        };
      }
      return { ok: false, status: 0, code: 'red', mensaje: 'Sin conexión.', faltantes: [] };
    }
  }

  /**
   * Envía los `PUT completado` pendientes. Un módulo espera a que su cola de resultados esté
   * vacía (los `POST` van primero).
   */
  async function enviarCompletados(): Promise<void> {
    const mia = generacion;
    for (const modulo of [...porCompletar.value]) {
      if (enVuelo.value || cola.value.some((x) => x.cuerpo.modulo === modulo)) continue;
      const r = await enviarProgresoModulo(modulo, { completado: true });
      if (mia !== generacion) return;
      if (r.ok) {
        porCompletar.value = porCompletar.value.filter((n) => n !== modulo);
        faltantes.value = { ...faltantes.value, [modulo]: [] };
      } else if (r.status === 409 && r.code === 'modulo_incompleto') {
        // El servidor no tiene todos los resultados: se muestra qué falta y no se insiste.
        porCompletar.value = porCompletar.value.filter((n) => n !== modulo);
        faltantes.value = { ...faltantes.value, [modulo]: r.faltantes };
      } else if (r.status === 401) {
        return;
      } else if (r.status === 0 || r.status === 408 || r.status === 429 || r.status >= 500) {
        programarReintento();
      } else {
        porCompletar.value = porCompletar.value.filter((n) => n !== modulo);
        console.warn(`[actividades] PUT /progress/${modulo} rechazado (${r.status} ${r.code}).`);
      }
    }
  }

  /** Vacía la cola de resultados y luego envía los módulos completados. Una sola a la vez. */
  function procesar(): Promise<void> {
    sincronizarUsuario();
    if (procesando) {
      repetirProceso = true;
      return procesando;
    }
    const promesa: Promise<void> = (async () => {
      do {
        repetirProceso = false;
        await vaciarCola();
        await enviarCompletados();
      } while (repetirProceso);
    })().finally(() => {
      if (procesando === promesa) procesando = null;
    });
    procesando = promesa;
    return promesa;
  }

  /**
   * Registra una actividad completada: actualiza el resultado local, borra la instantánea y
   * envía `POST /api/activities/{id}/result` (o lo deja en la cola). La promesa se cumple cuando
   * la cola quedó procesada.
   */
  function registrarCompletada(
    actividad: Pick<Actividad, 'id' | 'tipo' | 'puntaje_max'>,
    modulo: NumeroModulo,
    resultado: ResultadoActividad,
  ): Promise<void> {
    sincronizarUsuario();
    const peticion = aPeticionResultadoApi(actividad, modulo, resultado);
    const c = peticion.cuerpo;
    const previo = resultados.value[actividad.id];
    const precision = mayor(previo?.precision, limitarPrecision(resultado.precision));
    resultados.value = {
      ...resultados.value,
      [actividad.id]: {
        modulo,
        completada: true,
        puntaje: Math.max(previo?.puntaje ?? 0, c.puntaje),
        intentos: Math.max(previo?.intentos ?? 0, c.intentos),
        ...(precision === undefined ? {} : { precision }),
      },
    };
    persistirResultados();
    ultimaCompletada.set(actividad.id, c.intentos);
    borrarInstantanea(actividad.id);
    encolar({
      clave: `${peticion.ruta}#${c.intentos}`,
      ruta: peticion.ruta,
      cuerpo: c,
      creado: Date.now(),
    });
    return procesar();
  }

  /**
   * Pide que se envíe `PUT completado: true` del módulo (cuando su cola esté vacía). No hace nada
   * si ya está pedido. Un 409 lo deja en `faltantesDe(n)`.
   */
  function solicitarCompletar(modulo: number): Promise<void> {
    sincronizarUsuario();
    if (!porCompletar.value.includes(modulo)) porCompletar.value = [...porCompletar.value, modulo];
    return procesar();
  }

  function faltantesDeModulo(modulo: number): string[] {
    return faltantes.value[modulo] ?? [];
  }

  function alRecuperarConexion(): void {
    fallosSeguidos = 0;
    void procesar();
  }

  /** La vista lo llama al montar: procesa lo pendiente y escucha el regreso de la conexión. */
  function iniciar(): void {
    sincronizarUsuario();
    if (!escuchandoConexion && typeof window !== 'undefined') {
      window.addEventListener('online', alRecuperarConexion);
      escuchandoConexion = true;
    }
    if (cola.value.length > 0) void procesar();
  }

  /** La vista lo llama al desmontar. La cola queda guardada; el temporizador de reintento sigue. */
  function detener(): void {
    if (escuchandoConexion && typeof window !== 'undefined') {
      window.removeEventListener('online', alRecuperarConexion);
    }
    escuchandoConexion = false;
  }

  /** Vuelve al estado inicial (pruebas y cierre de sesión). No borra lo guardado en el navegador. */
  function reset(): void {
    detener();
    limpiarMemoria();
    uidCargado = null;
  }

  const pendientes = computed(() => cola.value.length);

  return {
    resultados,
    estadoCarga,
    cola,
    enVuelo,
    descartados,
    avisosLogro,
    errorEnvio,
    faltantes,
    porCompletar,
    conocidos,
    puntajes,
    pendientes,
    cargarResultados,
    servidorDe,
    guardarProgreso,
    leerInstantanea,
    borrarInstantanea,
    ultimoIntentoCompletado,
    registrarCompletada,
    solicitarCompletar,
    faltantesDeModulo,
    enviarProgresoModulo,
    procesar,
    descartarAviso,
    avisarLogros,
    iniciar,
    detener,
    reset,
  };
});
