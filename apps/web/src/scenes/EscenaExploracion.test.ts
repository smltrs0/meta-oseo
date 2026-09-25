/**
 * Pruebas de EscenaExploracion sin WebGL real: el <TresCanvas> se sustituye por un contenedor y la
 * cámara (que necesita el contexto de TresJS) por un doble que registra las órdenes que recibe y deja
 * emitir la proyección de los puntos. Se comprueba lo que es del componente: estados, puntos de interés
 * HTML, órdenes de cámara (vistas, nodo, zoom), movimiento reducido y limpieza al desmontar. La
 * matemática de cámara y proyección tiene sus propias pruebas (vistas, proyeccion).
 */
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { BufferGeometry } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import type { Component, SetupContext } from 'vue';
import EscenaExploracion from './EscenaExploracion.vue';
import type { NodoEscena } from './nodosEscena';
import type { PosicionPunto } from './proyeccion';
import { respuestaFalsa, stlBinario, triangulosDeCaja } from './stlDePrueba';
import { direccionDeVista, ETIQUETA_VISTA, FACTOR_ZOOM_BOTON } from './vistas';
import type { OrdenCamara } from './vistas';
import { hayWebGL2 } from './webgl';

vi.mock('./webgl', () => ({ hayWebGL2: vi.fn() }));

enableAutoUnmount(afterEach);

const STL = stlBinario(triangulosDeCaja([0, -130, 1450], [100, 60, 80]));
const fetchMock = vi.fn<typeof fetch>();
const respuestaModelo = () =>
  respuestaFalsa({ fragmentos: [new Uint8Array(STL)], longitud: STL.byteLength });

const TresCanvasFalso: Component = {
  name: 'TresCanvas',
  setup(_props: unknown, { slots }: SetupContext) {
    return () => h('div', { 'data-test': 'lienzo' }, slots.default?.());
  },
};

const CamaraFalsa = defineComponent({
  name: 'CamaraExploracion',
  props: {
    orden: { type: Object, default: undefined },
    limites: { type: Object, default: undefined },
    reducirMovimiento: Boolean,
    puntos: { type: Array, default: undefined },
    centro: { type: Array, default: undefined },
    ancho: { type: Number, default: undefined },
    alto: { type: Number, default: undefined },
  },
  emits: ['proyeccion', 'interrumpida'],
  setup: () => () => h('div', { 'data-test': 'camara' }),
});

const NODOS: NodoEscena[] = [
  { id: 'condilo', etiqueta: 'Cóndilo', vista: 'lateral_derecha', zoom: 1.5 },
  { id: 'cuerpo', etiqueta: 'Cuerpo', vista: 'oblicua', zoom: 1 },
  {
    id: 'zona_libre',
    etiqueta: 'Zona libre',
    vista: 'posterior',
    zoom: 2,
    ancla: { x: 0.7, y: 0.35, z: 0.45 },
  },
  // No es una pieza del catálogo ni lleva ancla: no se puede ubicar (la cámara vuelve al general).
  { id: 'fantasma', etiqueta: 'Fantasma', vista: 'frontal', zoom: 1 },
];

type PropsEscena = InstanceType<typeof EscenaExploracion>['$props'];

function montar(props: Partial<PropsEscena> = {}): VueWrapper {
  return mount(EscenaExploracion, {
    props: { modelo: 'mandibula', alt: 'Modelo 3D de la mandíbula.', nodos: NODOS, ...props },
    global: { stubs: { TresCanvas: TresCanvasFalso, CamaraExploracion: CamaraFalsa } },
    attachTo: document.body,
  }) as unknown as VueWrapper;
}

async function montarListo(props: Partial<PropsEscena> = {}): Promise<VueWrapper> {
  const w = montar(props);
  await flushPromises();
  expect(w.attributes('data-estado')).toBe('listo');
  return w;
}

const camara = (w: VueWrapper) => w.findComponent({ name: 'CamaraExploracion' });
const orden = (w: VueWrapper) => camara(w).props('orden') as OrdenCamara | null;

async function proyectar(w: VueWrapper, posiciones: Partial<PosicionPunto>[]): Promise<void> {
  const completas = posiciones.map((p) => ({
    x: 100,
    y: 100,
    enPantalla: true,
    detras: false,
    ...p,
  }));
  camara(w).vm.$emit('proyeccion', completas);
  await flushPromises();
}

function punto(w: VueWrapper, id: string) {
  const encontrado = w.findAll('[data-punto]').find((b) => b.attributes('data-punto') === id);
  if (!encontrado) throw new Error(`No hay punto "${id}"`);
  return encontrado;
}

function mockMatchMedia(reducido: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((consulta: string) => ({
      matches: reducido && consulta.includes('reduce'),
      media: consulta,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.mocked(hayWebGL2).mockReturnValue(true);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => respuestaModelo());
  vi.stubGlobal('fetch', fetchMock);
  mockMatchMedia(false);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('estados', () => {
  it('sin WebGL 2: mensaje en español, sin lienzo ni controles y avisa a la actividad', async () => {
    vi.mocked(hayWebGL2).mockReturnValue(false);
    const w = montar();
    await flushPromises();
    expect(w.attributes('data-estado')).toBe('sin_webgl');
    expect(w.emitted('estado')!.at(-1)).toEqual(['sin_webgl']);
    expect(w.get('[role="alert"]').text()).toContain('lista de partes');
    expect(w.find('[data-test="lienzo"]').exists()).toBe(false);
    expect(w.find('[data-testid="controles-camara"]').exists()).toBe(false);
    expect(w.find('[data-testid="puntos-de-interes"]').exists()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(w.text()).toContain('El modelo 3D no está disponible');
  });

  it('descargando: barra accesible y ayuda que remite a la lista', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    const w = montar();
    await flushPromises();
    expect(w.attributes('data-estado')).toBe('cargando');
    expect(w.get('[role="progressbar"]').attributes('aria-label')).toContain('descarga');
    expect(w.text()).toContain('Mientras tanto puedes usar la lista de partes');
    expect(w.emitted('estado')!.map((e) => e[0])).toContain('cargando');
  });

  it('listo: lienzo, ayuda de gestos y controles de cámara accesibles', async () => {
    const w = await montarListo();
    expect(w.emitted('estado')!.at(-1)).toEqual(['listo']);
    expect(w.find('[data-test="lienzo"]').exists()).toBe(true);
    const grupo = w.get('[data-testid="escena-exploracion"]');
    expect(grupo.attributes('role')).toBe('group');
    expect(grupo.attributes('aria-label')).toBe('Modelo 3D de la mandíbula.');
    expect(document.getElementById(grupo.attributes('aria-describedby')!)!.textContent).toContain(
      'Arrastra para girar',
    );
    expect(w.get('[data-testid="acercar"]').attributes('aria-label')).toBe('Acercar');
    expect(w.get('[data-testid="alejar"]').attributes('aria-label')).toBe('Alejar');
    expect(w.get('[data-testid="ver-todo"]').text()).toContain('Ver todo');
    const selector = w.get('[data-testid="selector-vista"]');
    expect(w.get(`label[for="${selector.attributes('id')}"]`).text()).toBe('Vista');
    const opciones = selector.findAll('option').map((o) => o.text());
    for (const etiqueta of Object.values(ETIQUETA_VISTA)) expect(opciones).toContain(etiqueta);
  });

  it('error de carga: alerta con Reintentar, que vuelve a descargar y se recupera', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('no', { status: 404 }));
    const w = montar();
    await flushPromises();
    expect(w.attributes('data-estado')).toBe('error');
    expect(w.emitted('estado')!.at(-1)).toEqual(['error']);
    expect(w.get('[role="alert"]').text()).toContain('Reintentar');
    expect(w.find('[data-test="lienzo"]').exists()).toBe(false);
    await w.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(w.attributes('data-estado')).toBe('listo');
  });

  it('un archivo de modelo inválido es error, no una pantalla en blanco', async () => {
    fetchMock.mockImplementation(async () =>
      respuestaFalsa({ fragmentos: [new Uint8Array([1, 2, 3])], longitud: 3 }),
    );
    const w = montar();
    await flushPromises();
    expect(w.attributes('data-estado')).toBe('error');
  });

  it('las células (GLB aún inexistente) caen en error sin bloquear: no hay excepción', async () => {
    fetchMock.mockImplementation(async () => new Response('no', { status: 404 }));
    const w = montar({ modelo: 'celulas', alt: 'Escena de células óseas 3D.' });
    await flushPromises();
    expect(w.attributes('data-estado')).toBe('error');
    expect(w.get('[role="alert"]').text()).toContain('Problema con el modelo 3D');
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\.glb$/);
  });
});

describe('puntos de interés', () => {
  it('solo se dibujan los que caen en pantalla, numerados como en la lista', async () => {
    const w = await montarListo();
    await proyectar(w, [
      { id: 'condilo', x: 40, y: 50 },
      { id: 'cuerpo', x: 200, y: 120, enPantalla: false },
      { id: 'zona_libre', x: 90, y: 30 },
    ]);
    const ids = w.findAll('[data-punto]').map((b) => b.attributes('data-punto'));
    expect(ids).toEqual(['condilo', 'zona_libre']);
    expect(punto(w, 'condilo').text()).toContain('1');
    expect(punto(w, 'zona_libre').text()).toContain('3');
    expect(punto(w, 'condilo').attributes('style')).toContain('translate(40px, 50px)');
  });

  it('son una ayuda táctil: fuera del árbol de accesibilidad y del orden de Tab (la lista es la alternativa)', async () => {
    const w = await montarListo();
    await proyectar(w, [{ id: 'condilo' }]);
    const b = punto(w, 'condilo');
    expect(b.attributes('aria-hidden')).toBe('true');
    expect(b.attributes('tabindex')).toBe('-1');
    expect(b.classes()).toContain('size-11'); // 44 px
    for (const svg of b.findAll('svg')) expect(svg.attributes('aria-hidden')).toBe('true');
  });

  it('un toque (secuencia de punteros táctiles) emite seleccionar con el id, una sola vez', async () => {
    const w = await montarListo();
    await proyectar(w, [{ id: 'cuerpo' }]);
    const b = punto(w, 'cuerpo');
    await b.trigger('pointerdown', { pointerType: 'touch', pointerId: 1 });
    await b.trigger('pointerup', { pointerType: 'touch', pointerId: 1 });
    await b.trigger('click');
    expect(w.emitted('seleccionar')).toEqual([['cuerpo']]);
  });

  it('el punto seleccionado muestra su etiqueta y lo marca con data-* (no solo con color)', async () => {
    const w = await montarListo({ seleccionId: 'condilo', visitados: ['cuerpo'] });
    await proyectar(w, [{ id: 'condilo' }, { id: 'cuerpo' }, { id: 'zona_libre' }]);
    expect(punto(w, 'condilo').attributes('data-seleccionado')).toBe('true');
    expect(punto(w, 'condilo').text()).toContain('Cóndilo');
    expect(punto(w, 'cuerpo').attributes('data-visitado')).toBe('true');
    expect(punto(w, 'cuerpo').find('svg').exists()).toBe(true); // icono de visitado
    expect(punto(w, 'zona_libre').attributes('data-visitado')).toBe('false');
    expect(punto(w, 'zona_libre').text()).not.toContain('Zona libre');
  });

  it('los puntos del lado opuesto a la cámara se atenúan pero siguen tocables', async () => {
    const w = await montarListo();
    await proyectar(w, [{ id: 'condilo', detras: true }, { id: 'cuerpo' }]);
    expect(punto(w, 'condilo').classes()).toContain('opacity-50');
    expect(punto(w, 'cuerpo').classes()).not.toContain('opacity-50');
    await punto(w, 'condilo').trigger('click');
    expect(w.emitted('seleccionar')).toEqual([['condilo']]);
  });

  it('a la cámara le pasa solo los nodos que se pueden ubicar sobre el modelo', async () => {
    const w = await montarListo();
    const puntos = camara(w).props('puntos') as { id: string }[];
    expect(puntos.map((p) => p.id)).toEqual(['condilo', 'cuerpo', 'zona_libre']);
  });
});

describe('cámara: nodos, vistas y zoom', () => {
  it('sin órdenes, la cámara no recibe ninguna', async () => {
    const w = await montarListo();
    expect(orden(w)).toBeNull();
  });

  it('cada ordenEnfoque (aunque sea el mismo nodo) genera una orden nueva hacia el nodo con su vista', async () => {
    const w = await montarListo({ seleccionId: 'condilo', ordenEnfoque: 0 });
    await w.setProps({ ordenEnfoque: 1 });
    const primera = orden(w)!;
    expect(primera.tipo).toBe('estado');
    await w.setProps({ ordenEnfoque: 2 });
    const segunda = orden(w)!;
    expect(segunda.id).toBeGreaterThan(primera.id);
    if (segunda.tipo !== 'estado') throw new Error('se esperaba una orden de estado');
    // La cámara mira al nodo desde la vista lateral derecha del contenido.
    const d = direccionDeVista('lateral_derecha');
    const v = segunda.estado.posicion.map((c, i) => c - segunda.estado.objetivo[i]!);
    const norma = Math.hypot(...v);
    v.forEach((c, i) => expect(c / norma).toBeCloseTo(d[i]!, 5));
  });

  it('un zoom mayor acerca la cámara al nodo (distancia menor)', async () => {
    const distancia = async (id: string): Promise<number> => {
      const w = await montarListo({ seleccionId: id, ordenEnfoque: 0 });
      await w.setProps({ ordenEnfoque: 1 });
      const o = orden(w)!;
      if (o.tipo !== 'estado') throw new Error('orden inesperada');
      return Math.hypot(...o.estado.posicion.map((c, i) => c - o.estado.objetivo[i]!));
    };
    const cuerpo = await distancia('cuerpo'); // zoom 1, radio 0,55
    const zona = await distancia('zona_libre'); // zoom 2, radio de ancla
    expect(zona).toBeLessThan(cuerpo);
  });

  it('sin selección o con un nodo que no se puede ubicar, vuelve al encuadre general frontal', async () => {
    const w = await montarListo({ seleccionId: null, ordenEnfoque: 0 });
    await w.setProps({ ordenEnfoque: 1 });
    const general = orden(w)!;
    await w.setProps({ seleccionId: 'fantasma', ordenEnfoque: 2 });
    const fantasma = orden(w)!;
    if (general.tipo !== 'estado' || fantasma.tipo !== 'estado')
      throw new Error('orden inesperada');
    expect(fantasma.estado.posicion).toEqual(general.estado.posicion);
    expect(w.get('[data-testid="selector-vista"]').element).toHaveProperty('value', 'frontal');
  });

  it('elegir una vista en el selector envía la orden y la deja seleccionada', async () => {
    const w = await montarListo();
    const selector = w.get('[data-testid="selector-vista"]');
    await selector.setValue('superior');
    const o = orden(w)!;
    if (o.tipo !== 'estado') throw new Error('orden inesperada');
    const v = o.estado.posicion.map((c, i) => c - o.estado.objetivo[i]!);
    const d = direccionDeVista('superior');
    v.forEach((c, i) => expect(c / Math.hypot(...v)).toBeCloseTo(d[i]!, 5));
    expect((selector.element as HTMLSelectElement).value).toBe('superior');
  });

  it('una vista desconocida (valor manipulado) se ignora', async () => {
    const w = await montarListo();
    const selector = w.get('[data-testid="selector-vista"]');
    (selector.element as HTMLSelectElement).insertAdjacentHTML(
      'beforeend',
      '<option value="tejado">Tejado</option>',
    );
    await selector.setValue('tejado');
    expect(orden(w)).toBeNull();
  });

  it('acercar y alejar envían órdenes de zoom con el factor del botón', async () => {
    const w = await montarListo();
    await w.get('[data-testid="acercar"]').trigger('click');
    const a = orden(w)!;
    expect(a).toMatchObject({ tipo: 'zoom', factor: FACTOR_ZOOM_BOTON });
    await w.get('[data-testid="alejar"]').trigger('click');
    const b = orden(w)!;
    expect(b).toMatchObject({ tipo: 'zoom' });
    expect((b as { factor: number }).factor).toBeCloseTo(1 / FACTOR_ZOOM_BOTON, 10);
    expect(b.id).toBeGreaterThan(a.id);
  });

  it('"Ver todo" vuelve al encuadre general frontal', async () => {
    const w = await montarListo();
    await w.get('[data-testid="selector-vista"]').setValue('inferior');
    await w.get('[data-testid="ver-todo"]').trigger('click');
    expect((w.get('[data-testid="selector-vista"]').element as HTMLSelectElement).value).toBe(
      'frontal',
    );
  });

  it('si el estudiante gira a mano, la vista pasa a "vista libre"', async () => {
    const w = await montarListo();
    await w.get('[data-testid="selector-vista"]').setValue('lateral_izquierda');
    camara(w).vm.$emit('interrumpida');
    await flushPromises();
    expect((w.get('[data-testid="selector-vista"]').element as HTMLSelectElement).value).toBe('');
    expect(w.get('[data-testid="selector-vista"]').text()).toContain('Vista libre');
  });

  it('un nodo pedido antes de que cargue el modelo se enfoca cuando ya se puede ubicar', async () => {
    let soltar!: () => void;
    fetchMock.mockImplementation(async () => {
      await new Promise<void>((r) => (soltar = r));
      return respuestaModelo();
    });
    const w = montar({ seleccionId: 'condilo', ordenEnfoque: 1 });
    await flushPromises();
    expect(w.attributes('data-estado')).toBe('cargando');
    soltar();
    await flushPromises();
    const o = orden(w);
    expect(o).not.toBeNull();
    expect(o!.tipo).toBe('estado');
  });
});

describe('movimiento reducido (R3)', () => {
  it('pasa a la cámara la preferencia del sistema (por defecto, animada)', async () => {
    const w = await montarListo();
    expect(camara(w).props('reducirMovimiento')).toBe(false);
  });

  it('con prefers-reduced-motion: reduce la cámara recibe reducirMovimiento', async () => {
    mockMatchMedia(true);
    const w = await montarListo();
    expect(camara(w).props('reducirMovimiento')).toBe(true);
  });

  it('el punto seleccionado solo escala con motion-safe', async () => {
    const w = await montarListo({ seleccionId: 'condilo' });
    await proyectar(w, [{ id: 'condilo' }]);
    expect(punto(w, 'condilo').get('span').classes()).toContain('motion-safe:transition-transform');
  });
});

describe('desmontaje', () => {
  it('cancela la descarga en curso y libera la geometría', async () => {
    let senal: AbortSignal | undefined;
    fetchMock.mockImplementation(async (_url, init) => {
      senal = init?.signal ?? undefined;
      return respuestaModelo();
    });
    const w = await montarListo();
    const dispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    dispose.mockClear();
    w.unmount();
    expect(senal?.aborted).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('desmontar mientras carga aborta la descarga y no deja errores', async () => {
    let senal: AbortSignal | undefined;
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_r, rechazar) => {
          senal = init?.signal ?? undefined;
          senal?.addEventListener('abort', () => rechazar(new DOMException('abort', 'AbortError')));
        }),
    );
    const w = montar();
    await flushPromises();
    w.unmount();
    await flushPromises();
    expect(senal?.aborted).toBe(true);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('no deja temporizadores pendientes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      const w = montar();
      await flushPromises();
      w.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
