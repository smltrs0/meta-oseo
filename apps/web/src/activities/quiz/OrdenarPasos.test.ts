/**
 * Pruebas de la lista reordenable: botones Subir/Bajar (teclado y lector de pantalla), arrastre
 * con eventos de puntero (táctil simulado), foco y ausencia de escuchas globales.
 */
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrdenarPasos from './OrdenarPasos.vue';

const TEXTOS = ['Activación', 'Reabsorción', 'Inversión', 'Formación'];
const ALTO = 52;
const PASO = 60; // alto + separación entre filas

let montados: VueWrapper[] = [];

/** Cada fila mide 52 px de alto y empieza cada 60 px (happy-dom no hace maquetación). */
function simularMaquetacion(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const indice = Array.from(this.parentElement?.children ?? []).indexOf(this);
    const top = Math.max(0, indice) * PASO;
    return {
      top,
      bottom: top + ALTO,
      left: 0,
      right: 300,
      width: 300,
      height: ALTO,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

function montar(
  orden: number[] = [0, 1, 2, 3],
  extra: Record<string, unknown> = {},
  textos: string[] = TEXTOS,
) {
  const actualizaciones: number[][] = [];
  const anuncios: string[] = [];
  let editando = 0;
  const wrapper: VueWrapper = mount(OrdenarPasos, {
    attachTo: document.body,
    props: {
      modelValue: orden,
      textos,
      'onUpdate:modelValue': (nuevo: number[]) => {
        actualizaciones.push(nuevo);
        void wrapper.setProps({ modelValue: nuevo });
      },
      onAnuncio: (t: string) => anuncios.push(t),
      onEditando: () => editando++,
      ...extra,
    } as never,
  });
  montados.push(wrapper);
  return { wrapper, actualizaciones, anuncios, editando: () => editando };
}

const filas = (w: VueWrapper) => w.findAll('ol > li');
const nombres = (w: VueWrapper) => filas(w).map((f) => f.find('.texto-linea').text());

function puntero(
  tipo: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  clientY: number,
  extra: Record<string, unknown> = {},
) {
  return {
    clientY,
    clientX: 10,
    pointerId: 1,
    pointerType: 'touch',
    button: 0,
    isPrimary: true,
    ...extra,
    tipo,
  };
}

async function arrastrar(
  w: VueWrapper,
  desde: number,
  aY: number,
  terminar: 'pointerup' | 'pointercancel' | null = 'pointerup',
  extra: Record<string, unknown> = {},
) {
  const asa = filas(w)[desde]!.find('[data-asa]');
  const yInicial = desde * PASO + ALTO / 2;
  await asa.trigger('pointerdown', puntero('pointerdown', yInicial, extra));
  await asa.trigger('pointermove', puntero('pointermove', aY, extra));
  if (terminar) await asa.trigger(terminar, puntero(terminar, aY, extra));
}

beforeEach(() => simularMaquetacion());
afterEach(() => {
  for (const w of montados) w.unmount();
  montados = [];
  document.body.innerHTML = '';
});

describe('OrdenarPasos: botones', () => {
  it('muestra los pasos en el orden dado, con botones nativos de nombre accesible', () => {
    const { wrapper } = montar([2, 0, 3, 1]);
    expect(nombres(wrapper)).toEqual(['Inversión', 'Activación', 'Formación', 'Reabsorción']);
    const botones = wrapper.findAll('button');
    expect(botones).toHaveLength(8);
    for (const b of botones) expect(b.attributes('type')).toBe('button');
    expect(botones[0]!.attributes('aria-label')).toBe('Subir el paso «Inversión»');
    expect(botones[1]!.attributes('aria-label')).toBe('Bajar el paso «Inversión»');
    // El primero no sube y el último no baja.
    expect(botones[0]!.attributes('disabled')).toBeDefined();
    expect(botones[7]!.attributes('disabled')).toBeDefined();
    expect(botones[1]!.attributes('disabled')).toBeUndefined();
    // Es una lista de verdad, con nombre.
    expect(wrapper.find('ol').attributes('role')).toBe('list');
    expect(wrapper.find('ol').attributes('aria-label')).toBeTruthy();
  });

  it('Bajar intercambia con el siguiente y anuncia la nueva posición', async () => {
    const { wrapper, actualizaciones, anuncios, editando } = montar();
    await filas(wrapper)[0]!.find('[data-accion="bajar"]').trigger('click');
    expect(actualizaciones).toEqual([[1, 0, 2, 3]]);
    expect(anuncios).toEqual(['«Activación» ahora está en la posición 2 de 4.']);
    expect(editando()).toBe(1);
    expect(nombres(wrapper)).toEqual(['Reabsorción', 'Activación', 'Inversión', 'Formación']);
  });

  it('Subir intercambia con el anterior', async () => {
    const { wrapper, actualizaciones } = montar();
    await filas(wrapper)[3]!.find('[data-accion="subir"]').trigger('click');
    expect(actualizaciones).toEqual([[0, 1, 3, 2]]);
  });

  it('el botón deshabilitado del borde no hace nada', async () => {
    const { wrapper, actualizaciones } = montar();
    await filas(wrapper)[0]!.find('[data-accion="subir"]').trigger('click');
    await filas(wrapper)[3]!.find('[data-accion="bajar"]').trigger('click');
    expect(actualizaciones).toEqual([]);
  });

  it('tras mover, el foco sigue en el mismo botón del paso (ahora en su nueva posición)', async () => {
    const { wrapper } = montar();
    const boton = filas(wrapper)[1]!.find('[data-accion="bajar"]');
    (boton.element as HTMLElement).focus();
    await boton.trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    const activo = document.activeElement as HTMLElement;
    expect(activo.getAttribute('aria-label')).toBe('Bajar el paso «Reabsorción»');
    expect(filas(wrapper)[2]!.element.contains(activo)).toBe(true);
  });

  it('si el paso llega al borde y ese botón queda deshabilitado, el foco pasa al opuesto (no se pierde)', async () => {
    const { wrapper } = montar([1, 0, 2, 3]);
    const boton = filas(wrapper)[1]!.find('[data-accion="subir"]');
    (boton.element as HTMLElement).focus();
    await boton.trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe(
      'Bajar el paso «Activación»',
    );
  });

  it('el orden de tabulación es el del DOM: Subir y Bajar de cada paso, en orden', () => {
    const { wrapper } = montar();
    const etiquetas = wrapper.findAll('button').map((b) => b.attributes('aria-label'));
    expect(etiquetas).toEqual(
      TEXTOS.flatMap((t) => [`Subir el paso «${t}»`, `Bajar el paso «${t}»`]),
    );
  });

  it('los textos con Markdown se ven formateados y el nombre accesible va sin marcas', () => {
    const { wrapper } = montar([0, 1, 2], {}, [
      'Paso **uno** con *énfasis*',
      '[Osteoblasto](glosario:osteoblasto) forma',
      'Tercero',
    ]);
    expect(filas(wrapper)[0]!.html()).toContain('<strong>uno</strong>');
    expect(filas(wrapper)[1]!.html()).toContain('data-glosario="osteoblasto"');
    expect(filas(wrapper)[0]!.find('button').attributes('aria-label')).toBe(
      'Subir el paso «Paso uno con énfasis»',
    );
    expect(filas(wrapper)[1]!.find('button').attributes('aria-label')).toContain(
      'Osteoblasto forma',
    );
  });

  it('Unicode: emoji, ideogramas, RTL y combinantes se muestran y se nombran tal cual', () => {
    const raros = ['Ca²⁺ → HPO₄²⁻', '骨形成 🦴', 'عظم', 'é combinante'];
    const { wrapper } = montar([0, 1, 2, 3], {}, raros);
    expect(nombres(wrapper)).toEqual(raros);
    expect(wrapper.findAll('button')[2]!.attributes('aria-label')).toBe(
      'Subir el paso «骨形成 🦴»',
    );
  });

  it('un texto larguísimo no rompe nada y el botón conserva su nombre completo', () => {
    const largo = 'palabra'.repeat(200);
    const { wrapper } = montar([0, 1, 2], {}, [largo, 'b', 'c']);
    expect(wrapper.findAll('button')[0]!.attributes('aria-label')).toContain(largo);
  });
});

describe('OrdenarPasos: arrastre con puntero (táctil)', () => {
  it('arrastrar el asa del primer paso más allá del tercero lo deja en tercer lugar', async () => {
    const { wrapper, actualizaciones, anuncios } = montar();
    // Centros de las filas: 26, 86, 146, 206. Se suelta con el centro en 26 + 130 = 156.
    await arrastrar(wrapper, 0, 156);
    expect(actualizaciones).toEqual([[1, 2, 0, 3]]);
    expect(anuncios).toEqual(['«Activación» ahora está en la posición 3 de 4.']);
  });

  it('arrastrar hacia arriba también reordena', async () => {
    const { wrapper, actualizaciones } = montar();
    await arrastrar(wrapper, 3, 3 * PASO + ALTO / 2 - 190); // centro en 16: por encima de todo
    expect(actualizaciones).toEqual([[3, 0, 1, 2]]);
  });

  it('mientras se arrastra, la fila sigue al dedo y las intermedias se apartan; al soltar todo se limpia', async () => {
    const { wrapper } = montar();
    const asa = filas(wrapper)[0]!.find('[data-asa]');
    await asa.trigger('pointerdown', puntero('pointerdown', 26));
    await asa.trigger('pointermove', puntero('pointermove', 156));
    expect(filas(wrapper)[0]!.attributes('style')).toContain('translateY(130px)');
    expect(filas(wrapper)[0]!.attributes('data-arrastrando')).toBe('true');
    expect(filas(wrapper)[1]!.attributes('style')).toContain('translateY(-60px)');
    expect(filas(wrapper)[2]!.attributes('style')).toContain('translateY(-60px)');
    expect(filas(wrapper)[3]!.attributes('style') ?? '').not.toContain('translateY');
    await asa.trigger('pointerup', puntero('pointerup', 156));
    for (const fila of filas(wrapper)) {
      expect(fila.attributes('style') ?? '').not.toContain('translateY');
      expect(fila.attributes('data-arrastrando')).toBeUndefined();
    }
  });

  it('un arrastre corto que no cruza ninguna fila no cambia el orden', async () => {
    const { wrapper, actualizaciones } = montar();
    await arrastrar(wrapper, 1, 1 * PASO + ALTO / 2 + 20);
    expect(actualizaciones).toEqual([]);
  });

  it('pointercancel devuelve todo a su sitio sin reordenar', async () => {
    const { wrapper, actualizaciones } = montar();
    await arrastrar(wrapper, 0, 156, 'pointercancel');
    expect(actualizaciones).toEqual([]);
    expect(filas(wrapper)[0]!.attributes('style') ?? '').not.toContain('translateY');
  });

  it('lostpointercapture también cancela (el sistema se llevó el puntero)', async () => {
    const { wrapper, actualizaciones } = montar();
    const asa = filas(wrapper)[0]!.find('[data-asa]');
    await asa.trigger('pointerdown', puntero('pointerdown', 26));
    await asa.trigger('pointermove', puntero('pointermove', 156));
    await asa.trigger('lostpointercapture', puntero('pointerup', 156));
    await asa.trigger('pointerup', puntero('pointerup', 156));
    expect(actualizaciones).toEqual([]);
  });

  it('ignora un segundo dedo (otro pointerId) mientras hay un arrastre', async () => {
    const { wrapper, actualizaciones } = montar();
    const asa = filas(wrapper)[0]!.find('[data-asa]');
    await asa.trigger('pointerdown', puntero('pointerdown', 26));
    await asa.trigger('pointermove', puntero('pointermove', 156, { pointerId: 2 }));
    await asa.trigger('pointerup', puntero('pointerup', 156, { pointerId: 2 }));
    expect(actualizaciones).toEqual([]);
    // El arrastre original sigue vivo y se puede terminar.
    await asa.trigger('pointermove', puntero('pointermove', 156));
    await asa.trigger('pointerup', puntero('pointerup', 156));
    expect(actualizaciones).toEqual([[1, 2, 0, 3]]);
  });

  it('con el ratón solo arrastra el botón principal', async () => {
    const { wrapper, actualizaciones } = montar();
    await arrastrar(wrapper, 0, 156, 'pointerup', { pointerType: 'mouse', button: 2 });
    expect(actualizaciones).toEqual([]);
    await arrastrar(wrapper, 0, 156, 'pointerup', { pointerType: 'mouse', button: 0 });
    expect(actualizaciones).toEqual([[1, 2, 0, 3]]);
  });

  it('touch-action: none va SOLO en el asa (el resto de la fila deja desplazar la página, R8)', () => {
    const { wrapper } = montar();
    const html = wrapper.html();
    expect(html.match(/touch-action/g)).toHaveLength(4); // una por asa
    for (const asa of wrapper.findAll('[data-asa]')) {
      expect(asa.attributes('style')).toContain('touch-action: none');
    }
    expect(wrapper.find('ol').attributes('style') ?? '').not.toContain('touch-action');
    for (const fila of filas(wrapper)) {
      expect(fila.attributes('style') ?? '').not.toContain('touch-action');
    }
  });

  it('el asa y su icono son decorativos (aria-hidden) y de al menos 44 px', () => {
    const { wrapper } = montar();
    for (const asa of wrapper.findAll('[data-asa]')) {
      expect(asa.attributes('aria-hidden')).toBe('true');
      expect(asa.classes()).toContain('w-11');
      expect(asa.classes()).toContain('min-h-11');
    }
    for (const boton of wrapper.findAll('button')) {
      expect(boton.classes()).toContain('min-h-11');
      expect(boton.classes()).toContain('min-w-11');
    }
  });

  it('no añade escuchas a document ni a window (nada que fugar al desmontar)', async () => {
    const enDocumento = vi.spyOn(document, 'addEventListener');
    const enVentana = vi.spyOn(window, 'addEventListener');
    const { wrapper } = montar();
    await arrastrar(wrapper, 0, 156);
    expect(enDocumento).not.toHaveBeenCalled();
    expect(enVentana).not.toHaveBeenCalled();
  });

  it('desmontar en pleno arrastre no lanza ni emite después', async () => {
    const { wrapper, actualizaciones } = montar();
    const asa = filas(wrapper)[0]!.find('[data-asa]');
    await asa.trigger('pointerdown', puntero('pointerdown', 26));
    await asa.trigger('pointermove', puntero('pointermove', 156));
    expect(() => wrapper.unmount()).not.toThrow();
    montados = montados.filter((w) => w !== wrapper);
    expect(actualizaciones).toEqual([]);
  });

  it('sin setPointerCapture (entornos viejos) el arrastre igual funciona', async () => {
    const original = (HTMLElement.prototype as { setPointerCapture?: unknown }).setPointerCapture;
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: () => {
        throw new Error('no soportado');
      },
    });
    try {
      const { wrapper, actualizaciones } = montar();
      await arrastrar(wrapper, 0, 156);
      expect(actualizaciones).toEqual([[1, 2, 0, 3]]);
    } finally {
      if (original === undefined) {
        delete (HTMLElement.prototype as { setPointerCapture?: unknown }).setPointerCapture;
      } else {
        Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
          configurable: true,
          value: original,
        });
      }
    }
  });
});

describe('OrdenarPasos: bloqueada y con marcas', () => {
  it('deshabilitada: sin asas ni botones, y no se puede reordenar', async () => {
    const { wrapper, actualizaciones } = montar([0, 1, 2, 3], { deshabilitado: true });
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(wrapper.findAll('[data-asa]')).toHaveLength(0);
    expect(actualizaciones).toEqual([]);
  });

  it('las marcas llevan icono y texto ("En su lugar" / "Fuera de lugar"), no solo color', () => {
    const { wrapper } = montar([0, 1, 2, 3], {
      deshabilitado: true,
      marcas: [true, false, false, true],
    });
    const textos = filas(wrapper).map((f) => f.text());
    expect(textos[0]).toContain('En su lugar');
    expect(textos[1]).toContain('Fuera de lugar');
    expect(textos[2]).toContain('Fuera de lugar');
    expect(textos[3]).toContain('En su lugar');
    expect(filas(wrapper)[0]!.find('svg').exists()).toBe(true);
  });

  it('sin movimiento reducido las filas animan el desplazamiento; con él, no', () => {
    const normal = montar();
    expect(filas(normal.wrapper)[0]!.classes()).toContain('transition-transform');
    const reducido = montar([0, 1, 2, 3], { movimientoReducido: true });
    expect(filas(reducido.wrapper)[0]!.classes()).not.toContain('transition-transform');
  });
});
