/**
 * Carga perezosa de GSAP para el menú circular y el HUD.
 *
 * GSAP pesa unos 28 kB comprimido y solo sirve para dos animaciones breves y opcionales. Se
 * descarga en un fragmento aparte justo después de montar el shell, sin bloquear su primer
 * pintado, y ni se descarga si la persona pidió movimiento reducido. Mientras no esté
 * disponible (o si la descarga falla, por ejemplo sin conexión) todo funciona igual, solo que
 * sin animar: quien llama consulta `obtenerGsap()` y, si es `null`, salta al estado final.
 */
import type { gsap as gsapTipo } from 'gsap';

type Gsap = typeof gsapTipo;

let cargado: Gsap | null = null;
let enCurso: Promise<void> | null = null;

/** Empieza la descarga (una sola vez). Nunca rechaza. */
export function precargarGsap(): Promise<void> {
  if (cargado) return Promise.resolve();
  enCurso ??= import('gsap')
    .then((modulo) => {
      cargado = modulo.gsap;
    })
    .catch(() => {
      // Sin red o fragmento caído: se podrá reintentar en el próximo montaje.
      enCurso = null;
    });
  return enCurso;
}

/** GSAP si ya se descargó; `null` si aún no o si falló. */
export function obtenerGsap(): Gsap | null {
  return cargado;
}

export type { Gsap };
