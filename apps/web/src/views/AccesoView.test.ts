import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { crearRouter } from '@/router';
import { useAuthStore } from '@/stores/auth';
import { respuestaError, respuestaJson, tokenResponse, usuarioDePrueba } from '@/test/utils';
import AccesoView from './AccesoView.vue';

const fetchMock = vi.fn<typeof fetch>();
let wrappers: VueWrapper[] = [];

async function montar(ruta = '/acceso') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = crearRouter(createMemoryHistory());
  await router.push(ruta);
  await router.isReady();
  const wrapper = mount(AccesoView, {
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}

const numero = (w: VueWrapper) => w.get<HTMLInputElement>('#numero-identificacion');
const tipo = (w: VueWrapper) => w.get<HTMLSelectElement>('#tipo-identificacion');
const boton = (w: VueWrapper) => w.get<HTMLButtonElement>('button[type="submit"]');

async function escribir(w: VueWrapper, selector: string, texto: string) {
  await w.get(selector).setValue(texto);
}

function cuerpo(llamada: number): Record<string, string> {
  return JSON.parse(String(fetchMock.mock.calls[llamada]![1]?.body));
}

beforeEach(() => {
  wrappers.forEach((w) => w.unmount());
  wrappers = [];
  document.body.innerHTML = '';
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('AccesoView: pantalla inicial', () => {
  it('muestra tipo, número, botón "Continuar" y la línea de privacidad; no pide nombre', async () => {
    const { wrapper } = await montar();

    const opciones = tipo(wrapper)
      .findAll('option')
      .map((o) => o.attributes('value'));
    expect(opciones).toEqual(['CC', 'TI', 'CE', 'PA', 'RC', 'PEP', 'PPT']);
    expect(tipo(wrapper).element.value).toBe('CC');
    expect(wrapper.text()).toContain('Cédula de ciudadanía (CC)');
    expect(boton(wrapper).text()).toBe('Continuar');
    expect(wrapper.text()).toContain(
      'Guardamos tu nombre y documento solo para registrar tu avance',
    );
    expect(wrapper.find('#nombre').exists()).toBe(false);
    expect(wrapper.find('#apellido').exists()).toBe(false);
  });

  it('las etiquetas están asociadas a sus campos (accesibilidad)', async () => {
    const { wrapper } = await montar();
    expect(wrapper.get('label[for="tipo-identificacion"]').text()).toBe('Tipo de identificación');
    expect(wrapper.get('label[for="numero-identificacion"]').text()).toBe(
      'Número de identificación',
    );
  });

  it('enfoca automáticamente el número de identificación', async () => {
    const { wrapper } = await montar();
    expect(document.activeElement).toBe(numero(wrapper).element);
  });

  it('inputmode numérico para CC y de texto para pasaporte', async () => {
    const { wrapper } = await montar();
    expect(numero(wrapper).attributes('inputmode')).toBe('numeric');
    await tipo(wrapper).setValue('PA');
    expect(numero(wrapper).attributes('inputmode')).toBe('text');
    await tipo(wrapper).setValue('PPT');
    expect(numero(wrapper).attributes('inputmode')).toBe('numeric');
  });
});

describe('AccesoView: validación en cliente', () => {
  it('número vacío: muestra el error junto al campo, lo enfoca y no llama a la API', async () => {
    const { wrapper } = await montar();

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    const error = wrapper.get('#numero-identificacion-error');
    expect(error.text()).toBe('Escribe tu número de identificación.');
    expect(numero(wrapper).attributes('aria-invalid')).toBe('true');
    expect(numero(wrapper).attributes('aria-describedby')).toBe('numero-identificacion-error');
    expect(document.activeElement).toBe(numero(wrapper).element);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['123', /muy corto/],
    ['1'.repeat(21), /muy largo/],
    ['12#45', /solo letras y números/],
  ])('número %j inválido: mensaje en español sin llamar a la API', async (valor, mensaje) => {
    const { wrapper } = await montar();
    await escribir(wrapper, '#numero-identificacion', valor);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('#numero-identificacion-error').text()).toMatch(mensaje);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('AccesoView: ingreso de un usuario existente', () => {
  it('normaliza el número, hace login y navega a /', async () => {
    fetchMock.mockResolvedValueOnce(respuestaJson(200, tokenResponse(usuarioDePrueba(), 'tok')));
    const { wrapper, router } = await montar();

    await escribir(wrapper, '#numero-identificacion', '1.023.456-789');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/login');
    expect(cuerpo(0)).toEqual({ tipo_identificacion: 'CC', numero_identificacion: '1023456789' });
    expect(useAuthStore().isAuthenticated).toBe(true);
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/'));
    expect(router.currentRoute.value.name).toBe('inicio');
  });

  it('respeta el destino guardado en ?redirect= (solo rutas internas)', async () => {
    fetchMock.mockResolvedValueOnce(respuestaJson(200, tokenResponse()));
    const { wrapper, router } = await montar('/acceso?redirect=/modulo/3');

    await escribir(wrapper, '#numero-identificacion', '1023456789');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/modulo/3'));
  });

  it('mientras espera: botón deshabilitado con estado de carga y sin envíos dobles', async () => {
    let resolver!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolver = r)));
    const { wrapper } = await montar();
    await escribir(wrapper, '#numero-identificacion', '1023456789');

    await wrapper.get('form').trigger('submit');
    await wrapper.get('form').trigger('submit'); // segundo intento mientras carga

    expect(boton(wrapper).text()).toBe('Verificando…');
    expect(boton(wrapper).attributes('disabled')).toBeDefined();
    expect(boton(wrapper).attributes('aria-busy')).toBe('true');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolver(respuestaJson(200, tokenResponse()));
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('AccesoView: usuario desconocido -> registro', () => {
  async function revelarRegistro() {
    fetchMock.mockResolvedValueOnce(respuestaError(404, 'usuario_no_encontrado'));
    const ctx = await montar();
    await escribir(ctx.wrapper, '#numero-identificacion', '1023456789');
    await ctx.wrapper.get('form').trigger('submit');
    await flushPromises();
    return ctx;
  }

  it('el 404 revela nombre y apellido, el botón pasa a "Registrarme" y se enfoca el nombre', async () => {
    const { wrapper } = await revelarRegistro();

    expect(wrapper.find('#nombre').exists()).toBe(true);
    expect(wrapper.find('#apellido').exists()).toBe(true);
    expect(boton(wrapper).text()).toBe('Registrarme');
    expect(wrapper.get('[role="status"]').text()).toMatch(/No encontramos esa identificación/);
    expect(document.activeElement).toBe(wrapper.get('#nombre').element);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    // Aún no es sesión: el 404 no autentica a nadie.
    expect(useAuthStore().isAuthenticated).toBe(false);
  });

  it('registra con los mismos datos más nombre y apellido (recortados) y navega a /', async () => {
    const { wrapper, router } = await revelarRegistro();
    fetchMock.mockResolvedValueOnce(
      respuestaJson(201, tokenResponse(usuarioDePrueba({ nombre: 'Ana', apellido: 'Pérez' }))),
    );

    await escribir(wrapper, '#nombre', '  Ana  ');
    await escribir(wrapper, '#apellido', 'Pérez   Gómez');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(fetchMock.mock.calls[1]![0]).toBe('/api/auth/register');
    expect(cuerpo(1)).toEqual({
      nombre: 'Ana',
      apellido: 'Pérez Gómez',
      tipo_identificacion: 'CC',
      numero_identificacion: '1023456789',
    });
    expect(useAuthStore().usuario?.nombre).toBe('Ana');
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('inicio'));
  });

  it('valida nombre y apellido con las reglas del contrato antes de llamar a la API', async () => {
    const { wrapper } = await revelarRegistro();
    await escribir(wrapper, '#nombre', '   ');
    await escribir(wrapper, '#apellido', 'a'.repeat(81));
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('#nombre-error').text()).toBe('Escribe tu nombre.');
    expect(wrapper.get('#apellido-error').text()).toMatch(/hasta 80/);
    expect(wrapper.get('#nombre').attributes('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(wrapper.get('#nombre').element);
    expect(fetchMock).toHaveBeenCalledTimes(1); // solo el login inicial
  });

  it('si se cambia el número después de revelar, vuelve a "Continuar" (nuevo login) y conserva los nombres', async () => {
    const { wrapper } = await revelarRegistro();
    await escribir(wrapper, '#nombre', 'Ana');

    await escribir(wrapper, '#numero-identificacion', '9999999');

    expect(wrapper.find('#nombre').exists()).toBe(false);
    expect(boton(wrapper).text()).toBe('Continuar');

    fetchMock.mockResolvedValueOnce(respuestaError(404, 'usuario_no_encontrado'));
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect((wrapper.get('#nombre').element as HTMLInputElement).value).toBe('Ana');
  });

  it('un 409 al registrar (ya existía) vuelve al ingreso con un aviso claro', async () => {
    const { wrapper } = await revelarRegistro();
    fetchMock.mockResolvedValueOnce(respuestaError(409, 'usuario_existente'));
    await escribir(wrapper, '#nombre', 'Ana');
    await escribir(wrapper, '#apellido', 'Pérez');

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('#nombre').exists()).toBe(false);
    expect(boton(wrapper).text()).toBe('Continuar');
    expect(wrapper.get('[role="status"]').text()).toMatch(/ya está registrada/);
  });
});

describe('AccesoView: errores del servidor y de red', () => {
  async function enviarConRespuesta(respuesta: Response | Error) {
    if (respuesta instanceof Error) fetchMock.mockRejectedValueOnce(respuesta);
    else fetchMock.mockResolvedValueOnce(respuesta);
    const { wrapper } = await montar();
    await escribir(wrapper, '#numero-identificacion', '1023456789');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    return wrapper;
  }

  it('429: pide esperar un minuto', async () => {
    const wrapper = await enviarConRespuesta(respuestaError(429, 'demasiados_intentos'));
    expect(wrapper.get('[role="alert"]').text()).toMatch(/demasiados intentos seguidos.*un minuto/);
    expect(boton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('red caída: mensaje de conexión', async () => {
    const wrapper = await enviarConRespuesta(new TypeError('Failed to fetch'));
    expect(wrapper.get('[role="alert"]').text()).toMatch(/No hay conexión con el servidor/);
  });

  it('500 y 503: servicio no disponible, sin texto técnico', async () => {
    const wrapper = await enviarConRespuesta(new Response('<html>boom</html>', { status: 502 }));
    expect(wrapper.get('[role="alert"]').text()).toMatch(/servicio no está disponible/);
    expect(wrapper.text()).not.toMatch(/boom|502/);
  });

  it('422 con campo: se marca el campo; sin campo: mensaje general', async () => {
    const conCampo = await enviarConRespuesta(
      respuestaJson(422, {
        detail: [{ loc: ['body', 'numero_identificacion'], msg: 'invalid', type: 'value_error' }],
      }),
    );
    expect(conCampo.get('#numero-identificacion-error').text()).toMatch(/Revisa este dato/);
    expect(conCampo.get('#numero-identificacion').attributes('aria-invalid')).toBe('true');

    wrappers.forEach((w) => w.unmount());
    wrappers = [];
    document.body.innerHTML = '';
    const general = await enviarConRespuesta(respuestaJson(422, { detail: [] }));
    expect(general.get('[role="alert"]').text()).toMatch(/Revisa los datos ingresados/);
  });

  it('el error se limpia al volver a intentar', async () => {
    const wrapper = await enviarConRespuesta(respuestaError(429, 'demasiados_intentos'));
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    fetchMock.mockResolvedValueOnce(respuestaJson(200, tokenResponse()));
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
