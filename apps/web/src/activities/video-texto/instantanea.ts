/**
 * Instantánea de un intento a medias de video-texto (`ProgresoActividad.instantanea`).
 *
 * Es opaca para la página: puede venir corrupta o de una versión anterior del contenido, así que
 * cada lector valida contra la actividad actual y devuelve `null` si no le sirve.
 *
 *  - animación: `{ paso, maximo }`. Índices (no ids), como pide el contrato, y unos pocos bytes.
 *  - video: `{ visto }`, la fracción reproducida (0 a 1).
 */
import { UMBRAL_VIDEO_VISTO } from '@/activities/types';
import type { JsonObjeto } from '@/activities/types';

function entero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) ? valor : null;
}

/**
 * Paso en el que continúa el estudiante. Nunca se restaura el ÚLTIMO paso: llegar a él completa la
 * actividad y la página borra la instantánea al completar, así que una instantánea ahí es
 * corrupta; se reanuda en el penúltimo, desde donde se puede completar avanzando.
 */
export function leerInstantaneaAnimacion(
  instantanea: JsonObjeto | undefined,
  totalPasos: number,
): { paso: number; maximo: number } | null {
  if (!instantanea || totalPasos < 2) return null;
  const paso = entero(instantanea.paso);
  const maximo = entero(instantanea.maximo);
  if (paso === null || maximo === null) return null;
  if (paso < 0 || paso > totalPasos - 1 || maximo < paso || maximo > totalPasos - 1) return null;
  const tope = totalPasos - 2;
  return { paso: Math.min(paso, tope), maximo: Math.min(maximo, tope) };
}

/**
 * Fracción del video que ya se había visto (0 a 1), o `null` si la instantánea no la trae. Como
 * en la animación, nunca restaura una fracción que ya baste para completar (queda un punto por
 * debajo del umbral): completar exige ver algo del video en esta sesión.
 */
export function leerInstantaneaVideo(instantanea: JsonObjeto | undefined): number | null {
  const visto = instantanea?.visto;
  if (typeof visto !== 'number' || !Number.isFinite(visto) || visto < 0 || visto > 1) return null;
  return Math.min(visto, UMBRAL_VIDEO_VISTO - 0.01);
}
