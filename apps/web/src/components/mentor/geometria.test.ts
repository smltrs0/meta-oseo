import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { estiloDeLaHoja } from './geometria';
import { UMBRAL_TECLADO_PX, medirViewport, useVisualViewport } from './useVisualViewport';

describe('estiloDeLaHoja', () => {
  it('escritorio: panel bajo la cabecera, 26 rem de ancho y sin tope de max-width', () => {
    const estilo = estiloDeLaHoja(true, null);
    expect(estilo.top).toContain('var(--altura-cabecera)');
    expect(estilo.top).toContain('var(--area-segura-arriba)');
    expect(estilo).toMatchObject({ bottom: '0', height: 'auto', maxWidth: 'none' });
    expect(estilo.width).toContain('26rem');
  });

  it('el teclado no cambia el panel de escritorio', () => {
    expect(estiloDeLaHoja(true, { altura: 300, desplazamientoInferior: 400 })).toEqual(
      estiloDeLaHoja(true, null),
    );
  });

  it('móvil sin teclado: 92 dvh', () => {
    expect(estiloDeLaHoja(false, null)).toEqual({ height: '92dvh' });
  });

  it('móvil con teclado: se apoya sobre el teclado y usa el alto visible', () => {
    expect(estiloDeLaHoja(false, { altura: 420, desplazamientoInferior: 310 })).toEqual({
      height: '412px',
      bottom: '310px',
    });
  });

  it('móvil con teclado y pantalla muy baja: no baja de 200 px', () => {
    expect(estiloDeLaHoja(false, { altura: 150, desplazamientoInferior: 500 }).height).toBe(
      '200px',
    );
  });
});

describe('medirViewport', () => {
  const vv = (height: number, offsetTop = 0, scale = 1) => ({ height, offsetTop, scale });

  it('sin visualViewport devuelve null', () => {
    expect(medirViewport(null, 800)).toBeNull();
    expect(medirViewport(undefined, 800)).toBeNull();
  });

  it('sin teclado (visible == layout) devuelve null', () => {
    expect(medirViewport(vv(800), 800)).toBeNull();
  });

  it('una barra de direcciones que se oculta (pocos px) no cuenta como teclado', () => {
    expect(medirViewport(vv(800 - (UMBRAL_TECLADO_PX - 1)), 800)).toBeNull();
  });

  it('con teclado: altura visible y cuánto subir el borde inferior', () => {
    expect(medirViewport(vv(500), 800)).toEqual({ altura: 500, desplazamientoInferior: 300 });
  });

  it('cuenta el desplazamiento del viewport visual (iOS desplaza la página)', () => {
    // Layout 800, visible 450 desde y=120: el borde inferior visible queda en 570 -> 230 sobre el layout.
    expect(medirViewport(vv(450, 120), 800)).toEqual({ altura: 450, desplazamientoInferior: 230 });
  });

  it('con zoom de pellizco se ignora', () => {
    expect(medirViewport(vv(400, 0, 2), 800)).toBeNull();
  });
});

describe('useVisualViewport', () => {
  class VisualViewportFalso extends EventTarget {
    height = 800;
    offsetTop = 0;
    scale = 1;
  }

  it('se suscribe solo mientras está activo y responde a los cambios del teclado', async () => {
    const falso = new VisualViewportFalso();
    vi.stubGlobal('visualViewport', falso);
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: falso });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      configurable: true,
      value: 800,
    });
    const activo = ref(false);
    const scope = effectScope();
    const medidas = scope.run(() => useVisualViewport(activo))!;

    expect(medidas.value).toBeNull();
    activo.value = true;
    await nextTick();
    expect(medidas.value).toBeNull(); // aún sin teclado

    falso.height = 450; // aparece el teclado
    falso.dispatchEvent(new Event('resize'));
    expect(medidas.value).toEqual({ altura: 450, desplazamientoInferior: 350 });

    falso.height = 800; // se oculta
    falso.dispatchEvent(new Event('resize'));
    expect(medidas.value).toBeNull();

    activo.value = false;
    await nextTick();
    falso.height = 450;
    falso.dispatchEvent(new Event('resize'));
    expect(medidas.value).toBeNull(); // ya no escucha

    scope.stop();
  });
});
