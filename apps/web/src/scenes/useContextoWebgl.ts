/**
 * Vigila la pérdida del contexto WebGL del lienzo de TresJS (memoria de la GPU agotada, cambio de
 * pestaña en algunos móviles) y permite recrear el lienzo. Lo comparten las escenas 3D.
 *
 * `alEstarListo` se pasa a `@ready` del <TresCanvas>. `claveLienzo` va en su `:key`: cambiarla vuelve
 * a crear el lienzo con la misma geometría. Las escuchas se retiran al desmontar.
 */
import { onBeforeUnmount, ref } from 'vue';
import type { Ref } from 'vue';
import type { TresContext } from '@tresjs/core';

export interface ContextoWebgl {
  contextoPerdido: Ref<boolean>;
  claveLienzo: Ref<number>;
  alEstarListo: (ctx: TresContext) => void;
  /** Recrea el lienzo tras perder el contexto. */
  recuperar: () => void;
  /** Retira las escuchas del lienzo actual. */
  soltar: () => void;
}

export function useContextoWebgl(): ContextoWebgl {
  const contextoPerdido = ref(false);
  const claveLienzo = ref(0);
  let lienzoEscuchado: HTMLCanvasElement | null = null;

  const alPerder = (): void => {
    contextoPerdido.value = true;
  };
  const alRecuperar = (): void => {
    contextoPerdido.value = false;
  };

  function soltar(): void {
    lienzoEscuchado?.removeEventListener('webglcontextlost', alPerder);
    lienzoEscuchado?.removeEventListener('webglcontextrestored', alRecuperar);
    lienzoEscuchado = null;
  }

  function alEstarListo(ctx: TresContext): void {
    soltar();
    const lienzo = ctx.renderer.instance.domElement;
    if (!(lienzo instanceof HTMLCanvasElement)) return;
    lienzo.addEventListener('webglcontextlost', alPerder);
    lienzo.addEventListener('webglcontextrestored', alRecuperar);
    lienzoEscuchado = lienzo;
  }

  function recuperar(): void {
    contextoPerdido.value = false;
    claveLienzo.value += 1;
  }

  onBeforeUnmount(soltar);

  return { contextoPerdido, claveLienzo, alEstarListo, recuperar, soltar };
}
