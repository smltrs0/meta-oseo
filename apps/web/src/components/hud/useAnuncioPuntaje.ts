/**
 * Mensaje para la región `aria-live="polite"` del HUD cuando cambia el puntaje.
 *
 * Para no ser ruidoso:
 *  - no anuncia la carga inicial ni el cierre de sesión (solo cambios con datos ya cargados);
 *  - agrupa los cambios seguidos en un único mensaje (espera 0.8 s de calma);
 *  - dice cuántos puntos se sumaron y el total, en una sola frase corta.
 */
import { onScopeDispose, ref, watch } from 'vue';
import type { Ref } from 'vue';

export const ESPERA_ANUNCIO_MS = 800;

function plural(n: number): string {
  return n === 1 ? 'punto' : 'puntos';
}

/** Frase que se anuncia; `delta` son los puntos ganados desde el último anuncio. */
export function textoAnuncio(total: number, delta: number): string {
  if (delta > 0) return `Sumaste ${delta} ${plural(delta)}. Puntaje total: ${total}.`;
  return `Puntaje total: ${total} ${plural(total)}.`;
}

export function useAnuncioPuntaje(
  puntaje: Readonly<Ref<number>>,
  cargado: Readonly<Ref<boolean>>,
): Readonly<Ref<string>> {
  const anuncio = ref('');
  // Último valor ya anunciado (o el de la carga inicial). `null` = aún sin datos.
  let base: number | null = cargado.value ? puntaje.value : null;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  function cancelar(): void {
    clearTimeout(temporizador);
    temporizador = undefined;
  }

  watch([puntaje, cargado], ([nuevo, ahoraCargado]) => {
    if (!ahoraCargado) {
      // Sin sesión o sin datos: se olvida todo para que la próxima carga no anuncie nada.
      cancelar();
      base = null;
      anuncio.value = '';
      return;
    }
    if (base === null) {
      base = nuevo;
      return;
    }
    cancelar();
    if (nuevo === base) return;
    temporizador = setTimeout(() => {
      temporizador = undefined;
      anuncio.value = textoAnuncio(nuevo, nuevo - (base ?? nuevo));
      base = nuevo;
    }, ESPERA_ANUNCIO_MS);
  });

  onScopeDispose(cancelar);
  return anuncio;
}
