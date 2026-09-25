import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { respuestaError, respuestaJson, usuarioDePrueba } from '@/test/utils';
import { crearRouter, vigilarSesion } from '.';
import { destinoSeguro } from './guard';

const fetchMock = vi.fn<typeof fetch>();

function nuevoRouter() {
  return crearRouter(createMemoryHistory());
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('guard: sin sesión', () => {
  it('redirige a /acceso desde el inicio, sin parámetro de retorno', async () => {
    const router = nuevoRouter();
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('acceso');
    expect(router.currentRoute.value.fullPath).toBe('/acceso');
  });

  it('redirige desde un módulo y recuerda a dónde iba', async () => {
    const router = nuevoRouter();
    await router.push('/modulo/3');
    expect(router.currentRoute.value.name).toBe('acceso');
    expect(router.currentRoute.value.query.redirect).toBe('/modulo/3');
  });

  it('redirige también /demo-mandibula', async () => {
    const router = nuevoRouter();
    await router.push('/demo-mandibula');
    expect(router.currentRoute.value.name).toBe('acceso');
  });

  it('/acceso y el 404 son públicas', async () => {
    const router = nuevoRouter();
    await router.push('/acceso');
    expect(router.currentRoute.value.name).toBe('acceso');
    await router.push('/no-existe');
    expect(router.currentRoute.value.name).toBe('no_encontrado');
  });

  it('/modulo/7 y /modulo/abc caen en el 404 (n solo de 1 a 6)', async () => {
    const router = nuevoRouter();
    expect(router.resolve('/modulo/7').name).toBe('no_encontrado');
    expect(router.resolve('/modulo/0').name).toBe('no_encontrado');
    expect(router.resolve('/modulo/abc').name).toBe('no_encontrado');
    expect(router.resolve('/modulo/6').name).toBe('modulo');
    expect(router.resolve('/modulo/1').name).toBe('modulo');
  });
});

describe('guard: con sesión', () => {
  beforeEach(() => {
    useAuthStore().establecerUsuario(usuarioDePrueba());
  });

  it('permite el inicio, los módulos y la demo', async () => {
    const router = nuevoRouter();
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('inicio');
    await router.push('/modulo/4');
    expect(router.currentRoute.value.name).toBe('modulo');
    expect(router.currentRoute.value.params.n).toBe('4');
    await router.push('/demo-mandibula');
    expect(router.currentRoute.value.name).toBe('demo_mandibula');
  });

  it('/acceso redirige a /', async () => {
    const router = nuevoRouter();
    await router.push('/acceso');
    expect(router.currentRoute.value.name).toBe('inicio');
    expect(router.currentRoute.value.fullPath).toBe('/');
  });

  it('/acceso?redirect=/modulo/2 vuelve al destino pedido; un destino externo se ignora', async () => {
    const router = nuevoRouter();
    await router.push('/acceso?redirect=/modulo/2');
    expect(router.currentRoute.value.fullPath).toBe('/modulo/2');
    await router.push('/acceso?redirect=https://malo.example');
    expect(router.currentRoute.value.fullPath).toBe('/');
    await router.push('/acceso?redirect=//malo.example');
    expect(router.currentRoute.value.fullPath).toBe('/');
  });

  it('no llama a /api/me si el usuario ya está cargado', async () => {
    const router = nuevoRouter();
    await router.push('/');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('guard: token guardado (recarga de la página)', () => {
  it('valida el token con GET /api/me y deja pasar', async () => {
    localStorage.setItem('ova.token', 'guardado');
    setActivePinia(createPinia());
    fetchMock.mockResolvedValueOnce(respuestaJson(200, usuarioDePrueba()));
    const router = nuevoRouter();

    await router.push('/modulo/2');

    // El guard de módulo también pide el progreso; aquí solo importa que /api/me se valida una vez.
    const llamadasMe = fetchMock.mock.calls.filter(([url]) => url === '/api/me');
    expect(llamadasMe).toHaveLength(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/me');
    expect(router.currentRoute.value.name).toBe('modulo');
  });

  it('con token vencido redirige a /acceso y borra el token', async () => {
    localStorage.setItem('ova.token', 'vencido');
    setActivePinia(createPinia());
    fetchMock.mockResolvedValueOnce(respuestaError(401, 'token_invalido'));
    const router = nuevoRouter();

    await router.push('/');

    expect(router.currentRoute.value.name).toBe('acceso');
    expect(localStorage.getItem('ova.token')).toBeNull();
  });
});

describe('guard: modo desarrollo sin backend (VITE_DEV_BYPASS_AUTH)', () => {
  it('en DEV con la variable en "true": sesión ficticia y SIN llamar a /api/me', async () => {
    vi.stubEnv('VITE_DEV_BYPASS_AUTH', 'true');
    // Aunque hubiera un token guardado, el bypass no consulta la API.
    localStorage.setItem('ova.token', 'guardado');
    setActivePinia(createPinia());
    const router = nuevoRouter();

    await router.push('/demo-mandibula');

    expect(router.currentRoute.value.name).toBe('demo_mandibula');
    expect(fetchMock).not.toHaveBeenCalled();
    const auth = useAuthStore();
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.usuario?.nombre).toBe('Estudiante');
    // El usuario ficticio no obtiene token: no hay nada que enviar a la API.
    expect(auth.token).toBe('guardado');
  });

  it('en DEV /acceso también redirige a / (la sesión ficticia cuenta como iniciada)', async () => {
    vi.stubEnv('VITE_DEV_BYPASS_AUTH', 'true');
    const router = nuevoRouter();
    await router.push('/acceso');
    expect(router.currentRoute.value.name).toBe('inicio');
  });

  it('la variable con otro valor no activa el bypass', async () => {
    vi.stubEnv('VITE_DEV_BYPASS_AUTH', '1');
    const router = nuevoRouter();
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('acceso');
    expect(useAuthStore().isAuthenticated).toBe(false);
  });

  it('fuera de DEV (producción) la variable NO tiene efecto aunque valga "true"', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DEV_BYPASS_AUTH', 'true');
    const router = nuevoRouter();
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('acceso');
    expect(useAuthStore().isAuthenticated).toBe(false);
  });
});

describe('vigilarSesion', () => {
  it('al cerrar la sesión en una ruta protegida lleva a /acceso', async () => {
    const auth = useAuthStore();
    auth.establecerUsuario(usuarioDePrueba());
    const router = nuevoRouter();
    const detener = vigilarSesion(router);
    await router.push('/modulo/2');
    expect(router.currentRoute.value.name).toBe('modulo');

    auth.logout();
    await nextTick();
    await router.isReady();
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('acceso'));
    detener();
  });
});

describe('destinoSeguro', () => {
  it.each([
    ['/modulo/3', '/modulo/3'],
    ['/', '/'],
    ['/acceso?x=1', '/acceso?x=1'],
    ['https://malo.example', null],
    ['//malo.example', null],
    ['modulo/3', null],
    ['', null],
    [undefined, null],
    [['/a'], null],
  ])('%j -> %j', (entrada, esperado) => {
    expect(destinoSeguro(entrada)).toBe(esperado);
  });
});
