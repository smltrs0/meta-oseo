import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { useContextoStore } from '@/stores/contextoPedagogico';
import { useProgresoStore } from '@/stores/progreso';
import { respuestaError, respuestaJson, tokenResponse, usuarioDePrueba } from '@/test/utils';
import { useAuthStore } from './auth';

const fetchMock = vi.fn<typeof fetch>();

function cuerpoEnviado(llamada = 0): unknown {
  return JSON.parse(String(fetchMock.mock.calls[llamada]![1]?.body));
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('store auth: login', () => {
  it('login ok: guarda token en localStorage, usuario y sincroniza el nivel', async () => {
    const ana = usuarioDePrueba({ nivel: 'posgrado' });
    fetchMock.mockResolvedValueOnce(respuestaJson(200, tokenResponse(ana, 'tok-1')));
    const auth = useAuthStore();

    const devuelto = await auth.login('CC', '1.023.456-789');

    expect(devuelto).toEqual(ana);
    expect(auth.usuario).toEqual(ana);
    expect(auth.token).toBe('tok-1');
    expect(auth.isAuthenticated).toBe(true);
    expect(localStorage.getItem('ova.token')).toBe('tok-1');
    expect(useContextoStore().nivel).toBe('posgrado');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/login');
    expect(init?.method).toBe('POST');
    // Se envía normalizado y con los nombres de campo del contrato.
    expect(cuerpoEnviado()).toEqual({
      tipo_identificacion: 'CC',
      numero_identificacion: '1023456789',
    });
  });

  it('login 404: lanza ApiError usuario_no_encontrado y no deja sesión', async () => {
    fetchMock.mockResolvedValueOnce(respuestaError(404, 'usuario_no_encontrado'));
    const auth = useAuthStore();

    const err = await auth.login('CC', '1023456789').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: 'usuario_no_encontrado' });
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.token).toBeNull();
    expect(localStorage.getItem('ova.token')).toBeNull();
  });
});

describe('store auth: register', () => {
  it('envía nombre, apellido, tipo y número normalizado; guarda la sesión', async () => {
    const nueva = usuarioDePrueba({ id: 7, nombre: 'Luis', apellido: 'Gómez' });
    fetchMock.mockResolvedValueOnce(respuestaJson(201, tokenResponse(nueva, 'tok-7')));
    const auth = useAuthStore();

    await auth.register({ nombre: 'Luis', apellido: 'Gómez', tipo: 'PA', numero: 'ab-1234' });

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/register');
    expect(cuerpoEnviado()).toEqual({
      nombre: 'Luis',
      apellido: 'Gómez',
      tipo_identificacion: 'PA',
      numero_identificacion: 'AB1234',
    });
    expect(auth.usuario?.id).toBe(7);
    expect(auth.token).toBe('tok-7');
    expect(localStorage.getItem('ova.token')).toBe('tok-7');
  });

  it('register 409 lanza ApiError usuario_existente', async () => {
    fetchMock.mockResolvedValueOnce(respuestaError(409, 'usuario_existente'));
    const auth = useAuthStore();
    await expect(
      auth.register({ nombre: 'A', apellido: 'B', tipo: 'CC', numero: '1234' }),
    ).rejects.toMatchObject({ status: 409, code: 'usuario_existente' });
    expect(auth.isAuthenticated).toBe(false);
  });
});

describe('store auth: logout', () => {
  it('borra token, usuario y localStorage, y reinicia progreso y contexto', async () => {
    fetchMock.mockResolvedValueOnce(respuestaJson(200, tokenResponse()));
    const auth = useAuthStore();
    await auth.login('CC', '1023456789');
    const progreso = useProgresoStore();
    const contexto = useContextoStore();
    progreso.puntajeTotal = 300;
    contexto.setModulo(4);
    contexto.registrarInteraccion('abrio_ficha');

    auth.logout();

    expect(auth.token).toBeNull();
    expect(auth.usuario).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(localStorage.getItem('ova.token')).toBeNull();
    expect(progreso.puntajeTotal).toBe(0);
    expect(contexto.modulo).toBe(1);
    expect(contexto.interaccionesRecientes).toEqual([]);
  });
});

describe('store auth: restore', () => {
  it('sin token devuelve false y no llama a la API', async () => {
    const auth = useAuthStore();
    await expect(auth.restore()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('con token válido pide GET /api/me con Authorization y deja al usuario', async () => {
    localStorage.setItem('ova.token', 'guardado');
    setActivePinia(createPinia());
    fetchMock.mockResolvedValueOnce(respuestaJson(200, usuarioDePrueba({ nombre: 'Marta' })));
    const auth = useAuthStore();
    expect(auth.token).toBe('guardado');

    await expect(auth.restore()).resolves.toBe(true);

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/me');
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get('Authorization')).toBe(
      'Bearer guardado',
    );
    expect(auth.usuario?.nombre).toBe('Marta');
    expect(auth.isAuthenticated).toBe(true);
  });

  it('con token inválido (401) cierra la sesión y devuelve false', async () => {
    localStorage.setItem('ova.token', 'malo');
    setActivePinia(createPinia());
    fetchMock.mockResolvedValueOnce(respuestaError(401, 'token_invalido'));
    const auth = useAuthStore();

    await expect(auth.restore()).resolves.toBe(false);

    expect(auth.token).toBeNull();
    expect(auth.usuario).toBeNull();
    expect(localStorage.getItem('ova.token')).toBeNull();
    expect(auth.errorSesion).toBeNull();
  });

  it('con la red caída devuelve false pero conserva el token y deja un aviso', async () => {
    localStorage.setItem('ova.token', 'guardado');
    setActivePinia(createPinia());
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const auth = useAuthStore();

    await expect(auth.restore()).resolves.toBe(false);

    expect(auth.token).toBe('guardado');
    expect(localStorage.getItem('ova.token')).toBe('guardado');
    expect(auth.errorSesion).toMatch(/comprobar tu sesión/);
  });

  it('llamadas simultáneas comparten una sola petición', async () => {
    localStorage.setItem('ova.token', 'guardado');
    setActivePinia(createPinia());
    fetchMock.mockImplementation(() => Promise.resolve(respuestaJson(200, usuarioDePrueba())));
    const auth = useAuthStore();

    const [a, b] = await Promise.all([auth.restore(), auth.restore()]);

    expect([a, b]).toEqual([true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('store auth: tolerancia a localStorage', () => {
  it('si localStorage lanza, la app sigue y la sesión vive en memoria', async () => {
    const lanzar = () => {
      throw new DOMException('bloqueado', 'SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: lanzar, setItem: lanzar, removeItem: lanzar });
    setActivePinia(createPinia());
    fetchMock.mockResolvedValueOnce(respuestaJson(200, tokenResponse()));

    const auth = useAuthStore();
    expect(auth.token).toBeNull();
    await auth.login('CC', '1023456789');
    expect(auth.isAuthenticated).toBe(true);
    expect(() => auth.logout()).not.toThrow();
  });
});

describe('store auth: actualizarNivel', () => {
  it('PATCH /api/me con el nivel y lo refleja en el contexto', async () => {
    const auth = useAuthStore();
    auth.token = 't';
    fetchMock.mockResolvedValueOnce(respuestaJson(200, usuarioDePrueba({ nivel: 'posgrado' })));

    await auth.actualizarNivel('posgrado');

    expect(fetchMock.mock.calls[0]![1]?.method).toBe('PATCH');
    expect(cuerpoEnviado()).toEqual({ nivel: 'posgrado' });
    expect(auth.usuario?.nivel).toBe('posgrado');
    expect(useContextoStore().nivel).toBe('posgrado');
  });
});
