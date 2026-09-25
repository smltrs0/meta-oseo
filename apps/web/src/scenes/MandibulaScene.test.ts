/**
 * Pruebas del componente sin WebGL real: el <TresCanvas> se sustituye por un contenedor y las
 * etiquetas <Tres*> quedan como elementos personalizados (vite.config las declara así), de
 * modo que `@click` sobre <TresMesh> es un evento DOM normal. Lo que se comprueba es la lógica
 * del componente (estados, selección, limpieza), no el renderizado.
 */
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { BufferGeometry } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import type { Component, SetupContext } from 'vue';
import { useContextoStore } from '@/stores/contextoPedagogico';
import MandibulaScene from './MandibulaScene.vue';
import { URL_MODELO_MANDIBULA } from './stl';
import { respuestaFalsa, stlBinario, triangulosDeCaja } from './stlDePrueba';
import { hayWebGL2 } from './webgl';

vi.mock('./webgl', () => ({ hayWebGL2: vi.fn() }));

const STL = stlBinario(triangulosDeCaja([0, -130, 1450], [100, 60, 80]));
const fetchMock = vi.fn<typeof fetch>();

/** Sustituto de <TresCanvas>: deja pasar los eventos DOM y renderiza su contenido. */
const TresCanvasFalso: Component = {
  name: 'TresCanvas',
  setup(_props: unknown, { slots }: SetupContext) {
    return () => h('div', { 'data-test': 'lienzo' }, slots.default?.());
  },
};

function montar() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const contexto = useContextoStore();
  const wrapper = mount(MandibulaScene, {
    global: {
      plugins: [pinia],
      stubs: { TresCanvas: TresCanvasFalso, OrbitControls: true },
    },
    attachTo: document.body,
  });
  return { wrapper, contexto };
}

const respuestaModelo = () =>
  respuestaFalsa({ fragmentos: [new Uint8Array(STL)], longitud: STL.byteLength });

async function montarListo() {
  const montado = montar();
  await flushPromises();
  expect(montado.wrapper.attributes('data-estado')).toBe('listo');
  return montado;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.mocked(hayWebGL2).mockReturnValue(true);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => respuestaModelo());
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MandibulaScene: estados', () => {
  it('sin WebGL 2 muestra el mensaje y no descarga el modelo', async () => {
    vi.mocked(hayWebGL2).mockReturnValue(false);
    const { wrapper } = montar();
    await flushPromises();

    expect(wrapper.attributes('data-estado')).toBe('sin_webgl');
    const alerta = wrapper.get('[role="alert"]');
    expect(alerta.text()).toContain('no puede mostrar el modelo 3D');
    expect(alerta.text()).toContain('WebGL 2');
    expect(wrapper.find('[data-test="lienzo"]').exists()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('descarga el STL de la ruta pública y monta el lienzo cuando está listo', async () => {
    const { wrapper } = await montarListo();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(URL_MODELO_MANDIBULA);
    expect(URL_MODELO_MANDIBULA).toMatch(/models\/mandibula_bodyparts3d\.stl$/);
    expect(wrapper.find('[data-test="lienzo"]').exists()).toBe(true);
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Arrastra para girar, pellizca para acercar');
  });

  it('mientras descarga muestra una barra de progreso accesible con el porcentaje', async () => {
    let soltar: (() => void) | undefined;
    const mitad = STL.byteLength / 2;
    fetchMock.mockImplementation(async () => {
      const respuesta = respuestaFalsa({
        longitud: STL.byteLength,
        fragmentos: [new Uint8Array(STL.slice(0, mitad)), new Uint8Array(STL.slice(mitad))],
      });
      const cuerpo = respuesta.body as unknown as {
        getReader: () => { read: () => Promise<unknown> };
      };
      const lector = cuerpo.getReader();
      let lecturas = 0;
      cuerpo.getReader = () => ({
        read: async () => {
          lecturas += 1;
          if (lecturas === 2) await new Promise<void>((resolver) => (soltar = resolver));
          return lector.read();
        },
      });
      return respuesta;
    });

    const { wrapper } = montar();
    await flushPromises();

    const barra = wrapper.get('[role="progressbar"]');
    expect(barra.attributes('aria-valuenow')).toBe('50');
    expect(wrapper.text()).toContain('Cargando modelo 3D');
    expect(wrapper.text()).toContain('50 %');
    expect(wrapper.attributes('data-estado')).toBe('cargando');

    soltar?.();
    await flushPromises();
    expect(wrapper.attributes('data-estado')).toBe('listo');
  });

  it('un fallo de descarga muestra el error y "Reintentar" vuelve a intentarlo', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { wrapper } = montar();
    await flushPromises();

    expect(wrapper.attributes('data-estado')).toBe('error');
    const alerta = wrapper.get('[role="alert"]');
    expect(alerta.text()).toContain('Problema con el modelo 3D');
    expect(alerta.text()).toContain('Revisa tu conexión');
    // Nunca texto técnico crudo en pantalla.
    expect(wrapper.text()).not.toContain('Failed to fetch');

    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wrapper.attributes('data-estado')).toBe('listo');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('un archivo que no es STL muestra el error de archivo inválido', async () => {
    fetchMock.mockImplementation(async () =>
      respuestaFalsa({ fragmentos: [new Uint8Array(8)], longitud: 8 }),
    );
    const { wrapper } = montar();
    await flushPromises();

    expect(wrapper.attributes('data-estado')).toBe('error');
    expect(wrapper.get('[role="alert"]').text()).toContain('no es válido');
  });

  it('un HTTP 404 muestra el código y no monta el lienzo', async () => {
    fetchMock.mockImplementation(async () => respuestaFalsa({ ok: false, status: 404 }));
    const { wrapper } = montar();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('error 404');
    expect(wrapper.find('[data-test="lienzo"]').exists()).toBe(false);
  });

  it('un error al crear el renderizador dentro del lienzo pasa a la pantalla de error', async () => {
    const LienzoQueFalla: Component = {
      name: 'TresCanvas',
      setup() {
        throw new Error('Error creating WebGL context.');
      },
    };
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(MandibulaScene, {
      global: { plugins: [pinia], stubs: { TresCanvas: LienzoQueFalla, OrbitControls: true } },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.attributes('data-estado')).toBe('error');
    expect(wrapper.get('[role="alert"]').text()).toContain('renderizado 3D');
    expect(wrapper.text()).not.toContain('Error creating WebGL context');
  });
});

describe('MandibulaScene: selección por toque', () => {
  it('tocar la malla llama a setEstructura("mandibula") y muestra la etiqueta', async () => {
    const { wrapper, contexto } = await montarListo();
    expect(contexto.estructuraSeleccionada).toBeUndefined();

    await wrapper.get('tresmesh').trigger('click');

    expect(contexto.estructuraSeleccionada).toBe('mandibula');
    expect(contexto.toPayload().estructuraSeleccionada).toBe('mandibula');
    expect(wrapper.text()).toContain('Mandíbula');
    expect(wrapper.text()).toContain('estructura seleccionada');
    // Se anuncia a lectores de pantalla en la región de estado.
    expect(wrapper.get('[role="status"]').text()).toBe('Mandíbula seleccionada');
  });

  it('el toque táctil llega igual: pointerdown + click sin desplazamiento', async () => {
    const { wrapper, contexto } = await montarListo();

    await wrapper.trigger('pointerdown', { clientX: 120, clientY: 300 });
    await wrapper.get('tresmesh').trigger('click', { clientX: 122, clientY: 301 });

    expect(contexto.estructuraSeleccionada).toBe('mandibula');
  });

  it('un arrastre que termina sobre el hueso NO lo selecciona', async () => {
    const { wrapper, contexto } = await montarListo();

    await wrapper.trigger('pointerdown', { clientX: 100, clientY: 100 });
    await wrapper.get('tresmesh').trigger('click', { clientX: 180, clientY: 100 });

    expect(contexto.estructuraSeleccionada).toBeUndefined();
  });

  it('tocar fuera del hueso quita la selección; un arrastre fuera no', async () => {
    const { wrapper, contexto } = await montarListo();
    contexto.setEstructura('mandibula');
    const lienzo = wrapper.get('[data-test="lienzo"]');

    await wrapper.trigger('pointerdown', { clientX: 10, clientY: 10 });
    await lienzo.trigger('pointermissed', { clientX: 90, clientY: 10 });
    expect(contexto.estructuraSeleccionada).toBe('mandibula');

    await wrapper.trigger('pointerdown', { clientX: 10, clientY: 10 });
    await lienzo.trigger('pointermissed', { clientX: 10, clientY: 10 });
    expect(contexto.estructuraSeleccionada).toBeUndefined();
    expect(wrapper.text()).toContain('toca el hueso');
  });

  it('con teclado: Intro y Espacio seleccionan (la escena es enfocable y está descrita)', async () => {
    const { wrapper, contexto } = await montarListo();

    expect(wrapper.attributes('tabindex')).toBe('0');
    expect(wrapper.attributes('role')).toBe('group');
    expect(wrapper.attributes('aria-label')).toBe('Modelo 3D de la mandíbula');
    const idAyuda = wrapper.attributes('aria-describedby');
    expect(idAyuda).toBeTruthy();
    expect(document.getElementById(idAyuda!)?.textContent).toContain('Pulsa Intro');

    await wrapper.trigger('keydown', { key: 'Enter' });
    expect(contexto.estructuraSeleccionada).toBe('mandibula');

    contexto.setEstructura(undefined);
    await wrapper.trigger('keydown', { key: ' ' });
    expect(contexto.estructuraSeleccionada).toBe('mandibula');
  });

  it('Intro sobre un botón interno (Reintentar) no dispara la selección', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('sin red'));
    const { wrapper, contexto } = montar();
    await flushPromises();

    await wrapper.get('button').trigger('keydown', { key: 'Enter' });
    expect(contexto.estructuraSeleccionada).toBeUndefined();
  });
});

describe('MandibulaScene: limpieza al desmontar', () => {
  it('cancela la descarga en curso', async () => {
    let senal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, opciones) => {
      senal = opciones?.signal ?? undefined;
      return new Promise<Response>(() => {}); // nunca responde
    });
    const { wrapper } = montar();
    await flushPromises();
    expect(senal?.aborted).toBe(false);

    wrapper.unmount();
    expect(senal?.aborted).toBe(true);
  });

  it('libera la geometría', async () => {
    const dispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const { wrapper } = await montarListo();
    dispose.mockClear(); // se ignoran las geometrías intermedias del parseo

    wrapper.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('deja de reportar la mandíbula como estructura seleccionada al salir de la escena', async () => {
    const { wrapper, contexto } = await montarListo();
    await wrapper.get('tresmesh').trigger('click');
    expect(contexto.estructuraSeleccionada).toBe('mandibula');

    wrapper.unmount();
    expect(contexto.estructuraSeleccionada).toBeUndefined();
  });

  it('no toca la selección de otra estructura al desmontar', async () => {
    const { wrapper, contexto } = await montarListo();
    contexto.setEstructura('condilo');

    wrapper.unmount();
    expect(contexto.estructuraSeleccionada).toBe('condilo');
  });

  it('desmontar antes de que termine la descarga no deja un error ni geometría suelta', async () => {
    let resolver: ((r: Response) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolver = resolve;
        }),
    );
    const { wrapper } = montar();
    await flushPromises();
    wrapper.unmount();

    resolver?.(respuestaModelo());
    await flushPromises();
    expect(console.error).not.toHaveBeenCalled();
  });
});
