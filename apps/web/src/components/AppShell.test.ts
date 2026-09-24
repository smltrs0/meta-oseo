import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { RouterView } from 'vue-router';
import { h } from 'vue';
import HudPuntaje from '@/components/HudPuntaje.vue';
import MenuCircular from '@/components/MenuCircular.vue';
import MentorPanel from '@/components/mentor/MentorPanel.vue';
import { crearRouter } from '@/router';
import { useAuthStore } from '@/stores/auth';
import { useContextoStore } from '@/stores/contextoPedagogico';
import { progresoDePrueba, respuestaJson, usuarioDePrueba } from '@/test/utils';

const fetchMock = vi.fn<typeof fetch>();

async function montarApp(ruta: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.token = 'tok';
  auth.establecerUsuario(usuarioDePrueba());
  const router = crearRouter(createMemoryHistory());
  await router.push(ruta);
  await router.isReady();
  // Se monta con <RouterView/> raíz, como App.vue: el shell y la vista van por el router.
  const wrapper = mount(
    { render: () => h(RouterView) },
    {
      // Los tres componentes de los otros agentes se sustituyen por stubs: esta prueba verifica
      // el layout del shell, no su contenido, y sigue valiendo cuando ellos los reescriban.
      global: {
        plugins: [pinia, router],
        stubs: { MenuCircular: true, HudPuntaje: true, MentorPanel: true },
      },
      attachTo: document.body,
    },
  );
  await flushPromises();
  return { wrapper, router, auth };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation((entrada) => {
    const url = String(entrada);
    if (url.endsWith('/progress')) {
      return Promise.resolve(respuestaJson(200, progresoDePrueba([1], 100, ['primer_hueso'])));
    }
    if (url.endsWith('/achievements')) return Promise.resolve(respuestaJson(200, { logros: [] }));
    return Promise.reject(new TypeError('sin red'));
  });
  vi.stubGlobal('fetch', fetchMock);
});

describe('AppShell', () => {
  it('monta menú, HUD y mentor alrededor de la vista, con los landmarks correctos', async () => {
    const { wrapper } = await montarApp('/');

    expect(wrapper.find('header').exists()).toBe(true);
    expect(wrapper.get('header').findComponent(HudPuntaje).exists()).toBe(true);
    expect(wrapper.findComponent(MenuCircular).exists()).toBe(true);
    expect(wrapper.findComponent(MentorPanel).exists()).toBe(true);
    const main = wrapper.get('main#contenido');
    expect(main.attributes('tabindex')).toBe('-1');
    // La vista (Home) va DENTRO de <main>.
    expect(main.text()).toContain('Hola, Ana');
    expect(wrapper.get('a.saltar-al-contenido').attributes('href')).toBe('#contenido');
    wrapper.unmount();
  });

  it('el shell pide el progreso una sola vez', async () => {
    const { wrapper } = await montarApp('/');
    const progreso = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/progress'));
    expect(progreso).toHaveLength(1);
    wrapper.unmount();
  });

  it('Home lista los 6 módulos con enlaces reales a /modulo/n y marca el completado', async () => {
    const { wrapper } = await montarApp('/');
    const enlaces = wrapper.findAll('ol a').map((a) => a.attributes('href'));
    expect(enlaces).toEqual([1, 2, 3, 4, 5, 6].map((n) => `/modulo/${n}`));
    const primero = wrapper.findAll('ol li')[0]!;
    expect(primero.text()).toContain('Completado');
    expect(wrapper.findAll('ol li')[1]!.text()).not.toContain('Completado');
    expect(wrapper.text()).toContain('1 de 6 completados');
    wrapper.unmount();
  });

  it('la vista de módulo muestra "en construcción" y llama a setModulo', async () => {
    const { wrapper, router } = await montarApp('/modulo/3');
    const contexto = useContextoStore();
    expect(wrapper.get('h1').text()).toBe('Construyendo hueso');
    expect(wrapper.text()).toContain('en construcción');
    expect(contexto.modulo).toBe(3);

    await router.push('/modulo/5');
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe('Renovando el hueso');
    expect(contexto.modulo).toBe(5);
    wrapper.unmount();
  });

  it('"Salir" cierra la sesión y lleva a /acceso', async () => {
    const { wrapper, router, auth } = await montarApp('/');
    const salir = wrapper.findAll('header button').find((b) => b.text().includes('Salir'))!;
    await salir.trigger('click');
    await flushPromises();
    expect(auth.isAuthenticated).toBe(false);
    // La vista de acceso se carga de forma perezosa: la navegación termina un instante después.
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('acceso'));
    wrapper.unmount();
  });

  it('el foco pasa al contenido al cambiar de página', async () => {
    const { wrapper, router } = await montarApp('/');
    await router.push('/modulo/2');
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get('main#contenido').element);
    wrapper.unmount();
  });
});
