import { describe, expect, it, vi } from 'vitest';
import { hayWebGL2 } from './webgl';

/** Documento mínimo cuyo lienzo devuelve lo que se indique al pedir el contexto. */
function documentoCon(getContext: (tipo: string) => unknown): Document {
  return { createElement: () => ({ getContext }) } as unknown as Document;
}

describe('hayWebGL2', () => {
  it('es true si el navegador da un contexto WebGL 2, y lo libera de inmediato', () => {
    const loseContext = vi.fn();
    const gl = { getExtension: vi.fn(() => ({ loseContext })) };
    const getContext = vi.fn(() => gl);

    expect(hayWebGL2(documentoCon(getContext))).toBe(true);
    expect(getContext).toHaveBeenCalledWith('webgl2');
    expect(gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('solo consulta WebGL 2 (three.js ya no funciona con WebGL 1)', () => {
    const getContext = vi.fn(() => null);
    expect(hayWebGL2(documentoCon(getContext))).toBe(false);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(getContext).not.toHaveBeenCalledWith('webgl');
  });

  it('sigue siendo true si el contexto no ofrece la extensión de liberación', () => {
    const gl = { getExtension: () => null };
    expect(hayWebGL2(documentoCon(() => gl))).toBe(true);
  });

  it('es false si crear el contexto lanza una excepción', () => {
    expect(
      hayWebGL2(
        documentoCon(() => {
          throw new Error('bloqueado por la política del navegador');
        }),
      ),
    ).toBe(false);
  });

  it('en jsdom/happy-dom (sin WebGL real) devuelve false sin lanzar', () => {
    expect(hayWebGL2()).toBe(false);
  });
});
