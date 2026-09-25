/**
 * Ajuste de la hoja del chat al teclado virtual del móvil.
 *
 * Un elemento `position: fixed; bottom: 0` se ancla al viewport de LAYOUT, que en Android e iOS
 * no se encoge cuando aparece el teclado: el campo de texto quedaría tapado. El viewport VISUAL
 * (`window.visualViewport`) sí refleja el área realmente visible. Este composable calcula, solo
 * cuando hay teclado, la altura visible y cuánto hay que subir el borde inferior de la hoja.
 *
 * Devuelve `null` (no tocar nada, la hoja usa su altura por defecto) cuando:
 *  - el navegador no soporta `visualViewport`,
 *  - el usuario tiene zoom con pellizco (las medidas dejan de ser comparables),
 *  - la diferencia es pequeña (barra de direcciones que se oculta, no un teclado).
 */
import type { Ref } from 'vue';
import { onScopeDispose, ref, watch } from 'vue';

export interface MedidasViewport {
  /** Alto visible en px. */
  altura: number;
  /** Cuánto subir el borde inferior de un elemento fixed para quedar sobre el teclado (px). */
  desplazamientoInferior: number;
}

/** Diferencia mínima entre layout y visible para considerar que hay un teclado. */
export const UMBRAL_TECLADO_PX = 120;

export function medirViewport(
  vv: Pick<VisualViewport, 'height' | 'offsetTop' | 'scale'> | null | undefined,
  alturaLayout: number,
): MedidasViewport | null {
  if (!vv || Math.abs(vv.scale - 1) > 0.01) return null;
  const inferior = Math.round(alturaLayout - (vv.offsetTop + vv.height));
  if (inferior < UMBRAL_TECLADO_PX) return null;
  return { altura: Math.round(vv.height), desplazamientoInferior: inferior };
}

export function useVisualViewport(activo: Ref<boolean>): Ref<MedidasViewport | null> {
  const medidas = ref<MedidasViewport | null>(null);
  let vv: VisualViewport | null = null;

  function actualizar(): void {
    medidas.value = medirViewport(vv, document.documentElement.clientHeight);
  }

  function desuscribir(): void {
    vv?.removeEventListener('resize', actualizar);
    vv?.removeEventListener('scroll', actualizar);
    vv = null;
    medidas.value = null;
  }

  watch(
    activo,
    (encendido) => {
      desuscribir();
      if (!encendido || typeof window === 'undefined' || !window.visualViewport) return;
      vv = window.visualViewport;
      vv.addEventListener('resize', actualizar);
      vv.addEventListener('scroll', actualizar);
      actualizar();
    },
    { immediate: true },
  );

  onScopeDispose(desuscribir);
  return medidas;
}
