/**
 * Arrastre de una molécula con Pointer Events (ratón, lápiz y dedo), sin dependencias.
 *
 * Es un complemento del teclado y del toque-toque, nunca el único camino (regla R1):
 *  - Las escuchas de `pointermove`, `pointerup` y `pointercancel` (y `Escape`) están en `window` y
 *    SOLO existen mientras hay un puntero presionado; se quitan al soltar, al cancelar y al
 *    desmontar (`onScopeDispose`). No hay temporizadores ni `requestAnimationFrame`.
 *  - Un toque que se mueve menos de `UMBRAL_ARRASTRE_PX` no es un arrastre: sigue siendo un
 *    `click` normal (elegir la molécula).
 *  - Mientras se arrastra, el receptor candidato se calcula con `receptorMasCercano` y el radio de
 *    captura del contrato (56 px): no hace falta caer exactamente sobre el dibujo.
 *  - Soltar fuera de todo radio llama a `alSoltar(molecula, null)`: la molécula vuelve a la
 *    bandeja y el componente decide que no es un error.
 *  - Si el navegador cancela el gesto (`pointercancel`) o se pulsa `Escape`, no hay suelta.
 *  - Tras un arrastre real se ignora el `click` que el navegador pueda disparar sobre la pieza.
 *  - La pieza que se arrastra es la única con `touch-action: none` (regla R8): la página sigue
 *    desplazándose con el dedo en cualquier otro sitio.
 */
import { onScopeDispose, ref } from 'vue';
import { RADIO_CAPTURA_PX, UMBRAL_ARRASTRE_PX, receptorMasCercano } from './geometria';
import type { Punto } from './geometria';

/** Tiempo (ms) durante el que se ignora el `click` posterior a un arrastre. */
const VENTANA_CLIC_MS = 400;

export interface OpcionesArrastreMolecular {
  /** ¿Se puede empezar a arrastrar ahora? (modo `jugar` y actividad sin terminar). */
  activo: () => boolean;
  /** Centros de los receptores en coordenadas de ventana (medidos en el momento de la llamada). */
  centros: () => readonly (Punto | null | undefined)[];
  /** El toque pasó el umbral: empezó un arrastre de `molecula` (índice). */
  alEmpezar: (molecula: number) => void;
  /** Se soltó `molecula` sobre el receptor `receptor` (índice) o, con `null`, en el vacío. */
  alSoltar: (molecula: number, receptor: number | null) => void;
  /** El gesto se canceló sin soltar (el navegador o `Escape`). */
  alCancelar?: (molecula: number) => void;
}

export function useArrastreMolecular(opciones: OpcionesArrastreMolecular) {
  /** Molécula que se está arrastrando (solo cuando ya superó el umbral), o `null`. */
  const molecula = ref<number | null>(null);
  /** Desplazamiento de la pieza respecto de su sitio en la bandeja, en px. */
  const desplazamiento = ref<Punto>({ x: 0, y: 0 });
  /** Receptor que recibiría la pieza si se soltara ahora, o `null`. */
  const objetivo = ref<number | null>(null);

  let presionado: {
    molecula: number;
    pointerId: number;
    x: number;
    y: number;
    elemento: Element | null;
  } | null = null;
  let escuchando = false;
  let suprimirClicHasta = 0;

  function quitarEscuchas(): void {
    if (!escuchando) return;
    escuchando = false;
    window.removeEventListener('pointermove', alMover);
    window.removeEventListener('pointerup', alSoltarPuntero);
    window.removeEventListener('pointercancel', alCancelarPuntero);
    window.removeEventListener('keydown', alTeclear);
  }

  function liberarCaptura(): void {
    const actual = presionado;
    if (!actual?.elemento) return;
    try {
      if (actual.elemento.hasPointerCapture?.(actual.pointerId)) {
        actual.elemento.releasePointerCapture(actual.pointerId);
      }
    } catch {
      // El elemento ya no está en el documento: no hay nada que liberar.
    }
  }

  function limpiar(): void {
    quitarEscuchas();
    liberarCaptura();
    presionado = null;
    molecula.value = null;
    objetivo.value = null;
    desplazamiento.value = { x: 0, y: 0 };
  }

  function candidato(x: number, y: number): number | null {
    return receptorMasCercano({ x, y }, opciones.centros(), RADIO_CAPTURA_PX);
  }

  function alMover(evento: PointerEvent): void {
    if (!presionado || evento.pointerId !== presionado.pointerId) return;
    if (molecula.value === null) {
      const recorrido = Math.hypot(evento.clientX - presionado.x, evento.clientY - presionado.y);
      if (recorrido < UMBRAL_ARRASTRE_PX) return;
      molecula.value = presionado.molecula;
      opciones.alEmpezar(presionado.molecula);
    }
    desplazamiento.value = { x: evento.clientX - presionado.x, y: evento.clientY - presionado.y };
    objetivo.value = candidato(evento.clientX, evento.clientY);
  }

  function alSoltarPuntero(evento: PointerEvent): void {
    if (!presionado || evento.pointerId !== presionado.pointerId) return;
    const arrastrada = molecula.value;
    if (arrastrada === null) {
      // Un toque sin movimiento: lo resuelve el `click`.
      limpiar();
      return;
    }
    const receptor = candidato(evento.clientX, evento.clientY);
    suprimirClicHasta = Date.now() + VENTANA_CLIC_MS;
    limpiar();
    opciones.alSoltar(arrastrada, receptor);
  }

  function alCancelarPuntero(evento: PointerEvent): void {
    if (!presionado || evento.pointerId !== presionado.pointerId) return;
    cancelar();
  }

  function alTeclear(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') cancelar();
  }

  /** Cancela el arrastre en curso sin soltar la pieza en ningún sitio. */
  function cancelar(): void {
    const arrastrada = molecula.value;
    if (arrastrada !== null) suprimirClicHasta = Date.now() + VENTANA_CLIC_MS;
    limpiar();
    if (arrastrada !== null) opciones.alCancelar?.(arrastrada);
  }

  /** `pointerdown` sobre la pieza de la molécula `indice`. */
  function presionar(evento: PointerEvent, indice: number): void {
    if (!opciones.activo() || presionado) return;
    // Solo el botón principal del ratón (el dedo y el lápiz siempre traen `button` 0) y un solo dedo.
    if (evento.button !== 0 || evento.isPrimary === false) return;
    const elemento = evento.currentTarget instanceof Element ? evento.currentTarget : null;
    presionado = {
      molecula: indice,
      pointerId: evento.pointerId,
      x: evento.clientX,
      y: evento.clientY,
      elemento,
    };
    try {
      // Con captura, el ratón que sale de la ventana sigue mandando eventos a la pieza.
      elemento?.setPointerCapture?.(evento.pointerId);
    } catch {
      // Sin captura el arrastre funciona igual, con las escuchas en `window`.
    }
    escuchando = true;
    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltarPuntero);
    window.addEventListener('pointercancel', alCancelarPuntero);
    window.addEventListener('keydown', alTeclear);
  }

  /** ¿Hay que ignorar este `click` porque es el eco de un arrastre? */
  function clicSuprimido(): boolean {
    return Date.now() < suprimirClicHasta;
  }

  onScopeDispose(() => {
    limpiar();
  });

  return {
    molecula,
    desplazamiento,
    objetivo,
    presionar,
    cancelar,
    clicSuprimido,
    /** Solo para pruebas: ¿hay escuchas globales activas? */
    escuchando: () => escuchando,
  };
}
