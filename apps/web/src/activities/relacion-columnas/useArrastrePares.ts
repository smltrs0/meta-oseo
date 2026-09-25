/**
 * Arrastre opcional entre las dos columnas de `relacion-columnas`, con Pointer Events.
 *
 * Es un complemento del toque-toque y del teclado, nunca el único camino (regla R1):
 *  - Solo hay escuchas en `window` mientras hay un puntero presionado; se quitan al soltar, al
 *    cancelar y al desmontar (`onScopeDispose`), así que no quedan fugas.
 *  - Se empieza a arrastrar al pasar `UMBRAL_ARRASTRE_PX`: un toque normal no lo activa y sigue
 *    siendo un `click`. Si el navegador toma el gesto para desplazar la página (`pointercancel`),
 *    se cancela sin efecto.
 *  - Soltar donde no hay ningún elemento de la otra columna no hace nada (ni fallo ni acierto).
 *  - Tras un arrastre real se suprime el `click` que el navegador pueda disparar sobre el elemento
 *    de origen, para que no cuente como un toque más.
 *  - Sin temporizadores: la supresión del clic usa una marca de tiempo.
 */
import { onScopeDispose, ref, shallowRef } from 'vue';
import type { Columna } from './logica';

/** Cuánto hay que mover el puntero (px CSS) para que un toque pase a ser un arrastre. */
export const UMBRAL_ARRASTRE_PX = 8;
/** Margen (px CSS) alrededor de cada elemento al buscar sobre cuál se soltó. */
export const MARGEN_OBJETIVO_PX = 6;
/** Tiempo (ms) durante el que se ignora el `click` posterior a un arrastre. */
const VENTANA_CLIC_MS = 400;

export interface ItemArrastre {
  columna: Columna;
  id: string;
}

export interface OpcionesArrastrePares {
  /** ¿Se puede empezar a arrastrar ahora? (modo `jugar` y sin resultado final). */
  activo: () => boolean;
  /** Elemento de la columna contraria bajo el punto (x, y) de la ventana, o `null`. */
  objetivoEn: (x: number, y: number, origen: ItemArrastre) => ItemArrastre | null;
  /** Se soltó `origen` sobre `destino`. */
  alSoltar: (origen: ItemArrastre, destino: ItemArrastre) => void;
}

export function useArrastrePares(opciones: OpcionesArrastrePares) {
  /** El elemento que se está arrastrando (solo cuando ya superó el umbral). */
  const origen = shallowRef<ItemArrastre | null>(null);
  const puntero = ref({ x: 0, y: 0 });
  const sobre = shallowRef<ItemArrastre | null>(null);

  let presionado: { item: ItemArrastre; pointerId: number; x: number; y: number } | null = null;
  let escuchando = false;
  let suprimirClicHasta = 0;

  function quitarEscuchas(): void {
    if (!escuchando) return;
    escuchando = false;
    window.removeEventListener('pointermove', alMover);
    window.removeEventListener('pointerup', alSoltar);
    window.removeEventListener('pointercancel', alCancelar);
  }

  function limpiar(): void {
    quitarEscuchas();
    presionado = null;
    origen.value = null;
    sobre.value = null;
  }

  function alMover(evento: PointerEvent): void {
    if (!presionado || evento.pointerId !== presionado.pointerId) return;
    if (!origen.value) {
      const distancia = Math.hypot(evento.clientX - presionado.x, evento.clientY - presionado.y);
      if (distancia < UMBRAL_ARRASTRE_PX) return;
      origen.value = presionado.item;
    }
    puntero.value = { x: evento.clientX, y: evento.clientY };
    sobre.value = opciones.objetivoEn(evento.clientX, evento.clientY, presionado.item);
  }

  function alSoltar(evento: PointerEvent): void {
    if (!presionado || evento.pointerId !== presionado.pointerId) return;
    const item = presionado.item;
    const arrastrando = origen.value !== null;
    const destino = arrastrando ? opciones.objetivoEn(evento.clientX, evento.clientY, item) : null;
    limpiar();
    if (!arrastrando) return;
    suprimirClicHasta = Date.now() + VENTANA_CLIC_MS;
    if (destino) opciones.alSoltar(item, destino);
  }

  function alCancelar(evento: PointerEvent): void {
    if (!presionado || evento.pointerId !== presionado.pointerId) return;
    limpiar();
  }

  /** `pointerdown` sobre un elemento de una columna. */
  function alPresionar(evento: PointerEvent, item: ItemArrastre): void {
    if (!opciones.activo()) return;
    if (evento.pointerType === 'mouse' && evento.button !== 0) return;
    if (evento.isPrimary === false) return;
    limpiar();
    presionado = {
      item,
      pointerId: evento.pointerId,
      x: evento.clientX,
      y: evento.clientY,
    };
    escuchando = true;
    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltar);
    window.addEventListener('pointercancel', alCancelar);
  }

  /**
   * ¿Este `click` es el eco de un arrastre que acaba de terminar? Si lo es, se consume la marca y
   * el componente lo ignora.
   */
  function consumirClicSuprimido(): boolean {
    if (suprimirClicHasta === 0) return false;
    const vigente = Date.now() < suprimirClicHasta;
    suprimirClicHasta = 0;
    return vigente;
  }

  onScopeDispose(limpiar);

  return { origen, puntero, sobre, alPresionar, cancelar: limpiar, consumirClicSuprimido };
}
