/**
 * STUB de la base (F1-08). El agente del mentor lo reescribe entero en F1-13: chat con
 * streaming SSE sobre POST /api/chat (fetch + ReadableStream, sin EventSource). Ruta y
 * nombre de la exportación fijos: MentorPanel lo importa como `useMentor()`.
 *
 * Aquí solo se fija la forma mínima del estado para que el panel compile.
 */
import { ref } from 'vue';

export type RolMensaje = 'user' | 'assistant';
export type EstadoMensaje = 'completo' | 'transmitiendo' | 'interrumpido' | 'error';
export type FaseMentor = 'idle' | 'thinking' | 'streaming' | 'error';

export interface MensajeMentor {
  id: string;
  role: RolMensaje;
  content: string;
  status: EstadoMensaje;
}

export function useMentor() {
  const mensajes = ref<MensajeMentor[]>([]);
  const fase = ref<FaseMentor>('idle');
  /** Mensaje legible para el estudiante; nunca texto técnico crudo. */
  const error = ref<string | null>(null);

  async function enviar(_texto: string): Promise<void> {
    // Pendiente en F1-13.
  }
  function detener(): void {
    // Pendiente en F1-13.
  }
  async function reintentar(): Promise<void> {
    // Pendiente en F1-13.
  }
  function limpiar(): void {
    mensajes.value = [];
    fase.value = 'idle';
    error.value = null;
  }

  return { mensajes, fase, error, enviar, detener, reintentar, limpiar };
}
