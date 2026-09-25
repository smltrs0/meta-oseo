/**
 * Geometría de la hoja del mentor, en una función pura para poder probarla sin navegador
 * (happy-dom descarta unidades como `dvh` y funciones como `min()` en los estilos en línea).
 *
 * Se aplica como estilo en línea porque gana a las clases de posición de la hoja de shadcn
 * (`inset-y-0 h-full w-3/4 sm:max-w-sm`...) sin depender del orden en que Tailwind las emite.
 */
import type { MedidasViewport } from './useVisualViewport';

export type EstiloHoja = Record<string, string>;

export function estiloDeLaHoja(escritorio: boolean, teclado: MedidasViewport | null): EstiloHoja {
  if (escritorio) {
    // Panel lateral derecho bajo la cabecera del shell (--altura-cabecera, ver style.css).
    return {
      top: 'calc(var(--altura-cabecera) + var(--area-segura-arriba) + 1px)',
      bottom: '0',
      height: 'auto',
      width: 'min(26rem, calc(100vw - 6rem))',
      maxWidth: 'none',
    };
  }
  if (teclado) {
    // Teclado virtual abierto: la hoja se apoya sobre el teclado y usa solo el alto visible.
    return {
      height: `${Math.max(teclado.altura - 8, 200)}px`,
      bottom: `${teclado.desplazamientoInferior}px`,
    };
  }
  // Casi pantalla completa; `dvh` sigue a la barra de direcciones del móvil.
  return { height: '92dvh' };
}
