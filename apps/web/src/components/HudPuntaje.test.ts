import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CargadorGsap from '@/components/menu/gsapPerezoso';
import { nextTick } from 'vue';
import HudPuntaje from '@/components/HudPuntaje.vue';
import { ESPERA_ANUNCIO_MS } from '@/components/hud/useAnuncioPuntaje';
import { precargarGsap } from '@/components/menu/gsapPerezoso';
import { crearRouterDePrueba, simularMovimientoReducido } from '@/components/menu/testing';
import { catalogoDeRespaldo } from '@/data/logros';
import { MODULOS } from '@/data/modulos';
import { useAuthStore } from '@/stores/auth';
import { useProgresoStore } from '@/stores/progreso';
import { progresoDePrueba, respuestaError, respuestaJson } from '@/test/utils';

// La carga real de GSAP se conserva; el envoltorio solo permite contar las llamadas.
vi.mock('@/components/menu/gsapPerezoso', async (importOriginal) => {
  const original = await importOriginal<typeof CargadorGsap>();
  return { ...original, precargarGsap: vi.fn(original.precargarGsap) };
});

const fetchMock = vi.fn<typeof fetch>();
const montados: VueWrapper[] = [];

interface OpcionesMontaje {
  ruta?: string;
  /** Estado del store antes de montar. */
  puntaje?: number;
  logros?: string[];
  cargado?: boolean;
  reducido?: boolean;
  token?: string;
}

async function montar({
  ruta = '/',
  puntaje = 0,
  logros = [],
  cargado = true,
  reducido = true,
  token,
}: OpcionesMontaje = {}) {
  simularMovimientoReducido(reducido);
  const pinia = createPinia();
  setActivePinia(pinia);
  if (token) useAuthStore().token = token;
  const progreso = useProgresoStore();
  progreso.puntajeTotal = puntaje;
  progreso.logros = logros;
  progreso.loaded = cargado;
  const router = await crearRouterDePrueba(ruta);
  const wrapper = mount(HudPuntaje, { global: { plugins: [pinia, router] } });
  montados.push(wrapper);
  // Cuántas veces pidió el componente la descarga de GSAP (antes de la espera de más abajo).
  const cargasPedidas = vi.mocked(precargarGsap).mock.calls.length;
  // GSAP se descarga aparte tras el montaje; se espera a que esté listo antes de probar animaciones.
  if (!reducido) await precargarGsap();
  await flushPromises();
  return { wrapper, router, progreso, cargasPedidas };
}

const visible = (w: VueWrapper) => w.get('[data-testid="hud-puntaje-visible"]').text();
const anuncio = (w: VueWrapper) => w.get('[data-testid="hud-anuncio"]');

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(precargarGsap).mockClear();
});

afterEach(() => {
  while (montados.length) montados.pop()!.unmount();
  vi.useRealTimers();
});

describe('HudPuntaje: puntaje', () => {
  it('muestra el puntaje total y lo deja completo para lectores de pantalla', async () => {
    const { wrapper } = await montar({ puntaje: 120 });
    expect(visible(wrapper)).toBe('120');
    expect(wrapper.get('[data-testid="hud-puntaje-sr"]').text()).toBe('Puntaje total: 120 puntos');
    // El número visible (que se anima) no lo lee el lector: lo hace el texto oculto.
    expect(wrapper.get('[data-testid="hud-puntaje-visible"]').attributes('aria-hidden')).toBe(
      'true',
    );
  });

  it('singular con un solo punto y cero puntos al empezar', async () => {
    const uno = await montar({ puntaje: 1 });
    expect(uno.wrapper.get('[data-testid="hud-puntaje-sr"]').text()).toBe('Puntaje total: 1 punto');
    const cero = await montar({ puntaje: 0 });
    expect(visible(cero.wrapper)).toBe('0');
    expect(cero.wrapper.get('[data-testid="hud-puntaje-sr"]').text()).toBe(
      'Puntaje total: 0 puntos',
    );
  });

  it('es un grupo con nombre accesible', async () => {
    const { wrapper } = await montar();
    const grupo = wrapper.get('[role="group"]');
    expect(grupo.attributes('aria-label')).toBe('Tu progreso');
    expect(grupo.attributes('aria-busy')).toBe('false');
  });

  it('se actualiza cuando el store cambia', async () => {
    const { wrapper, progreso } = await montar({ puntaje: 100 });
    progreso.puntajeTotal = 175;
    await nextTick();
    expect(visible(wrapper)).toBe('175');
  });
});

describe('HudPuntaje: módulo actual', () => {
  it('en un módulo muestra su número y título', async () => {
    const { wrapper } = await montar({ ruta: '/modulo/3' });
    const texto = wrapper.get('[data-testid="hud-modulo"]').text();
    expect(texto).toContain('Módulo actual:');
    expect(texto).toContain('Módulo 3');
    expect(texto).toContain(MODULOS[2]!.titulo);
  });

  it('en el inicio dice "Inicio"', async () => {
    const { wrapper } = await montar({ ruta: '/' });
    const texto = wrapper.get('[data-testid="hud-modulo"]').text();
    expect(texto).toContain('Inicio');
    expect(texto).not.toContain('Módulo 1');
  });

  it('en otra pantalla (la demo 3D) usa el título de la pantalla', async () => {
    const { wrapper } = await montar({ ruta: '/demo-mandibula' });
    expect(wrapper.get('[data-testid="hud-modulo"]').text()).toContain('Demo de mandíbula 3D');
  });

  it('sigue la navegación', async () => {
    const { wrapper, router } = await montar({ ruta: '/modulo/1' });
    await router.push('/modulo/5');
    await flushPromises();
    const texto = wrapper.get('[data-testid="hud-modulo"]').text();
    expect(texto).toContain('Módulo 5');
    expect(texto).toContain(MODULOS[4]!.titulo);
    await router.push('/');
    await flushPromises();
    expect(wrapper.get('[data-testid="hud-modulo"]').text()).toContain('Inicio');
  });
});

describe('HudPuntaje: siguiente logro', () => {
  it('sin logros, el primero del catálogo, con su descripción', async () => {
    const { wrapper } = await montar({ logros: [] });
    const logro = wrapper.get('[data-testid="hud-logro"]');
    expect(logro.text()).toContain('Siguiente logro:');
    expect(logro.text()).toContain('Primer hueso');
    expect(logro.attributes('title')).toBe('Completaste el módulo 1');
  });

  it('es el primer logro NO obtenido, aunque se hayan obtenido otros', async () => {
    const { wrapper } = await montar({ logros: ['primer_hueso', 'constructor'] });
    expect(wrapper.get('[data-testid="hud-logro"]').text()).toContain('Célula por célula');
  });

  it('avanza cuando se obtiene un logro', async () => {
    const { wrapper, progreso } = await montar({ logros: ['primer_hueso'] });
    progreso.logros = ['primer_hueso', 'celula_por_celula'];
    await nextTick();
    expect(wrapper.get('[data-testid="hud-logro"]').text()).toContain('Constructor');
  });

  it('con todos obtenidos dice "Completaste todos los logros"', async () => {
    const todos = MODULOS.map((m) => m.logro);
    const { wrapper } = await montar({ logros: todos });
    expect(wrapper.find('[data-testid="hud-logro"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="hud-logros-completos"]').text()).toBe(
      'Completaste todos los logros',
    );
  });

  it('con el catálogo vacío no afirma nada sobre los logros', async () => {
    const { wrapper, progreso } = await montar({ logros: [] });
    progreso.catalogoLogros = [];
    await nextTick();
    expect(wrapper.find('[data-testid="hud-logro"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="hud-logros-completos"]').exists()).toBe(false);
  });

  it('usa el catálogo de la API si el store lo tiene (nombre y descripción del servidor)', async () => {
    const { wrapper, progreso } = await montar({ logros: [] });
    progreso.catalogoLogros = [
      {
        codigo: 'sin_errores',
        nombre: 'Sin errores',
        descripcion: 'Un módulo sin fallos',
        obtenido: false,
        obtenido_en: null,
      },
    ];
    await nextTick();
    const logro = wrapper.get('[data-testid="hud-logro"]');
    expect(logro.text()).toContain('Sin errores');
    expect(logro.attributes('title')).toBe('Un módulo sin fallos');
  });
});

describe('HudPuntaje: carga y error', () => {
  it('mientras carga por primera vez muestra un estado discreto, sin datos falsos', async () => {
    const { wrapper, progreso } = await montar({ cargado: false });
    progreso.loading = true;
    await nextTick();
    expect(wrapper.get('[role="group"]').attributes('aria-busy')).toBe('true');
    expect(wrapper.find('[data-testid="hud-cargando"]').exists()).toBe(true);
    expect(visible(wrapper)).toBe('–');
    expect(wrapper.get('[data-testid="hud-puntaje-sr"]').text()).toBe(
      'Puntaje total: no disponible',
    );
    // El catálogo de respaldo diría "Primer hueso", que podría ser falso: no se muestra.
    expect(wrapper.find('[data-testid="hud-logro"]').exists()).toBe(false);
  });

  it('si el progreso no se pudo cargar avisa y ofrece reintentar', async () => {
    const { wrapper, progreso } = await montar({ cargado: false });
    progreso.error = 'No pudimos cargar tu progreso. Puedes seguir estudiando; lo intentaremos.';
    await nextTick();
    const error = wrapper.get('[data-testid="hud-error"]');
    expect(error.attributes('role')).toBe('status');
    expect(error.text()).toContain('Progreso no disponible');
    expect(visible(wrapper)).toBe('–');
    expect(wrapper.find('[data-testid="hud-logro"]').exists()).toBe(false);
    const reintentar = wrapper.get('button');
    expect(reintentar.text()).toContain('Reintentar');
  });

  it('"Reintentar" vuelve a pedir el progreso y, si responde, muestra los datos', async () => {
    fetchMock.mockImplementation((entrada) => {
      const url = String(entrada);
      if (url.endsWith('/progress')) {
        return Promise.resolve(respuestaJson(200, progresoDePrueba([1], 130, ['primer_hueso'])));
      }
      return Promise.resolve(respuestaJson(200, { logros: catalogoDeRespaldo() }));
    });
    const { wrapper, progreso } = await montar({ cargado: false, token: 'tok' });
    // La carga inicial de onMounted ya se hizo (con éxito); se fuerza el estado de error.
    progreso.reset();
    progreso.error = 'fallo';
    await nextTick();
    expect(wrapper.find('[data-testid="hud-error"]').exists()).toBe(true);

    fetchMock.mockClear();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/progress'))).toHaveLength(1);
    expect(wrapper.find('[data-testid="hud-error"]').exists()).toBe(false);
    expect(visible(wrapper)).toBe('130');
    expect(wrapper.get('[data-testid="hud-logro"]').text()).toContain('Célula por célula');
  });

  it('un fallo real de la API deja el HUD en estado de error sin romperse', async () => {
    fetchMock.mockImplementation((entrada) => {
      const url = String(entrada);
      if (url.endsWith('/progress')) {
        return Promise.resolve(respuestaError(500, 'error_interno'));
      }
      return Promise.reject(new TypeError('sin red'));
    });
    const { wrapper } = await montar({ cargado: false, token: 'tok' });
    await vi.waitFor(() => expect(wrapper.find('[data-testid="hud-error"]').exists()).toBe(true));
    expect(visible(wrapper)).toBe('–');
  });

  it('si ya había datos, un fallo posterior no los oculta', async () => {
    const { wrapper, progreso } = await montar({ puntaje: 90, cargado: true });
    progreso.error = 'fallo al refrescar';
    await nextTick();
    expect(wrapper.find('[data-testid="hud-error"]').exists()).toBe(false);
    expect(visible(wrapper)).toBe('90');
  });

  it('sin token (modo sin backend) no hay carga ni error: valores por defecto', async () => {
    const { wrapper } = await montar({ cargado: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="hud-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="hud-cargando"]').exists()).toBe(false);
    expect(visible(wrapper)).toBe('0');
    expect(wrapper.get('[data-testid="hud-logro"]').text()).toContain('Primer hueso');
  });
});

describe('HudPuntaje: petición al montarse', () => {
  it('pide el progreso al montarse, una sola vez aunque haya varios interesados', async () => {
    fetchMock.mockImplementation((entrada) => {
      const url = String(entrada);
      if (url.endsWith('/progress')) {
        return Promise.resolve(respuestaJson(200, progresoDePrueba([], 40, [])));
      }
      return Promise.resolve(respuestaJson(200, { logros: [] }));
    });
    simularMovimientoReducido(true);
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().token = 'tok';
    const progreso = useProgresoStore();
    const router = await crearRouterDePrueba('/');
    // AppShell también llama a load() en su onMounted: dos peticiones simultáneas más el HUD.
    const global = { plugins: [pinia, router] };
    const a = mount(HudPuntaje, { global });
    const b = mount(HudPuntaje, { global });
    montados.push(a, b);
    void progreso.load();
    await flushPromises();
    const progresos = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/progress'));
    const catalogos = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/achievements'));
    expect(progresos).toHaveLength(1);
    expect(catalogos).toHaveLength(1);
    expect(visible(a)).toBe('40');
    expect(visible(b)).toBe('40');
  });

  it('no vuelve a pedir si ya estaba cargado', async () => {
    await montar({ cargado: true, token: 'tok' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('HudPuntaje: anuncio accesible de cambios de puntaje', () => {
  it('la región es aria-live="polite" y atómica, y empieza vacía', async () => {
    const { wrapper } = await montar({ puntaje: 100 });
    expect(anuncio(wrapper).attributes('aria-live')).toBe('polite');
    expect(anuncio(wrapper).attributes('aria-atomic')).toBe('true');
    expect(anuncio(wrapper).text()).toBe('');
  });

  it('anuncia cuántos puntos se sumaron y el total, tras una breve espera', async () => {
    vi.useFakeTimers();
    const { wrapper, progreso } = await montar({ puntaje: 100 });
    progreso.puntajeTotal = 160;
    await nextTick();
    // Aún no: se espera a que los cambios se calmen.
    vi.advanceTimersByTime(ESPERA_ANUNCIO_MS - 1);
    await nextTick();
    expect(anuncio(wrapper).text()).toBe('');
    vi.advanceTimersByTime(1);
    await nextTick();
    expect(anuncio(wrapper).text()).toBe('Sumaste 60 puntos. Puntaje total: 160.');
  });

  it('agrupa cambios seguidos en un solo mensaje', async () => {
    vi.useFakeTimers();
    const { wrapper, progreso } = await montar({ puntaje: 100 });
    progreso.puntajeTotal = 120;
    await nextTick();
    vi.advanceTimersByTime(300);
    progreso.puntajeTotal = 150;
    await nextTick();
    vi.advanceTimersByTime(ESPERA_ANUNCIO_MS);
    await nextTick();
    expect(anuncio(wrapper).text()).toBe('Sumaste 50 puntos. Puntaje total: 150.');
  });

  it('un punto se dice en singular', async () => {
    vi.useFakeTimers();
    const { wrapper, progreso } = await montar({ puntaje: 10 });
    progreso.puntajeTotal = 11;
    await nextTick();
    vi.advanceTimersByTime(ESPERA_ANUNCIO_MS);
    await nextTick();
    expect(anuncio(wrapper).text()).toBe('Sumaste 1 punto. Puntaje total: 11.');
  });

  it('NO anuncia la carga inicial (0 -> 120 al recibir los datos)', async () => {
    vi.useFakeTimers();
    const { wrapper, progreso } = await montar({ puntaje: 0, cargado: false });
    progreso.puntajeTotal = 120;
    progreso.loaded = true;
    await nextTick();
    vi.advanceTimersByTime(ESPERA_ANUNCIO_MS * 3);
    await nextTick();
    expect(anuncio(wrapper).text()).toBe('');
  });

  it('NO anuncia el cierre de sesión (reset) y la siguiente carga tampoco', async () => {
    vi.useFakeTimers();
    const { wrapper, progreso } = await montar({ puntaje: 200 });
    progreso.reset();
    await nextTick();
    vi.advanceTimersByTime(ESPERA_ANUNCIO_MS * 3);
    await nextTick();
    expect(anuncio(wrapper).text()).toBe('');
    progreso.puntajeTotal = 50;
    progreso.loaded = true;
    await nextTick();
    vi.advanceTimersByTime(ESPERA_ANUNCIO_MS * 3);
    await nextTick();
    expect(anuncio(wrapper).text()).toBe('');
  });

  it('si el puntaje vuelve al valor de partida antes de la espera, no anuncia nada', async () => {
    vi.useFakeTimers();
    const { wrapper, progreso } = await montar({ puntaje: 100 });
    progreso.puntajeTotal = 140;
    await nextTick();
    progreso.puntajeTotal = 100;
    await nextTick();
    vi.advanceTimersByTime(ESPERA_ANUNCIO_MS * 2);
    await nextTick();
    expect(anuncio(wrapper).text()).toBe('');
  });
});

describe('HudPuntaje: contador animado', () => {
  it('con movimiento reducido no descarga GSAP; sin él, sí', async () => {
    const reducido = await montar({ reducido: true });
    expect(reducido.cargasPedidas).toBe(0);
    const normal = await montar({ reducido: false });
    expect(normal.cargasPedidas).toBe(1);
  });

  it('con movimiento reducido salta al valor final sin animar', async () => {
    const { wrapper, progreso } = await montar({ puntaje: 100, reducido: true });
    progreso.puntajeTotal = 160;
    await nextTick();
    expect(visible(wrapper)).toBe('160');
  });

  it('sin movimiento reducido cuenta hasta el valor final en menos de un segundo', async () => {
    const { wrapper, progreso } = await montar({ puntaje: 100, reducido: false });
    progreso.puntajeTotal = 160;
    await nextTick();
    // Arranca desde el valor anterior, no salta directo.
    expect(Number(visible(wrapper))).toBeLessThan(160);
    await vi.waitFor(() => expect(visible(wrapper)).toBe('160'), { timeout: 2000 });
  });

  it('un cambio nuevo a mitad de la cuenta retoma hacia el valor más reciente', async () => {
    const { wrapper, progreso } = await montar({ puntaje: 100, reducido: false });
    progreso.puntajeTotal = 160;
    await nextTick();
    progreso.puntajeTotal = 220;
    await nextTick();
    await vi.waitFor(() => expect(visible(wrapper)).toBe('220'), { timeout: 2000 });
  });

  it('la primera carga (0 -> 120) no cuenta: aparece directo', async () => {
    const { wrapper, progreso } = await montar({ puntaje: 0, cargado: false, reducido: false });
    progreso.puntajeTotal = 120;
    progreso.loaded = true;
    await nextTick();
    expect(visible(wrapper)).toBe('120');
  });
});
