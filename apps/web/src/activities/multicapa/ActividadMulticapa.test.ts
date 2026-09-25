/**
 * Pruebas de ActividadMulticapa: batería de contrato + flujo feliz y de error, reintentos y
 * penalización, estado restaurado, teclado, puntero táctil simulado, reduced-motion, desmontaje y
 * configuraciones adversariales. Sin navegador: happy-dom y un `fetch` simulado.
 */
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropsActividadMulticapa, ResultadoActividad } from '@/activities/types';
import { pruebasDeContratoActividad, problemasDeEmisiones } from '@/content/__fixtures__/contrato';
import type { EventosEmitidos } from '@/content/__fixtures__/contrato';
import { PROGRESO_INTERVALO_MIN_MS } from '@/content/constantes';
import { calcularPuntaje } from '@/content/scoring';
import type { ActividadMulticapa } from '@/content/schema';
import Actividad from './ActividadMulticapa.vue';
import fuenteDelComponente from './ActividadMulticapa.vue?raw';
import fuenteTextoLinea from './TextoLinea.vue?raw';
import { construirConsignas } from './logica';
import {
  SVG_CELULAS,
  SVG_HUESO,
  clonar,
  explorarDeMuestra,
  generar,
  identificarDeMuestra,
  simularFetch,
} from './utilesPrueba';
import type { RespuestaSimulada } from './utilesPrueba';

enableAutoUnmount(afterEach);

type Props = Omit<PropsActividadMulticapa, 'modulo'> & { modulo?: 1 | 2 | 3 | 4 | 5 | 6 };

const explorar = explorarDeMuestra();
const identificar = identificarDeMuestra();

/** Respuesta por defecto: el SVG de muestra que corresponda a la ruta pedida. */
function svgPorRuta(url: string): RespuestaSimulada {
  if (url.includes('hueso_capas')) return { cuerpo: SVG_HUESO };
  if (url.includes('celulas_histologia')) return { cuerpo: SVG_CELULAS };
  return { estado: 404 };
}

beforeEach(() => {
  simularFetch(svgPorRuta);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function montar(actividad: ActividadMulticapa, extra: Partial<Props> = {}): VueWrapper {
  return mount(Actividad, {
    props: { modulo: 1, actividad, ...extra },
    attachTo: document.body,
  }) as unknown as VueWrapper;
}

async function montarListo(
  actividad: ActividadMulticapa,
  extra: Partial<Props> = {},
): Promise<VueWrapper> {
  const w = montar(actividad, extra);
  await flushPromises();
  return w;
}

/* ---- ayudas de consulta ---- */

const lista = (w: VueWrapper) => w.get('[data-testid="multicapa-lista"]');
function botonCapa(w: VueWrapper, id: string) {
  const b = lista(w)
    .findAll('button')
    .find((x) => x.attributes('data-capa') === id);
  if (!b) throw new Error(`No hay botón para la capa ${id}`);
  return b;
}
const pulsarCapa = async (w: VueWrapper, id: string) => {
  await botonCapa(w, id).trigger('click');
  await flushPromises();
};
const completada = (w: VueWrapper) =>
  w.emitted('completada')?.[0]?.[0] as ResultadoActividad<'multicapa'> | undefined;
const interacciones = (w: VueWrapper) =>
  (w.emitted('interaccion') ?? []).map((e) => e[0] as Record<string, unknown>);
const progresos = (w: VueWrapper) =>
  (w.emitted('progreso') ?? []).map((e) => e[0] as Record<string, unknown>);
const ficha = (w: VueWrapper) => w.get('[data-testid="multicapa-ficha"]');
const anuncio = (w: VueWrapper) => w.get('[data-testid="multicapa-anuncio"]').text();

/** Elemento dibujado de una capa en el SVG inyectado (la capa `<g>` del propio dibujo). */
function grupoSvg(w: VueWrapper, id: string): Element {
  const raiz = w.get('[data-testid="multicapa-svg"]').element;
  const g = Array.from(raiz.querySelectorAll('[data-capa]')).find(
    (e) => e.getAttribute('data-capa') === id,
  );
  if (!g) throw new Error(`El SVG no tiene la capa ${id}`);
  return g;
}

/** Punto tocable dentro de una capa: la primera zona clonada o, si no, la primera forma. */
function puntoTocable(w: VueWrapper, id: string): Element {
  const g = grupoSvg(w, id);
  return g.querySelector('[data-zona-auto], [data-zona-toque]') ?? g.firstElementChild!;
}

function evento(tipo: string, extra: Record<string, unknown> = {}): Event {
  const e = new Event(tipo, { bubbles: true, cancelable: true });
  for (const [k, v] of Object.entries(extra)) Object.defineProperty(e, k, { value: v });
  return e;
}

/** Toque de dedo simulado: pointerdown/up con `pointerType: 'touch'` y el clic que genera el navegador. */
async function tocarConDedo(w: VueWrapper, id: string): Promise<void> {
  const el = puntoTocable(w, id);
  el.dispatchEvent(evento('pointerover', { pointerType: 'touch' }));
  el.dispatchEvent(evento('pointerdown', { pointerType: 'touch' }));
  el.dispatchEvent(evento('pointerup', { pointerType: 'touch' }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

async function clicEnSvg(w: VueWrapper, id: string): Promise<void> {
  puntoTocable(w, id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

/** Recorre las consignas de `identificar` tocando la capa correcta de cada una. */
async function completarIdentificar(w: VueWrapper, actividad: ActividadMulticapa): Promise<void> {
  for (const c of construirConsignas(actividad.config)) await pulsarCapa(w, c.capa);
}

async function completarExplorar(w: VueWrapper, actividad: ActividadMulticapa): Promise<void> {
  for (const id of actividad.config.requeridas) await pulsarCapa(w, id);
}

/* -------------------------------------------------------------------------------------------
 * Batería de contrato
 * ----------------------------------------------------------------------------------------- */

pruebasDeContratoActividad<'multicapa'>({
  nombre: 'ActividadMulticapa (explorar)',
  actividad: explorar,
  montar: (props) => mount(Actividad, { props }) as unknown as VueWrapper,
  completar: (w) => completarExplorar(w, explorar),
  precisionEsperada: 1,
});

pruebasDeContratoActividad<'multicapa'>({
  nombre: 'ActividadMulticapa (identificar)',
  actividad: identificar,
  montar: (props) => mount(Actividad, { props }) as unknown as VueWrapper,
  completar: (w) => completarIdentificar(w, identificar),
  precisionEsperada: 1,
});

/* -------------------------------------------------------------------------------------------
 * Flujo feliz: explorar
 * ----------------------------------------------------------------------------------------- */

describe('explorar: flujo feliz', () => {
  it('muestra título, instrucciones, el dibujo inyectado y una lista con todas las capas', async () => {
    const w = await montarListo(explorar);
    expect(w.get('h3').text()).toBe(explorar.titulo);
    expect(w.text()).toContain('Toca cada capa del dibujo');
    const botones = lista(w).findAll('button');
    expect(botones.map((b) => b.text())).toEqual(
      expect.arrayContaining([expect.stringContaining('Periostio')]),
    );
    expect(botones).toHaveLength(explorar.config.capas.length);
    // El dibujo es un <svg> inline, no una imagen.
    expect(w.find('[data-testid="multicapa-svg"] svg').exists()).toBe(true);
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('[data-testid="multicapa-svg"]').attributes('aria-label')).toBe(
      explorar.config.alt,
    );
    expect(w.get('[data-testid="multicapa-svg"]').attributes('role')).toBe('group');
  });

  it('cada capa es un botón nativo con nombre accesible y área táctil de 44 px', async () => {
    const w = await montarListo(explorar);
    for (const b of lista(w).findAll('button')) {
      expect(b.element.tagName).toBe('BUTTON');
      expect(b.attributes('type')).toBe('button');
      expect(b.text().length).toBeGreaterThan(0);
      expect(b.classes()).toContain('min-h-11');
    }
  });

  it('tocar una capa abre su ficha, emite la interacción y avanza el progreso', async () => {
    const w = await montarListo(explorar);
    await pulsarCapa(w, 'capa_periostio');
    expect(ficha(w).text()).toContain('Periostio');
    expect(ficha(w).text()).toContain('Membrana externa');
    expect(interacciones(w)).toEqual([{ accion: 'selecciona_capa', objeto: 'capa_periostio' }]);
    expect(w.text()).toContain('Capas obligatorias vistas: 1 de 3');
    const p = progresos(w).at(-1)!;
    expect(p.avance).toBeCloseTo(1 / 3, 6);
    expect(p.intentos).toBe(1);
    expect(p.instantanea).toEqual({ modo: 'explorar', visitadas: ['capa_periostio'] });
    expect(anuncio(w)).toContain('Periostio');
    expect(anuncio(w)).toContain('1 de 3');
  });

  it('una capa no requerida se lee pero no avanza; repetir una capa no suma', async () => {
    const w = await montarListo(explorar);
    await pulsarCapa(w, 'capa_hueso_esponjoso');
    expect(w.text()).toContain('Capas obligatorias vistas: 0 de 3');
    await pulsarCapa(w, 'capa_periostio');
    await pulsarCapa(w, 'capa_periostio');
    expect(w.text()).toContain('Capas obligatorias vistas: 1 de 3');
    expect(completada(w)).toBeUndefined();
  });

  it('al ver las requeridas emite UN resultado con precisión 1, puntaje completo y el detalle', async () => {
    const w = await montarListo(explorar);
    await completarExplorar(w, explorar);
    expect(w.emitted('completada')).toHaveLength(1);
    const r = completada(w)!;
    expect(r).toMatchObject({ puntaje: 30, intentos: 1, precision: 1 });
    expect(r.detalle).toEqual({
      modo: 'explorar',
      visitadas: ['capa_periostio', 'capa_hueso_compacto', 'capa_medula_osea'],
    });
    expect(problemasDeEmisiones(w.emitted() as EventosEmitidos, explorar)).toEqual([]);
    expect(w.get('[data-testid="multicapa-resultado"]').text()).toContain('Actividad completada');
    expect(anuncio(w)).toContain('Actividad completada');
  });

  it('al completar, el foco pasa al encabezado del resultado (R6)', async () => {
    const w = await montarListo(explorar);
    await completarExplorar(w, explorar);
    await flushPromises();
    expect(document.activeElement?.textContent).toContain('Actividad completada');
  });

  it('tocar el dibujo equivale a pulsar el botón de la lista', async () => {
    const w = await montarListo(explorar);
    await clicEnSvg(w, 'capa_hueso_compacto');
    expect(ficha(w).text()).toContain('Hueso compacto');
    expect(interacciones(w)).toEqual([
      { accion: 'selecciona_capa', objeto: 'capa_hueso_compacto' },
    ]);
    expect(grupoSvg(w, 'capa_hueso_compacto').classList.contains('es-activa')).toBe(true);
    expect(botonCapa(w, 'capa_hueso_compacto').attributes('aria-current')).toBe('true');
  });

  it('una vez completada se pueden leer más fichas, pero no se emite progreso ni otra completada', async () => {
    const w = await montarListo(explorar);
    await completarExplorar(w, explorar);
    const progresosAntes = progresos(w).length;
    await pulsarCapa(w, 'capa_hueso_esponjoso');
    await pulsarCapa(w, 'capa_periostio');
    expect(ficha(w).text()).toContain('Periostio');
    expect(progresos(w)).toHaveLength(progresosAntes);
    expect(w.emitted('completada')).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------------------------
 * Flujo feliz y de error: identificar
 * ----------------------------------------------------------------------------------------- */

describe('identificar: flujo feliz y de error', () => {
  it('pide las consignas en orden, con la pista y luego las pistas extra', async () => {
    const w = await montarListo(identificar);
    const consignas = construirConsignas(identificar.config);
    expect(consignas).toHaveLength(4);
    expect(w.get('[data-testid="multicapa-consigna"]').text()).toContain('célula cúbica');
    expect(w.text()).toContain('Consigna 1 de 4');
    await pulsarCapa(w, 'histo_osteoblasto');
    expect(w.get('[data-testid="multicapa-consigna"]').text()).toContain('estrellada');
    await pulsarCapa(w, 'histo_osteocito');
    await pulsarCapa(w, 'histo_osteoclasto');
    expect(w.get('[data-testid="multicapa-consigna"]').text()).toContain('borde en cepillo');
    expect(w.text()).toContain('Consigna 4 de 4');
  });

  it('todo bien: precisión 1, puntaje completo y detalle de aciertos', async () => {
    const w = await montarListo(identificar);
    await completarIdentificar(w, identificar);
    expect(completada(w)).toMatchObject({ puntaje: 30, intentos: 1, precision: 1 });
    expect(completada(w)!.detalle).toEqual({
      modo: 'identificar',
      aciertos: 4,
      errores: 0,
      errores_por_capa: {},
    });
    expect(interacciones(w).filter((i) => i.accion === 'identifica_capa')).toHaveLength(4);
    expect(
      interacciones(w).every((i) => i.accion !== 'identifica_capa' || i.resultado === 'correcta'),
    ).toBe(true);
  });

  it('un toque equivocado cuenta un fallo, abre la ficha tocada y emite las dos interacciones', async () => {
    const w = await montarListo(identificar);
    await pulsarCapa(w, 'histo_osteocito'); // se pedía el osteoblasto
    const v = w.get('[data-testid="multicapa-veredicto"]');
    expect(v.attributes('data-veredicto')).toBe('incorrecta');
    expect(v.text()).toContain('Osteocito');
    expect(ficha(w).text()).toContain('atrapada en la matriz');
    expect(interacciones(w)).toEqual([
      { accion: 'identifica_capa', objeto: 'histo_osteoblasto', resultado: 'incorrecta' },
      { accion: 'selecciona_capa', objeto: 'histo_osteocito' },
    ]);
    expect(w.text()).toContain('Fallos: 1');
    // No avanzó: sigue la misma consigna.
    expect(w.text()).toContain('Consigna 1 de 4');
    expect(progresos(w).at(-1)!.avance).toBe(0);
  });

  it('la precisión es aciertos / (aciertos + fallos) y el puntaje sale de calcularPuntaje', async () => {
    const w = await montarListo(identificar);
    await pulsarCapa(w, 'histo_osteocito'); // fallo 1 sobre osteoblasto
    await pulsarCapa(w, 'histo_osteoclasto'); // fallo 2 sobre osteoblasto
    await completarIdentificar(w, identificar);
    const r = completada(w)!;
    expect(r.precision).toBeCloseTo(4 / 6, 6);
    expect(r.puntaje).toBe(calcularPuntaje(identificar, { precision: 4 / 6, intentos: 1 }));
    expect(r.detalle).toEqual({
      modo: 'identificar',
      aciertos: 4,
      errores: 2,
      errores_por_capa: { histo_osteoblasto: 2 },
    });
  });

  it('volver a tocar una capa ya acertada no cuenta como fallo', async () => {
    const w = await montarListo(identificar);
    await pulsarCapa(w, 'histo_osteoblasto');
    await pulsarCapa(w, 'histo_osteoblasto'); // ya acertada; ahora se pide el osteocito
    const v = w.get('[data-testid="multicapa-veredicto"]');
    expect(v.attributes('data-veredicto')).toBe('info');
    expect(w.text()).toContain('Fallos: 0');
    expect(w.text()).toContain('Consigna 2 de 4');
    const ultimas = interacciones(w).slice(-1);
    expect(ultimas).toEqual([{ accion: 'selecciona_capa', objeto: 'histo_osteoblasto' }]);
  });

  it('la lista no delata la respuesta: no resalta el dibujo al pasar por un nombre y no hay ficha por hover', async () => {
    const w = await montarListo(identificar);
    await botonCapa(w, 'histo_osteocito').trigger('pointerenter');
    await flushPromises();
    expect(grupoSvg(w, 'histo_osteocito').classList.contains('es-resaltada')).toBe(false);
    const el = puntoTocable(w, 'histo_osteocito');
    el.dispatchEvent(evento('pointerover', { pointerType: 'mouse' }));
    await flushPromises();
    expect(ficha(w).text()).not.toContain('Osteocito');
  });

  it('tocar el dibujo con un dedo (eventos de puntero táctil) responde igual que la lista', async () => {
    const w = await montarListo(identificar);
    await tocarConDedo(w, 'histo_osteoblasto');
    expect(w.text()).toContain('Consigna 2 de 4');
    await tocarConDedo(w, 'histo_osteoclasto'); // equivocada
    expect(w.text()).toContain('Fallos: 1');
    // El dedo no produce hover: la ficha es la de la última capa tocada.
    expect(ficha(w).text()).toContain('Osteoclasto');
  });

  it('aprobacion_min: si no se alcanza, el resultado lo dice y ofrece repetir', async () => {
    const actividad = clonar(identificar);
    actividad.aprobacion_min = 0.9;
    const w = await montarListo(actividad);
    await pulsarCapa(w, 'histo_osteocito');
    await completarIdentificar(w, actividad);
    expect(w.get('[data-testid="multicapa-aprobacion"]').text()).toContain('90 %');
    expect(w.find('[data-testid="multicapa-repetir"]').exists()).toBe(true);
  });
});

/* -------------------------------------------------------------------------------------------
 * Reintentos y penalización
 * ----------------------------------------------------------------------------------------- */

describe('reintentos y penalización', () => {
  it('repetir reinicia la ejecución, cuenta otro intento y aplica la penalización', async () => {
    const w = await montarListo(explorar);
    await completarExplorar(w, explorar);
    await w.get('[data-testid="multicapa-repetir"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="multicapa-resultado"]').exists()).toBe(false);
    expect(w.text()).toContain('Capas obligatorias vistas: 0 de 3');
    expect(interacciones(w).at(-1)).toEqual({ accion: 'reinicia_actividad' });
    await completarExplorar(w, explorar);
    expect(w.emitted('completada')).toHaveLength(2);
    const segundo = w.emitted('completada')![1]![0] as ResultadoActividad<'multicapa'>;
    expect(segundo.intentos).toBe(2);
    expect(segundo.puntaje).toBe(calcularPuntaje(explorar, { precision: 1, intentos: 2 }));
    expect(segundo.puntaje).toBeLessThan(30);
  });

  it('con el servidor en 4 intentos (2 de penalización tope), esta ejecución es la 5 y respeta el piso', async () => {
    const w = await montarListo(explorar, {
      estadoPrevio: { servidor: { puntaje: 20, intentos: 4, completada: true } },
    });
    await completarExplorar(w, explorar);
    const r = completada(w)!;
    expect(r.intentos).toBe(5);
    expect(r.puntaje).toBe(calcularPuntaje(explorar, { precision: 1, intentos: 5 }));
    expect(r.puntaje).toBeGreaterThanOrEqual(Math.floor(30 * 0.5));
  });

  it('el reintento de identificar parte de cero fallos', async () => {
    const w = await montarListo(identificar);
    await pulsarCapa(w, 'histo_osteocito');
    await completarIdentificar(w, identificar);
    await w.get('[data-testid="multicapa-repetir"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Fallos: 0');
    await completarIdentificar(w, identificar);
    const segundo = w.emitted('completada')![1]![0] as ResultadoActividad<'multicapa'>;
    expect(segundo.precision).toBe(1);
    expect(segundo.intentos).toBe(2);
  });
});

/* -------------------------------------------------------------------------------------------
 * Estado restaurado
 * ----------------------------------------------------------------------------------------- */

describe('estado restaurado', () => {
  it('explorar: retoma las capas ya vistas y completa con las que faltan', async () => {
    const w = await montarListo(explorar, {
      estadoPrevio: {
        progreso: {
          avance: 2 / 3,
          intentos: 1,
          instantanea: { modo: 'explorar', visitadas: ['capa_periostio', 'capa_hueso_compacto'] },
        },
      },
    });
    expect(w.text()).toContain('Capas obligatorias vistas: 2 de 3');
    expect(botonCapa(w, 'capa_periostio').text()).toContain('Vista');
    await pulsarCapa(w, 'capa_medula_osea');
    expect((completada(w)!.detalle as { visitadas: string[] }).visitadas).toEqual([
      'capa_periostio',
      'capa_hueso_compacto',
      'capa_medula_osea',
    ]);
  });

  it('identificar: retoma la consigna, los fallos y el orden barajado de la lista', async () => {
    const instantanea = {
      modo: 'identificar',
      paso: 2,
      semilla: 12345,
      errores_por_capa: { histo_osteoblasto: 1 },
    };
    const orden = async () => {
      const w = await montarListo(identificar, {
        estadoPrevio: { progreso: { avance: 0.5, intentos: 1, instantanea } },
      });
      return {
        w,
        ids: lista(w)
          .findAll('button')
          .map((b) => b.attributes('data-capa')),
      };
    };
    const a = await orden();
    const b = await orden();
    expect(a.ids).toEqual(b.ids);
    expect(a.w.text()).toContain('Consigna 3 de 4');
    expect(a.w.text()).toContain('Fallos: 1');
    expect(a.w.text()).toContain('Aciertos: 2');
    await completarIdentificarDesde(a.w, 2);
    const r = completada(a.w)!;
    expect(r.precision).toBeCloseTo(4 / 5, 6);
    expect(r.detalle).toMatchObject({ aciertos: 4, errores: 1 });
  });

  it('el progreso guardado no puede rebajar los intentos que ya conoce el servidor', async () => {
    const w = await montarListo(explorar, {
      estadoPrevio: {
        servidor: { puntaje: 10, intentos: 3, completada: true },
        progreso: { avance: 0.3, intentos: 1, instantanea: { modo: 'explorar', visitadas: [] } },
      },
    });
    await completarExplorar(w, explorar);
    expect(completada(w)!.intentos).toBe(4);
  });

  it('un intento a medias posterior a lo que sabe el servidor se conserva', async () => {
    const w = await montarListo(explorar, {
      estadoPrevio: {
        servidor: { puntaje: 10, intentos: 1, completada: true },
        progreso: { avance: 0.3, intentos: 4, instantanea: { modo: 'explorar', visitadas: [] } },
      },
    });
    await completarExplorar(w, explorar);
    expect(completada(w)!.intentos).toBe(4);
  });

  it('llegada tardía: si el estado llega antes de la primera acción, se restaura la instantánea', async () => {
    const w = await montarListo(explorar);
    expect(w.text()).toContain('vistas: 0 de 3');
    await w.setProps({
      estadoPrevio: {
        servidor: { puntaje: 0, intentos: 1, completada: false },
        progreso: {
          avance: 1 / 3,
          intentos: 2,
          instantanea: { modo: 'explorar', visitadas: ['capa_periostio'] },
        },
      },
    } as never);
    await flushPromises();
    expect(w.text()).toContain('vistas: 1 de 3');
    await completarExplorar(w, explorar);
    expect(completada(w)!.intentos).toBe(2);
  });

  it('llegada tardía: después de la primera acción el estado nuevo ya no pisa lo hecho', async () => {
    const w = await montarListo(explorar);
    await pulsarCapa(w, 'capa_periostio');
    await w.setProps({
      estadoPrevio: { servidor: { puntaje: 5, intentos: 3, completada: true } },
    } as never);
    await flushPromises();
    expect(w.text()).toContain('vistas: 1 de 3');
    await pulsarCapa(w, 'capa_hueso_compacto');
    await pulsarCapa(w, 'capa_medula_osea');
    expect(completada(w)!.intentos).toBe(1);
  });

  it('una instantánea de otro modo, corrupta o con ids que ya no existen se ignora', async () => {
    const casos: unknown[] = [
      { modo: 'identificar', paso: 1 },
      { modo: 'explorar', visitadas: 'no soy una lista' },
      { modo: 'explorar', visitadas: ['fantasma', 7, null, 'capa_periostio', 'capa_periostio'] },
      null,
      'texto',
      [],
    ];
    for (const instantanea of casos) {
      const w = await montarListo(explorar, {
        estadoPrevio: { progreso: { avance: 0.5, intentos: 1, instantanea: instantanea as never } },
      });
      await completarExplorar(w, explorar);
      expect(w.emitted('completada'), JSON.stringify(instantanea)).toHaveLength(1);
      w.unmount();
    }
  });

  it('identificar: un paso fuera de rango o una semilla absurda se ignoran', async () => {
    for (const instantanea of [
      { modo: 'identificar', paso: 99, errores_por_capa: {} },
      { modo: 'identificar', paso: -1 },
      { modo: 'identificar', paso: 1.5 },
      {
        modo: 'identificar',
        paso: 1,
        semilla: 'x',
        errores_por_capa: { fantasma: 9, histo_osteoblasto: -3 },
      },
    ]) {
      const w = await montarListo(identificar, {
        estadoPrevio: { progreso: { avance: 0.5, intentos: 1, instantanea: instantanea as never } },
      });
      await completarIdentificarDesde(w, w.text().includes('Consigna 2 de 4') ? 1 : 0);
      expect(w.emitted('completada'), JSON.stringify(instantanea)).toHaveLength(1);
      w.unmount();
    }
  });

  it('una instantánea de un intento ya completo deja la última capa por ver para poder cerrarlo', async () => {
    const w = await montarListo(explorar, {
      estadoPrevio: {
        progreso: {
          avance: 1,
          intentos: 1,
          instantanea: {
            modo: 'explorar',
            visitadas: ['capa_periostio', 'capa_hueso_compacto', 'capa_medula_osea'],
          },
        },
      },
    });
    expect(w.text()).toContain('vistas: 2 de 3');
    expect(w.emitted('completada')).toBeUndefined();
  });
});

async function completarIdentificarDesde(w: VueWrapper, desde: number): Promise<void> {
  const consignas = construirConsignas(identificar.config);
  for (const c of consignas.slice(desde)) await pulsarCapa(w, c.capa);
}

/* -------------------------------------------------------------------------------------------
 * Modo revisar
 * ----------------------------------------------------------------------------------------- */

describe('modo revisar', () => {
  it('explorar: solo lectura, muestra las fichas y no emite nada', async () => {
    const w = await montarListo(explorar, {
      modo: 'revisar',
      estadoPrevio: { servidor: { puntaje: 30, intentos: 1, completada: true } },
    });
    expect(w.find('[data-testid="multicapa-aviso-revision"]').exists()).toBe(true);
    expect(w.find('[data-testid="multicapa-progreso"]').exists()).toBe(false);
    await pulsarCapa(w, 'capa_periostio');
    await pulsarCapa(w, 'capa_hueso_compacto');
    await pulsarCapa(w, 'capa_medula_osea');
    expect(ficha(w).text()).toContain('Médula ósea');
    expect(w.emitted('completada')).toBeUndefined();
    expect(w.emitted('progreso')).toBeUndefined();
    expect(w.emitted('interaccion')).toBeUndefined();
  });

  it('identificar: lista las consignas con sus respuestas correctas y no puntúa', async () => {
    const w = await montarListo(identificar, { modo: 'revisar' });
    const r = w.get('[data-testid="multicapa-respuestas"]');
    expect(r.findAll('li')).toHaveLength(4);
    expect(r.text()).toContain('Respuesta: Osteoclasto');
    await tocarConDedo(w, 'histo_osteocito');
    expect(ficha(w).text()).toContain('Osteocito');
    expect(w.emitted('completada')).toBeUndefined();
    expect(w.emitted('interaccion')).toBeUndefined();
  });

  it('cambiar de revisar a jugar reinicia la ejecución', async () => {
    const w = await montarListo(explorar, { modo: 'revisar' });
    await w.setProps({ modo: 'jugar' });
    await flushPromises();
    expect(w.find('[data-testid="multicapa-progreso"]').exists()).toBe(true);
    await completarExplorar(w, explorar);
    expect(w.emitted('completada')).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------------------------
 * Descarga del dibujo: carga, error, reintento
 * ----------------------------------------------------------------------------------------- */

describe('el dibujo: carga y error', () => {
  it('descarga el SVG con fetch desde la ruta de la configuración', async () => {
    const { mock } = simularFetch(svgPorRuta);
    await montarListo(explorar);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(String(mock.mock.calls[0]![0])).toMatch(/images\/m1\/hueso_capas\.svg$/);
  });

  it('mientras carga muestra un estado de carga y la lista ya funciona', async () => {
    simularFetch(() => ({ colgada: true }));
    const w = montar(explorar);
    await flushPromises();
    expect(w.get('[data-testid="multicapa-cargando"]').text()).toContain('Cargando el dibujo');
    expect(w.get('[data-testid="multicapa-lienzo"]').attributes('aria-busy')).toBe('true');
    await pulsarCapa(w, 'capa_periostio');
    expect(ficha(w).text()).toContain('Periostio');
  });

  it('con 404 muestra un error claro en español y la actividad se puede completar con la lista', async () => {
    simularFetch(() => ({ estado: 404 }));
    const w = await montarListo(explorar);
    const error = w.get('[data-testid="multicapa-error-svg"]');
    expect(error.text()).toContain('El dibujo no está disponible por ahora.');
    expect(error.text()).toContain('lista de capas');
    await completarExplorar(w, explorar);
    expect(w.emitted('completada')).toHaveLength(1);
  });

  it('sin red: mensaje de conexión y botón para reintentar', async () => {
    simularFetch(() => ({ sinRed: true }));
    const w = await montarListo(explorar);
    expect(w.get('[data-testid="multicapa-error-svg"]').text()).toContain('Revisa tu conexión');
    const reintentar = w.get('[data-testid="multicapa-reintentar"]');
    expect(reintentar.classes()).toContain('min-h-11');
  });

  it('reintentar la descarga inyecta el dibujo cuando por fin llega', async () => {
    let intento = 0;
    simularFetch((url) => (++intento === 1 ? { sinRed: true } : svgPorRuta(url)));
    const w = await montarListo(explorar);
    expect(w.find('[data-testid="multicapa-svg"] svg').exists()).toBe(false);
    await w.get('[data-testid="multicapa-reintentar"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="multicapa-error-svg"]').exists()).toBe(false);
    expect(w.get('[data-testid="multicapa-svg"]').isVisible()).toBe(true);
    expect(w.find('[data-testid="multicapa-svg"] svg').exists()).toBe(true);
  });

  it('un 200 que no es un SVG (una página de error) se trata como formato no válido', async () => {
    simularFetch(() => ({ cuerpo: '<!doctype html><html><body>No encontrado</body></html>' }));
    const w = await montarListo(explorar);
    expect(w.get('[data-testid="multicapa-error-svg"]').text()).toContain('formato válido');
  });

  it('un SVG con DOCTYPE/ENTITY o vacío se rechaza sin romper la actividad', async () => {
    for (const cuerpo of [
      '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"></svg>',
      '',
      '   ',
    ]) {
      simularFetch(() => ({ cuerpo }));
      const w = await montarListo(explorar);
      expect(w.find('[data-testid="multicapa-error-svg"]').exists()).toBe(true);
      await completarExplorar(w, explorar);
      expect(w.emitted('completada')).toHaveLength(1);
      w.unmount();
    }
  });

  it('un SVG sin las capas de la configuración deja la lista funcionando', async () => {
    simularFetch(() => ({
      cuerpo:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g id="otra"><rect width="5" height="5"/></g></svg>',
    }));
    const w = await montarListo(explorar);
    expect(w.find('[data-testid="multicapa-svg"] svg').exists()).toBe(true);
    await completarExplorar(w, explorar);
    expect(w.emitted('completada')).toHaveLength(1);
  });

  it('cambiar de actividad descarga el dibujo nuevo y reinicia el estado', async () => {
    const { mock } = simularFetch(svgPorRuta);
    const w = await montarListo(explorar);
    await pulsarCapa(w, 'capa_periostio');
    await w.setProps({ actividad: identificar });
    await flushPromises();
    expect(mock).toHaveBeenCalledTimes(2);
    expect(String(mock.mock.calls[1]![0])).toMatch(/celulas_histologia\.svg$/);
    expect(w.text()).toContain('Consigna 1 de 4');
    expect(w.text()).toContain('Fallos: 0');
    expect(w.find('[data-capa="capa_periostio"]').exists()).toBe(false);
  });

  it('una respuesta lenta de una actividad anterior no pisa el dibujo de la actual', async () => {
    let liberar!: () => void;
    const espera = new Promise<void>((r) => (liberar = r));
    const respuestas: Record<string, string> = {
      hueso_capas: SVG_HUESO,
      celulas_histologia: SVG_CELULAS,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const clave = Object.keys(respuestas).find((k) => String(url).includes(k))!;
        if (clave === 'hueso_capas') await espera;
        return { ok: true, status: 200, text: async () => respuestas[clave] };
      }),
    );
    const w = montar(explorar);
    await flushPromises();
    await w.setProps({ actividad: identificar });
    await flushPromises();
    liberar();
    await flushPromises();
    const raiz = w.get('[data-testid="multicapa-svg"]').element;
    expect(raiz.querySelector('[data-capa="histo_osteoblasto"]')).not.toBeNull();
    expect(raiz.querySelector('[data-capa="capa_periostio"]')).toBeNull();
  });
});

/* -------------------------------------------------------------------------------------------
 * Saneamiento del SVG al inyectarlo
 * ----------------------------------------------------------------------------------------- */

describe('saneamiento del SVG inyectado', () => {
  const peligroso = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 800 600" onload="alert(1)">
    <script>alert(2)</script>
    <foreignObject><div>hola</div></foreignObject>
    <defs><linearGradient id="grad"><stop offset="0" stop-color="#fff"/></linearGradient></defs>
    <g id="capa_periostio" onclick="alert(3)"><rect width="100" height="100" fill="url(#grad)" onmouseover="alert(4)"/></g>
    <a xlink:href="javascript:alert(5)"><g id="capa_hueso_compacto"><circle cx="300" cy="300" r="50" fill="red" style="fill:url(https://malo.example/x.png#a)"/></g></a>
    <g id="capa_hueso_esponjoso"><image href="https://malo.example/x.png"/><circle cx="500" cy="300" r="50"/></g>
    <g id="capa_medula_osea"><circle cx="100" cy="500" r="50"/></g>
  </svg>`;

  it('quita scripts, foreignObject, atributos on*, enlaces javascript: y referencias externas', async () => {
    simularFetch(() => ({ cuerpo: peligroso }));
    const w = await montarListo(explorar);
    const raiz = w.get('[data-testid="multicapa-svg"]').element;
    expect(raiz.querySelector('script')).toBeNull();
    expect(raiz.querySelector('foreignObject')).toBeNull();
    expect(raiz.querySelector('image')).toBeNull();
    for (const el of Array.from(raiz.querySelectorAll('*'))) {
      for (const a of Array.from(el.attributes)) {
        expect(a.name.startsWith('on'), `${el.tagName}[${a.name}]`).toBe(false);
        expect(a.value).not.toMatch(/javascript:|malo\.example/);
      }
    }
    // Lo que queda sigue funcionando.
    await clicEnSvg(w, 'capa_periostio');
    expect(ficha(w).text()).toContain('Periostio');
  });

  it('prefija con el id de la actividad los ids referenciados (dos copias no colisionan)', async () => {
    simularFetch(() => ({ cuerpo: peligroso }));
    const a = await montarListo(explorar);
    const b = await montarListo({ ...clonar(explorar), id: 'm1_otra_copia' });
    const idsDe = (w: VueWrapper) =>
      Array.from(w.get('[data-testid="multicapa-svg"]').element.querySelectorAll('[id]')).map((e) =>
        e.getAttribute('id'),
      );
    expect(idsDe(a)).toContain('m1_capas_hueso__grad');
    expect(idsDe(b)).toContain('m1_otra_copia__grad');
    const relleno = a
      .get('[data-testid="multicapa-svg"] rect:not([data-zona-auto])')
      .attributes('fill');
    expect(relleno).toBe('url(#m1_capas_hueso__grad)');
  });

  it('construye zonas táctiles clonadas y marca cada capa con data-capa', async () => {
    const w = await montarListo(explorar);
    const raiz = w.get('[data-testid="multicapa-svg"]').element;
    for (const c of explorar.config.capas) {
      expect(raiz.querySelector(`g[data-capa="${c.id}"]`), c.id).not.toBeNull();
    }
    expect(raiz.querySelectorAll('[data-zona-auto]').length).toBeGreaterThan(0);
    // El periostio solo tiene contorno: su zona es más gruesa que el trazo original.
    const zona = grupoSvg(w, 'capa_periostio').querySelector('[data-zona-auto]')!;
    expect(zona.getAttribute('pointer-events')).toBe('stroke');
    expect(Number(zona.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(16);
  });
});

/* -------------------------------------------------------------------------------------------
 * Hover en escritorio; nada depende solo del hover
 * ----------------------------------------------------------------------------------------- */

describe('hover y toque', () => {
  it('explorar: el cursor sobre una capa muestra su ficha y al salir vuelve a la última elegida', async () => {
    const w = await montarListo(explorar);
    const el = puntoTocable(w, 'capa_hueso_esponjoso');
    el.dispatchEvent(evento('pointerover', { pointerType: 'mouse' }));
    await flushPromises();
    expect(ficha(w).text()).toContain('Hueso esponjoso');
    expect(grupoSvg(w, 'capa_hueso_esponjoso').classList.contains('es-resaltada')).toBe(true);
    // El hover solo previsualiza: no visita la capa ni emite.
    expect(w.emitted('interaccion')).toBeUndefined();
    expect(w.text()).toContain('vistas: 0 de 3');
    w.get('[data-testid="multicapa-svg"]').element.dispatchEvent(
      evento('pointerleave', { pointerType: 'mouse' }),
    );
    await flushPromises();
    expect(ficha(w).text()).not.toContain('Hueso esponjoso');
  });

  it('con el dedo no hay hover: el toque sí abre la ficha', async () => {
    const w = await montarListo(explorar);
    puntoTocable(w, 'capa_periostio').dispatchEvent(
      evento('pointerover', { pointerType: 'touch' }),
    );
    await flushPromises();
    expect(ficha(w).text()).not.toContain('Periostio');
    await tocarConDedo(w, 'capa_periostio');
    expect(ficha(w).text()).toContain('Periostio');
  });

  it('el foco de teclado sobre un botón de la lista resalta la capa en el dibujo (explorar)', async () => {
    const w = await montarListo(explorar);
    await botonCapa(w, 'capa_medula_osea').trigger('focus');
    await flushPromises();
    expect(grupoSvg(w, 'capa_medula_osea').classList.contains('es-resaltada')).toBe(true);
    await botonCapa(w, 'capa_medula_osea').trigger('blur');
    await flushPromises();
    expect(grupoSvg(w, 'capa_medula_osea').classList.contains('es-resaltada')).toBe(false);
  });
});

/* -------------------------------------------------------------------------------------------
 * Teclado y lector de pantalla
 * ----------------------------------------------------------------------------------------- */

describe('teclado y lector de pantalla', () => {
  it('la lista sigue el orden del contenido en explorar y es una lista con nombre', async () => {
    const w = await montarListo(explorar);
    const ul = lista(w);
    expect(ul.attributes('aria-labelledby')).toBeTruthy();
    expect(w.get(`#${CSS.escape(ul.attributes('aria-labelledby')!)}`).text()).toBe(
      'Capas del dibujo',
    );
    expect(ul.findAll('button').map((b) => b.attributes('data-capa'))).toEqual(
      explorar.config.capas.map((c) => c.id),
    );
  });

  it('los botones se pueden enfocar y son accesibles al teclado (nativos, sin tabindex negativo)', async () => {
    const w = await montarListo(explorar);
    for (const b of lista(w).findAll('button')) {
      expect(b.attributes('tabindex')).toBeUndefined();
      (b.element as HTMLElement).focus();
      expect(document.activeElement).toBe(b.element);
    }
  });

  it('un botón de la lista mantiene el foco tras activarse (R6: el error no roba el foco)', async () => {
    const w = await montarListo(identificar);
    const b = botonCapa(w, 'histo_osteocito');
    (b.element as HTMLElement).focus();
    await b.trigger('click');
    await flushPromises();
    expect(document.activeElement).toBe(b.element);
  });

  it('hay una sola región aria-live, educada y atómica, con el anuncio del último resultado', async () => {
    const w = await montarListo(identificar);
    const vivas = w.findAll('[aria-live]');
    expect(vivas).toHaveLength(1);
    expect(vivas[0]!.attributes('aria-live')).toBe('polite');
    await pulsarCapa(w, 'histo_osteocito');
    expect(anuncio(w)).toContain('Incorrecto');
    await pulsarCapa(w, 'histo_osteoblasto');
    expect(anuncio(w)).toContain('Correcto');
  });

  it('el resultado no depende solo del color: lleva texto e icono oculto para lectores', async () => {
    const w = await montarListo(identificar);
    await pulsarCapa(w, 'histo_osteocito');
    const v = w.get('[data-testid="multicapa-veredicto"]');
    expect(v.text()).toContain('Esa no es');
    expect(v.find('svg[aria-hidden="true"]').exists()).toBe(true);
  });

  it('las capas resueltas se marcan con texto ("Identificada"), no solo con color', async () => {
    const w = await montarListo(identificar);
    await pulsarCapa(w, 'histo_osteoblasto');
    expect(botonCapa(w, 'histo_osteoblasto').text()).toContain('Identificada');
  });

  it('la barra de avance expone su valor', async () => {
    const w = await montarListo(explorar);
    await pulsarCapa(w, 'capa_periostio');
    const barra = w.get('[role="progressbar"]');
    expect(barra.attributes('aria-valuenow')).toBe('33');
    expect(barra.attributes('aria-label')).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------------------------
 * prefers-reduced-motion
 * ----------------------------------------------------------------------------------------- */

describe('reduced-motion', () => {
  function simularMovimiento(reducido: boolean): void {
    vi.stubGlobal('matchMedia', (consulta: string) => ({
      matches:
        reducido && consulta.includes('prefers-reduced-motion') && consulta.includes('reduce'),
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }));
    // `window.matchMedia` es lo que usa VueUse.
    (window as unknown as { matchMedia: unknown }).matchMedia = (
      globalThis as { matchMedia: unknown }
    ).matchMedia;
  }

  it('con movimiento reducido no se aplica la animación de pulso a la capa tocada', async () => {
    simularMovimiento(true);
    const w = await montarListo(explorar);
    expect(w.get('[data-testid="actividad-multicapa"]').attributes('data-movimiento')).toBe(
      'reducido',
    );
    await pulsarCapa(w, 'capa_periostio');
    expect(grupoSvg(w, 'capa_periostio').classList.contains('pulso')).toBe(false);
    expect(grupoSvg(w, 'capa_periostio').classList.contains('es-activa')).toBe(true);
  });

  it('sin la preferencia, la capa tocada recibe el pulso (y el CSS lo protege con media query)', async () => {
    simularMovimiento(false);
    const w = await montarListo(explorar);
    expect(w.get('[data-testid="actividad-multicapa"]').attributes('data-movimiento')).toBe(
      'normal',
    );
    await pulsarCapa(w, 'capa_periostio');
    expect(grupoSvg(w, 'capa_periostio').classList.contains('pulso')).toBe(true);
    expect(fuenteDelComponente).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{[^}]*animation/s,
    );
    expect(fuenteDelComponente).toContain('motion-safe:animate-spin');
  });
});

/* -------------------------------------------------------------------------------------------
 * Desmontaje limpio
 * ----------------------------------------------------------------------------------------- */

describe('desmontaje', () => {
  it('aborta la descarga en curso y no deja errores por una respuesta tardía', async () => {
    const { señales } = simularFetch(() => ({ colgada: true }));
    const w = montar(explorar);
    await flushPromises();
    expect(señales[0]?.aborted).toBe(false);
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {});
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
    w.unmount();
    await flushPromises();
    expect(señales[0]?.aborted).toBe(true);
    expect(errores).not.toHaveBeenCalled();
    expect(avisos).not.toHaveBeenCalled();
  });

  it('desconecta el ResizeObserver, quita el SVG y no deja temporizadores', async () => {
    const observadores: {
      observe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
        constructor() {
          observadores.push(this);
        }
      },
    );
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const w = await montarListo(explorar);
    await pulsarCapa(w, 'capa_periostio'); // deja un progreso pendiente en el limitador
    const svg = w.get('[data-testid="multicapa-svg"]').element;
    expect(observadores).toHaveLength(1);
    expect(observadores[0]!.observe).toHaveBeenCalled();
    w.unmount();
    expect(observadores[0]!.disconnect).toHaveBeenCalled();
    expect(svg.querySelector('svg')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('al desmontar entrega el último progreso pendiente UNA vez y luego no emite más', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const alProgreso = vi.fn();
    const w = await montarListo(explorar, { onProgreso: alProgreso } as Partial<Props>);
    await pulsarCapa(w, 'capa_periostio'); // sale enseguida
    await pulsarCapa(w, 'capa_hueso_compacto'); // queda pendiente por el limitador
    expect(alProgreso).toHaveBeenCalledTimes(1);
    w.unmount();
    // El progreso pendiente se guarda al desmontar (no se pierde lo hecho)...
    expect(alProgreso).toHaveBeenCalledTimes(2);
    expect(alProgreso.mock.calls[1]![0].instantanea.visitadas).toEqual([
      'capa_periostio',
      'capa_hueso_compacto',
    ]);
    // ...y después no queda ningún temporizador que emita más.
    await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS * 4);
    expect(alProgreso).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('nunca emite progreso después de completada, ni aunque se toque sin parar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const alProgreso = vi.fn();
    const w = await montarListo(identificar, { onProgreso: alProgreso } as Partial<Props>);
    await completarIdentificar(w, identificar);
    const antes = alProgreso.mock.calls.length;
    for (const c of identificar.config.capas) await pulsarCapa(w, c.id);
    await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS * 4);
    expect(alProgreso.mock.calls.length).toBe(antes);
    expect(w.emitted('completada')).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------------------------
 * Texto: nunca v-html sobre texto crudo
 * ----------------------------------------------------------------------------------------- */

describe('texto seguro', () => {
  it('el HTML crudo del contenido se muestra como texto, sin crear elementos', async () => {
    const { actividad, svg } = generar(3, {
      etiqueta: (i) => `Capa <b>${i}</b> & "comillas"`,
      descripcion: () =>
        'Descripción con <img src=x onerror=alert(1)> y <script>alert(2)</script> texto.',
    });
    actividad.instrucciones = 'Instrucción con <img src=x onerror=alert(3)> incluida.';
    simularFetch(() => ({ cuerpo: svg }));
    const w = await montarListo(actividad);
    await pulsarCapa(w, 'capa_1');
    const raiz = w.element as HTMLElement;
    expect(raiz.querySelector('img')).toBeNull();
    expect(raiz.querySelector('script')).toBeNull();
    expect(w.text()).toContain('<img src=x onerror=alert(1)>');
    expect(ficha(w).get('h4').text()).toBe('Capa <b>0</b> & "comillas"');
  });

  it('el Markdown restringido (negrita) sí se renderiza, con enlaces de glosario que no navegan', async () => {
    const { actividad, svg } = generar(2, {
      descripcion: () =>
        'Es **muy** importante y se define en [osteoide](glosario:osteoide) del hueso.',
    });
    simularFetch(() => ({ cuerpo: svg }));
    const w = await montarListo(actividad);
    await pulsarCapa(w, 'capa_1');
    expect(ficha(w).find('strong').text()).toBe('muy');
    const enlace = ficha(w).find('a[data-glosario]');
    if (enlace.exists()) {
      const escuchado = vi.fn();
      w.element.addEventListener('ova:glosario', escuchado);
      const clic = new MouseEvent('click', { bubbles: true, cancelable: true });
      enlace.element.dispatchEvent(clic);
      expect(clic.defaultPrevented).toBe(true);
      expect(escuchado).toHaveBeenCalledTimes(1);
    }
  });

  it('v-html solo existe en TextoLinea y innerHTML no se usa en el componente', () => {
    expect(fuenteDelComponente).not.toMatch(/v-html|innerHTML|outerHTML|insertAdjacentHTML/);
    expect(fuenteTextoLinea).toMatch(/v-html="html"/);
    expect(fuenteTextoLinea).toContain('renderizarLinea');
  });
});

/* -------------------------------------------------------------------------------------------
 * Configuraciones adversariales
 * ----------------------------------------------------------------------------------------- */

describe('configuraciones adversariales', () => {
  it('15 capas (el máximo) en explorar, todas requeridas', async () => {
    const { actividad, svg } = generar(15);
    simularFetch(() => ({ cuerpo: svg }));
    const w = await montarListo(actividad);
    expect(lista(w).findAll('button')).toHaveLength(15);
    expect(w.text()).toContain('vistas: 0 de 15');
    for (const c of actividad.config.capas.slice(0, 14)) await pulsarCapa(w, c.id);
    expect(w.emitted('completada')).toBeUndefined();
    await tocarConDedo(w, 'capa_15');
    expect(w.emitted('completada')).toHaveLength(1);
    expect(problemasDeEmisiones(w.emitted() as EventosEmitidos, actividad)).toEqual([]);
  });

  it('15 capas en identificar con una pista extra por capa (30 consignas)', async () => {
    const base = generar(15, { modo: 'identificar' });
    for (const capa of base.actividad.config.capas) {
      (capa as { pistas_extra?: string[] }).pistas_extra = [
        `Otra forma de pedir ${capa.etiqueta}.`,
      ];
    }
    simularFetch(() => ({ cuerpo: base.svg }));
    const w = await montarListo(base.actividad);
    expect(w.text()).toContain('Consigna 1 de 30');
    await completarIdentificar(w, base.actividad);
    expect(completada(w)).toMatchObject({ precision: 1, intentos: 1 });
    expect(problemasDeEmisiones(w.emitted() as EventosEmitidos, base.actividad)).toEqual([]);
  });

  it('dos capas con una sola requerida: se completa al ver esa', async () => {
    const { actividad, svg } = generar(2, { requeridas: ['capa_2'] });
    simularFetch(() => ({ cuerpo: svg }));
    const w = await montarListo(actividad);
    await pulsarCapa(w, 'capa_1');
    expect(w.emitted('completada')).toBeUndefined();
    await pulsarCapa(w, 'capa_2');
    expect(w.emitted('completada')).toHaveLength(1);
  });

  it('identificar con una sola requerida (y una capa distractora)', async () => {
    const { actividad, svg } = generar(2, { modo: 'identificar', requeridas: ['capa_1'] });
    simularFetch(() => ({ cuerpo: svg }));
    const w = await montarListo(actividad);
    expect(w.text()).toContain('Consigna 1 de 1');
    await pulsarCapa(w, 'capa_2'); // fallo
    await pulsarCapa(w, 'capa_1');
    expect(completada(w)!.precision).toBeCloseTo(0.5, 6);
    expect(completada(w)!.detalle).toMatchObject({ aciertos: 1, errores: 1 });
  });

  it('una sola capa en la configuración (fuera del esquema) no rompe la actividad', async () => {
    const { actividad, svg } = generar(1);
    simularFetch(() => ({ cuerpo: svg }));
    const w = await montarListo(actividad);
    await pulsarCapa(w, 'capa_1');
    expect(w.emitted('completada')).toHaveLength(1);
  });

  it('textos largos y Unicode (500 caracteres, emoji, escrituras mixtas) no rompen la ficha ni la lista', async () => {
    const larga = 'Ωmega-ñandú 骨 ‮invertido‬ 🦴 '.repeat(20).slice(0, 500);
    const { actividad, svg } = generar(3, {
      etiqueta: (i) => `Ω${i} ${'estructuraMuyLarga'.repeat(3)} 骨🦴`.slice(0, 60),
      descripcion: () => larga,
    });
    simularFetch(() => ({ cuerpo: svg }));
    const w = await montarListo(actividad);
    await pulsarCapa(w, 'capa_1');
    expect(ficha(w).text()).toContain('Ωmega');
    expect(lista(w).findAll('button')).toHaveLength(3);
    expect(w.html()).toContain('overflow-wrap:anywhere');
    expect(anuncio(w).length).toBeGreaterThan(0);
  });

  it('ids raros (comillas, espacios, Unicode, corchetes) funcionan sin construir selectores', async () => {
    const ids = ['a"b', "c'd e", 'ñandú_骨', 'x[0]', 'p.q#r'];
    const { actividad, svg } = generar(5, { ids });
    simularFetch(() => ({ cuerpo: svg }));
    const w = await montarListo(actividad);
    for (const id of ids) {
      await tocarConDedo(w, id);
    }
    expect(w.emitted('completada')).toHaveLength(1);
    expect((completada(w)!.detalle as { visitadas: string[] }).visitadas).toEqual(ids);
  });

  it('ids que parecen propiedades del prototipo no se confunden con errores acumulados', async () => {
    const ids = ['__proto__', 'constructor', 'toString'];
    const { actividad, svg } = generar(3, { modo: 'identificar', ids });
    simularFetch(() => ({ cuerpo: svg }));
    const w = await montarListo(actividad);
    await pulsarCapa(w, 'constructor'); // se pedía __proto__
    await pulsarCapa(w, 'toString');
    await completarIdentificar(w, actividad);
    expect(completada(w)!.precision).toBeCloseTo(3 / 5, 6);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(completada(w)!.detalle as object)).toContain('errores_por_capa');
  });

  it('un id repetido en las capas no duplica consignas ni rompe la lista', async () => {
    const { actividad, svg } = generar(3);
    actividad.config.capas[2]!.id = 'capa_1';
    actividad.config.requeridas = ['capa_1', 'capa_2', 'capa_1'];
    simularFetch(() => ({ cuerpo: svg }));
    const w = await montarListo(actividad);
    expect(w.text()).toContain('vistas: 0 de 2');
    await pulsarCapa(w, 'capa_2');
    await w.findAll('[data-capa="capa_1"]')[0]!.trigger('click');
    await flushPromises();
    expect(w.emitted('completada')).toHaveLength(1);
  });

  it('sin capas requeridas válidas: avisa, no completa y no emite nada', async () => {
    const { actividad, svg } = generar(3, { requeridas: ['no_existe'] });
    simularFetch(() => ({ cuerpo: svg }));
    const w = await montarListo(actividad);
    expect(w.get('[data-testid="multicapa-sin-contenido"]').text()).toContain('docente');
    await pulsarCapa(w, 'capa_1');
    expect(w.emitted('completada')).toBeUndefined();
  });

  it('un SVG de 200 KB (el máximo) se inyecta; uno mayor se rechaza sin colgar la actividad', async () => {
    const { actividad, svg } = generar(3);
    const relleno = `<!-- ${'x'.repeat(190 * 1024)} -->`;
    simularFetch(() => ({ cuerpo: svg.replace('</svg>', `${relleno}</svg>`) }));
    const grande = await montarListo(actividad);
    expect(grande.find('[data-testid="multicapa-svg"] svg').exists()).toBe(true);
    grande.unmount();

    const enorme = `<!-- ${'x'.repeat(500 * 1024)} -->`;
    simularFetch(() => ({ cuerpo: svg.replace('</svg>', `${enorme}</svg>`) }));
    const w = await montarListo(actividad);
    expect(w.find('[data-testid="multicapa-error-svg"]').exists()).toBe(true);
    await completarExplorar(w, actividad);
    expect(w.emitted('completada')).toHaveLength(1);
  });

  it('una ruta de SVG con barra inicial o con espacios se pide bien', async () => {
    const { actividad, svg } = generar(2);
    actividad.config.svg = '/images/m1/mi dibujo.svg';
    const { mock } = simularFetch(() => ({ cuerpo: svg }));
    await montarListo(actividad);
    expect(String(mock.mock.calls[0]![0])).toMatch(/images\/m1\/mi dibujo\.svg$/);
    expect(String(mock.mock.calls[0]![0])).not.toMatch(/\/\/images/);
  });

  it('un módulo distinto y actividades de otra id mantienen su propio estado', async () => {
    const a = await montarListo(explorar, { modulo: 2 });
    const b = await montarListo(explorar, { modulo: 3 });
    await pulsarCapa(a, 'capa_periostio');
    expect(a.text()).toContain('vistas: 1 de 3');
    expect(b.text()).toContain('vistas: 0 de 3');
  });
});
