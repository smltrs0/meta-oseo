/**
 * Traduce los errores del mentor a mensajes en español para el estudiante (F1-13).
 *
 * Regla: NUNCA se muestra texto crudo del servidor ni de una excepción (podría ser técnico,
 * estar en inglés o revelar detalles internos). Cada código conocido tiene un mensaje propio
 * y cualquier otro cae en uno genérico.
 */
import type { ApiError } from '@/lib/api';
import { MENSAJE_SIN_CONEXION } from '@/lib/api';

export interface FalloMentor {
  /** Texto para el estudiante. */
  mensaje: string;
  /** Si tiene sentido ofrecer "Reintentar" (falso cuando reintentar no puede arreglarlo). */
  reintentable: boolean;
}

export const FALLO_GENERICO: FalloMentor = {
  mensaje: 'El mentor no pudo responder en este momento. Inténtalo de nuevo.',
  reintentable: true,
};

/** El flujo se cortó sin `done` ni `error` (red, proxy o servidor). */
export const FALLO_CORTE: FalloMentor = {
  mensaje: 'La respuesta se interrumpió antes de terminar. Puedes reintentar.',
  reintentable: true,
};

export const FALLO_SIN_TEXTO: FalloMentor = {
  mensaje: 'El mentor no devolvió una respuesta. Inténtalo de nuevo.',
  reintentable: true,
};

export const FALLO_MENSAJE_LARGO: FalloMentor = {
  mensaje: 'Tu mensaje es demasiado largo. Acórtalo e inténtalo de nuevo.',
  reintentable: false,
};

/** Errores HTTP antes de abrir el stream (`apiFetchRaw` + `leerApiError`). */
export function falloDeApi(err: ApiError): FalloMentor {
  if (err.status === 0 || err.code === 'red') {
    return { mensaje: MENSAJE_SIN_CONEXION, reintentable: true };
  }
  if (err.status === 401) {
    return {
      mensaje: 'Tu sesión expiró. Ingresa de nuevo para hablar con el mentor.',
      reintentable: false,
    };
  }
  if (err.status === 503 && err.code === 'ia_no_configurada') {
    return { mensaje: 'El mentor no está disponible por ahora.', reintentable: false };
  }
  if (err.status === 422) {
    return {
      mensaje: 'No pude procesar ese mensaje. Prueba con uno más corto o distinto.',
      reintentable: false,
    };
  }
  if (err.status === 429) {
    return {
      mensaje: 'Estás enviando muchos mensajes seguidos. Espera un momento e inténtalo de nuevo.',
      reintentable: true,
    };
  }
  return FALLO_GENERICO;
}

/** Códigos del evento SSE `error` (docs/api-contract.md). */
export function falloDeStream(code: unknown): FalloMentor {
  switch (code) {
    case 'refusal':
      return {
        mensaje: 'El mentor no puede responder a esa pregunta. Reformúlala o pregunta otra cosa.',
        reintentable: true,
      };
    case 'max_tokens':
      return {
        mensaje:
          'La respuesta se cortó por ser demasiado larga. Pide un resumen o una parte más concreta.',
        reintentable: true,
      };
    case 'rate_limited':
      return {
        mensaje: 'El mentor está muy ocupado ahora. Espera un momento e inténtalo de nuevo.',
        reintentable: true,
      };
    case 'upstream_error':
      return {
        mensaje: 'El mentor tuvo un problema para responder. Inténtalo de nuevo.',
        reintentable: true,
      };
    default:
      return FALLO_GENERICO;
  }
}
