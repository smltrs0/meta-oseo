import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aplicarTema, iniciarTema } from './tema';

describe('tema claro/oscuro', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('aplicarTema añade y quita la clase dark de <html>', () => {
    aplicarTema(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    aplicarTema(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('iniciarTema sigue la preferencia del sistema y reacciona a sus cambios', () => {
    let alCambiar: ((e: MediaQueryListEvent) => void) | null = null;
    const consulta = {
      matches: true,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => (alCambiar = cb),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => consulta),
    );

    const detener = iniciarTema();
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    alCambiar!({ matches: false } as MediaQueryListEvent);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    detener();
    expect(consulta.removeEventListener).toHaveBeenCalledOnce();
  });

  it('claro por defecto: si el sistema no pide oscuro, no se añade la clase', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    iniciarTema();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
