import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { respuestaError, respuestaJson, tokenResponse, usuarioDePrueba } from '@/test/utils';
import { useAuthStore } from '@/stores/auth';
import {
  ApiError,
  MENSAJE_SIN_CONEXION,
  apiFetch,
  apiFetchRaw,
  interpretarError,
  leerApiError,
} from './api';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('ApiError: errores del contrato', () => {
  it('lee {detail: {code, message}} y conserva el mensaje en español del servidor', async () => {
    const err = await leerApiError(
      respuestaError(404, 'usuario_no_encontrado', 'No existe un usuario con esa identificación'),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.code).toBe('usuario_no_encontrado');
    expect(err.message).toBe('No existe un usuario con esa identificación');
    expect(err.name).toBe('ApiError');
  });

  it.each([
    [401, 'token_invalido'],
    [409, 'usuario_existente'],
    [429, 'demasiados_intentos'],
    [503, 'ia_no_configurada'],
  ])('reconoce el código %i %s', async (status, code) => {
    const err = await leerApiError(respuestaError(status, code));
    expect([err.status, err.code]).toEqual([status, code]);
  });

  it('usa un mensaje por defecto si el servidor no manda message', () => {
    const err = interpretarError(429, { detail: { code: 'demasiados_intentos' } });
    expect(err.code).toBe('demasiados_intentos');
    expect(err.message).toMatch(/Demasiados intentos/);
  });
});

describe('ApiError: 422 de FastAPI (detail es una lista)', () => {
  const cuerpo422 = {
    detail: [
      {
        type: 'string_too_short',
        loc: ['body', 'numero_identificacion'],
        msg: 'String should have at least 4 characters',
        input: '1',
      },
      { type: 'missing', loc: ['body', 'nombre'], msg: 'Field required' },
    ],
  };

  it('genera code "validacion", mensaje en español y mapa de campos', async () => {
    const err = await leerApiError(respuestaJson(422, cuerpo422));
    expect(err.status).toBe(422);
    expect(err.code).toBe('validacion');
    expect(err.message).toMatch(/no son válidos/);
    // El mensaje en inglés de pydantic no se muestra al estudiante, pero se conserva por campo.
    expect(err.message).not.toMatch(/should have/i);
    expect(err.campos).toEqual({
      numero_identificacion: 'String should have at least 4 characters',
      nombre: 'Field required',
    });
  });

  it('tolera elementos malformados en la lista', () => {
    const err = interpretarError(422, { detail: [null, 'x', { loc: 'body' }, { loc: [0, 1] }] });
    expect(err.code).toBe('validacion');
    expect(err.campos).toEqual({});
  });
});

describe('ApiError: respuestas que no siguen el contrato', () => {
  it('cuerpo con detail de texto (404 por defecto de FastAPI)', async () => {
    const err = await leerApiError(respuestaJson(404, { detail: 'Not Found' }));
    expect(err.code).toBe('no_encontrado');
    expect(err.message).not.toMatch(/Not Found/);
  });

  it('cuerpo HTML de un proxy (502) y cuerpo vacío (500)', async () => {
    const html = await leerApiError(new Response('<html>Bad gateway</html>', { status: 502 }));
    expect(html.status).toBe(502);
    expect(html.code).toBe('error_servidor');
    expect(html.message).toMatch(/no está disponible/);
    const vacio = await leerApiError(new Response(null, { status: 500 }));
    expect(vacio.code).toBe('error_servidor');
  });

  it('estado no previsto -> error_desconocido', () => {
    expect(interpretarError(418, null).code).toBe('error_desconocido');
  });
});

describe('apiFetch / apiFetchRaw', () => {
  it('llama a /api, envía JSON y devuelve el cuerpo interpretado', async () => {
    fetchMock.mockResolvedValueOnce(respuestaJson(200, { status: 'ok' }));
    const datos = await apiFetch<{ status: string }>('/health');
    expect(datos).toEqual({ status: 'ok' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/health');
    expect(new Headers(init?.headers).get('Accept')).toBe('application/json');
  });

  it('serializa el cuerpo a JSON y pone Content-Type', async () => {
    fetchMock.mockResolvedValueOnce(respuestaJson(200, {}));
    await apiFetch('/me', { method: 'PATCH', body: { nivel: 'posgrado' } });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe('{"nivel":"posgrado"}');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
  });

  it('agrega Authorization desde el store de auth cuando hay token', async () => {
    const auth = useAuthStore();
    auth.token = 'abc.def.ghi';
    fetchMock.mockResolvedValueOnce(respuestaJson(200, {}));
    await apiFetch('/me');
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get('Authorization')).toBe(
      'Bearer abc.def.ghi',
    );
  });

  it('no envía Authorization si auth es false (login) ni si no hay token', async () => {
    const auth = useAuthStore();
    auth.token = 'abc';
    // Una Response nueva por llamada: su cuerpo solo se puede leer una vez.
    fetchMock.mockImplementation(() => Promise.resolve(respuestaJson(200, {})));
    await apiFetch('/auth/login', { method: 'POST', body: {}, auth: false });
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).has('Authorization')).toBe(false);
    auth.token = null;
    await apiFetch('/me');
    expect(new Headers(fetchMock.mock.calls[1]![1]?.headers).has('Authorization')).toBe(false);
  });

  it('lanza ApiError con el código del contrato en respuestas no 2xx', async () => {
    fetchMock.mockResolvedValueOnce(respuestaError(409, 'usuario_existente'));
    await expect(apiFetch('/auth/register', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 409,
      code: 'usuario_existente',
    });
  });

  it('un fallo de red se convierte en ApiError {status 0, code "red"}', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const err = await apiFetch('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: 'red', message: MENSAJE_SIN_CONEXION });
  });

  it('un AbortError pasa sin convertirse (cancelar no es un error para el usuario)', async () => {
    const abortar = new DOMException('Aborted', 'AbortError');
    fetchMock.mockRejectedValueOnce(abortar);
    await expect(apiFetchRaw('/chat', { method: 'POST', body: {} })).rejects.toBe(abortar);
  });

  it('respuesta 200 con cuerpo que no es JSON -> ApiError respuesta_invalida', async () => {
    fetchMock.mockResolvedValueOnce(new Response('no es json', { status: 200 }));
    await expect(apiFetch('/health')).rejects.toMatchObject({ code: 'respuesta_invalida' });
  });

  it('204 devuelve undefined', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(apiFetch('/algo', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('apiFetchRaw devuelve la Response sin lanzar en errores HTTP (lo decide el llamador)', async () => {
    fetchMock.mockResolvedValueOnce(respuestaError(503, 'ia_no_configurada'));
    const res = await apiFetchRaw('/chat', {
      method: 'POST',
      body: { messages: [] },
      headers: { Accept: 'text/event-stream' },
    });
    expect(res.status).toBe(503);
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get('Accept')).toBe(
      'text/event-stream',
    );
    const err = await leerApiError(res);
    expect(err.code).toBe('ia_no_configurada');
  });
});

describe('401 cierra la sesión', () => {
  it('si la petición llevaba token: logout, y apiFetch lanza ApiError 401', async () => {
    const auth = useAuthStore();
    auth.token = 'vencido';
    auth.establecerUsuario(usuarioDePrueba());
    fetchMock.mockResolvedValueOnce(respuestaError(401, 'token_invalido'));

    await expect(apiFetch('/progress')).rejects.toMatchObject({
      status: 401,
      code: 'token_invalido',
    });
    expect(auth.token).toBeNull();
    expect(auth.usuario).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(localStorage.getItem('ova.token')).toBeNull();
  });

  it('también con apiFetchRaw (el chat)', async () => {
    const auth = useAuthStore();
    auth.token = 'vencido';
    fetchMock.mockResolvedValueOnce(respuestaError(401, 'token_invalido'));
    const res = await apiFetchRaw('/chat', { method: 'POST', body: {} });
    expect(res.status).toBe(401);
    expect(auth.token).toBeNull();
  });

  it('un 401 en una petición sin token (p. ej. login) no toca la sesión', async () => {
    const auth = useAuthStore();
    auth.establecerUsuario(usuarioDePrueba());
    fetchMock.mockResolvedValueOnce(respuestaError(401, 'token_invalido'));
    await expect(
      apiFetch('/auth/login', { method: 'POST', body: {}, auth: false }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(auth.usuario).not.toBeNull();
  });

  it('con un 200 la sesión se mantiene', async () => {
    const auth = useAuthStore();
    auth.token = 'bueno';
    fetchMock.mockResolvedValueOnce(respuestaJson(200, tokenResponse()));
    await apiFetch('/me');
    expect(auth.token).toBe('bueno');
  });
});
