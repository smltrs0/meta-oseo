/**
 * Animación del menú circular con GSAP: los nodos salen del centro del control hacia su
 * posición (y vuelven al cerrarse), uno tras otro. Sobria: 0.26 s de entrada, 0.16 s de
 * salida, sin rebote.
 *
 * El estado final NO depende de la animación: la posición de cada nodo la fija el diseño
 * (`left`/`top` en la plantilla) y GSAP solo anima un desplazamiento temporal que parte de
 * `-x, -y` (el centro del control) y termina en 0. Si la animación se interrumpe o falla,
 * el nodo queda donde debe. Con `prefers-reduced-motion` no hay movimiento: los nodos
 * aparecen y desaparecen al instante. Lo mismo ocurre mientras GSAP no se haya descargado
 * (se carga aparte; ver gsapPerezoso.ts).
 *
 * Los ganchos están pensados para `<TransitionGroup :css="false">` de Vue: reciben el
 * elemento y la función `done` que avisa a Vue de que terminó.
 */
import { obtenerGsap } from './gsapPerezoso';

const DURACION_ENTRADA = 0.26;
const DURACION_SALIDA = 0.16;
const ESCALONADO_ENTRADA = 0.035;
const ESCALONADO_SALIDA = 0.02;

interface DatosNodo {
  x: number;
  y: number;
  indice: number;
  total: number;
}

/** Lee el desplazamiento y el orden que la plantilla deja en `data-*`. */
function leerDatos(el: Element): DatosNodo {
  const d = (el as HTMLElement).dataset;
  return {
    x: Number(d.x) || 0,
    y: Number(d.y) || 0,
    indice: Number(d.indice) || 0,
    total: Number(d.total) || 1,
  };
}

/** Detiene cualquier animación en curso de un nodo y le quita los estilos temporales. */
export function detenerNodo(el: Element): void {
  const gsap = obtenerGsap();
  if (!gsap) return;
  gsap.killTweensOf(el);
  gsap.set(el, { clearProps: 'transform,opacity' });
}

export function entrarNodo(el: Element, done: () => void, reducido: boolean): void {
  const gsap = obtenerGsap();
  if (reducido || !gsap) {
    gsap?.killTweensOf(el);
    done();
    return;
  }
  gsap.killTweensOf(el);
  const { x, y, indice } = leerDatos(el);
  gsap.fromTo(
    el,
    { x: -x, y: -y, opacity: 0, scale: 0.6 },
    {
      x: 0,
      y: 0,
      opacity: 1,
      scale: 1,
      duration: DURACION_ENTRADA,
      delay: indice * ESCALONADO_ENTRADA,
      ease: 'power2.out',
      clearProps: 'transform,opacity',
      onComplete: done,
    },
  );
}

export function salirNodo(el: Element, done: () => void, reducido: boolean): void {
  const gsap = obtenerGsap();
  if (reducido || !gsap) {
    gsap?.killTweensOf(el);
    done();
    return;
  }
  gsap.killTweensOf(el);
  const { x, y, indice, total } = leerDatos(el);
  gsap.to(el, {
    x: -x,
    y: -y,
    opacity: 0,
    scale: 0.6,
    duration: DURACION_SALIDA,
    // Se retiran en orden inverso: el último en aparecer es el primero en volver.
    delay: (total - 1 - indice) * ESCALONADO_SALIDA,
    ease: 'power2.in',
    onComplete: done,
  });
}
