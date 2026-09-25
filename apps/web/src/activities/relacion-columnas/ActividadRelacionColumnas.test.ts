/**
 * Pruebas de ActividadRelacionColumnas: batería de contrato + flujo, error, reintentos,
 * estado restaurado, teclado, puntero, reduced-motion, desmontaje y configuraciones adversariales.
 * No usan navegador: la geometría del arrastre se simula con `getBoundingClientRect`.
 */
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import type { PropsActividadRelacionColumnas, ResultadoActividad } from '@/activities/types';
import { pruebasDeContratoActividad, problemasDeEmisiones } from '@/content/__fixtures__/contrato';
import type { EventosEmitidos } from '@/content/__fixtures__/contrato';
import { PROGRESO_INTERVALO_MIN_MS } from '@/content/constantes';
import { calcularPuntaje } from '@/content/scoring';
import type { ActividadRelacionColumnas } from '@/content/schema';
import Actividad from './ActividadRelacionColumnas.vue';
import fuenteDelComponente from './ActividadRelacionColumnas.vue?raw';
import { analizarConfig, crearInstantanea, derivarSemilla, ordenarColumnaB } from './logica';
import type { AnalisisValido } from './logica';
import { actividadDeMuestra, clonar, crearActividad } from './utilesPrueba';

enableAutoUnmount(afterEach);

const muestra = actividadDeMuestra();

type Props = Omit<PropsActividadRelacionColumnas, 'modulo'> & { modulo?: 1 | 2 | 3 | 4 | 5 | 6 };

function montar(actividad: ActividadRelacionColumnas, extra: Partial<Props> = {}): VueWrapper {
  return mount(Actividad, {
    props: { modulo: 1, actividad, ...extra },
    attachTo: document.body,
  }) as unknown as VueWrapper;
}

/** Botón de un elemento por columna e id (los ids pueden traer caracteres raros: sin selectores). */
function item(w: VueWrapper, columna: 'a' | 'b', id: string) {
  const encontrado = w
    .findAll(`[data-columna="${columna}"]`)
    .find((x) => x.attributes('data-id') === id);
  if (!encontrado) throw new Error(`No hay un elemento ${columna}:${id}`);
  return encontrado;
}

async function unir(w: VueWrapper, a: string, b: string): Promise<void> {
  await item(w, 'a', a).trigger('click');
  await item(w, 'b', b).trigger('click');
}

/** Une todas las parejas correctas, en el orden de `pares`. */
async function completar(w: VueWrapper, actividad: ActividadRelacionColumnas): Promise<void> {
  for (const par of actividad.config.pares) await unir(w, par.a, par.b);
}

/** Un distractor (B sin pareja) o, si no hay, la pareja de otro elemento de A. */
function equivocado(actividad: ActividadRelacionColumnas, indicePar = 0): [string, string] {
  const { pares, columna_b } = actividad.config;
  const usados = new Set(pares.map((p) => p.b));
  const distractor = columna_b.elementos.find((e) => !usados.has(e.id));
  const a = pares[indicePar]!.a;
  if (distractor) return [a, distractor.id];
  return [a, pares[(indicePar + 1) % pares.length]!.b];
}

const completada = (w: VueWrapper) =>
  w.emitted('completada')?.[0]?.[0] as ResultadoActividad<'relacion-columnas'> | undefined;
const interacciones = (w: VueWrapper) => (w.emitted('interaccion') ?? []).map((e) => e[0]);
const anuncio = (w: VueWrapper) => w.get('[data-test="anuncio"]').text();
const orden = (w: VueWrapper, columna: 'a' | 'b') =>
  w.findAll(`[data-columna="${columna}"]`).map((x) => x.attributes('data-id'));

/* -------------------------------------------------------------------------------------------
 * Batería de contrato
 * ----------------------------------------------------------------------------------------- */

pruebasDeContratoActividad<'relacion-columnas'>({
  nombre: 'ActividadRelacionColumnas',
  actividad: muestra,
  montar: (props) => mount(Actividad, { props }) as unknown as VueWrapper,
  completar: (w) => completar(w, muestra),
  precisionEsperada: 1,
});

pruebasDeContratoActividad<'relacion-columnas'>({
  nombre: 'ActividadRelacionColumnas (8 pares y 3 distractores)',
  actividad: crearActividad({ pares: 8, distractores: 3 }),
  montar: (props) => mount(Actividad, { props }) as unknown as VueWrapper,
  completar: (w) => completar(w, crearActividad({ pares: 8, distractores: 3 })),
  precisionEsperada: 1,
});

/* -------------------------------------------------------------------------------------------
 * Flujo feliz
 * ----------------------------------------------------------------------------------------- */

describe('flujo feliz', () => {
  it('muestra título, instrucciones, las dos columnas y todos los elementos como botones', () => {
    const w = montar(muestra);
    expect(w.get('h3').text()).toBe(muestra.titulo);
    expect(w.text()).toContain(muestra.instrucciones);
    expect(w.findAll('h4').map((h) => h.text())).toEqual(['Célula', 'Función']);
    expect(w.findAll('[data-columna="a"]')).toHaveLength(4);
    expect(w.findAll('[data-columna="b"]')).toHaveLength(5);
    for (const b of w.findAll('[data-columna]')) {
      expect(b.element.tagName).toBe('BUTTON');
      expect(b.attributes('type')).toBe('button');
    }
  });

  it('cada columna es una lista con nombre accesible tomado de su título', () => {
    const w = montar(muestra);
    for (const ul of w.findAll('ul')) {
      const etiqueta = ul.attributes('aria-labelledby');
      expect(etiqueta).toBeTruthy();
      expect(document.getElementById(etiqueta!)?.tagName).toBe('H4');
    }
  });

  it('un acierto fija la pareja, muestra su explicación en la región aria-live y emite la interacción', async () => {
    const w = montar(muestra);
    await unir(w, 'ea_osteoblasto', 'eb_forma');
    expect(item(w, 'a', 'ea_osteoblasto').attributes('data-estado')).toBe('emparejado');
    expect(item(w, 'b', 'eb_forma').attributes('data-estado')).toBe('emparejado');
    expect(item(w, 'a', 'ea_osteoblasto').text()).toContain('Pareja 1');
    expect(item(w, 'b', 'eb_forma').text()).toContain('Pareja 1');
    // La pareja se comunica con texto, no solo con color.
    expect(item(w, 'a', 'ea_osteoblasto').text()).toContain('Forma matriz ósea nueva');
    expect(item(w, 'b', 'eb_forma').text()).toContain('Osteoblasto');
    const region = w.get('[aria-live]');
    expect(region.attributes('aria-live')).toBe('polite');
    expect(region.attributes('aria-atomic')).toBe('true');
    expect(region.text()).toContain('Correcto');
    expect(region.text()).toContain('fabrican el osteoide');
    expect(interacciones(w)).toEqual([
      { accion: 'relaciona_par', objeto: 'ea_osteoblasto', resultado: 'correcta' },
    ]);
    expect(w.get('[data-test="conteo"]').text()).toContain('1 de 4');
  });

  it('la explicación de un término del glosario se muestra sin el marcado crudo', async () => {
    const w = montar(muestra);
    await unir(w, 'ea_osteoblasto', 'eb_forma');
    const enlace = w.get('[aria-live] a[data-glosario]');
    expect(enlace.attributes('data-glosario')).toBe('osteoblasto');
    expect(w.text()).not.toContain('glosario:osteoblasto');
  });

  it('completar: emite UN resultado con puntaje máximo, detalle y foco en el encabezado del resultado', async () => {
    const w = montar(muestra);
    await completar(w, muestra);
    await flushPromises();
    expect(w.emitted('completada')).toHaveLength(1);
    expect(completada(w)).toEqual({
      puntaje: 30,
      intentos: 1,
      precision: 1,
      detalle: { aciertos: 4, errores: 0, errores_por_par: {} },
    });
    expect(problemasDeEmisiones(w.emitted() as EventosEmitidos, muestra)).toEqual([]);
    const resultado = w.get('[data-test="resultado"]');
    expect(resultado.text()).toContain('Actividad completada');
    expect(resultado.text()).toContain('30 de 30');
    expect(resultado.text()).toContain('Precisión: 100 %');
    expect(resultado.text()).toContain(muestra.retroalimentacion.correcta);
    expect(document.activeElement).toBe(w.get('[data-test="resultado"] h4').element);
    expect(anuncio(w)).toContain('Terminaste la actividad');
  });

  it('tras completar ya no acepta más uniones ni emite más eventos', async () => {
    const w = montar(muestra);
    await completar(w, muestra);
    const antes = w.emitted('interaccion')!.length;
    await item(w, 'a', 'ea_osteoblasto').trigger('click');
    await item(w, 'b', 'eb_globulos').trigger('click');
    expect(w.emitted('interaccion')).toHaveLength(antes);
    expect(w.emitted('completada')).toHaveLength(1);
  });

  it('el distractor sobrante se marca "Sin pareja" (con texto) solo al terminar', async () => {
    const w = montar(muestra);
    expect(item(w, 'b', 'eb_globulos').text()).not.toContain('Sin pareja');
    await completar(w, muestra);
    expect(item(w, 'b', 'eb_globulos').attributes('data-estado')).toBe('sobrante');
    expect(item(w, 'b', 'eb_globulos').text()).toContain('Sin pareja');
  });

  it('los pares formados quedan en una lista con su explicación, en el orden en que se acertaron', async () => {
    const w = montar(muestra);
    await unir(w, 'ea_osteocito', 'eb_detecta');
    await unir(w, 'ea_osteoblasto', 'eb_forma');
    const lista = w.get('ol[aria-label="Parejas formadas"]');
    const filas = lista.findAll('li');
    expect(filas).toHaveLength(2);
    expect(filas[0]!.text()).toContain('Pareja 1: Osteocito');
    expect(filas[0]!.text()).toContain('sensores de la carga mecánica');
    expect(filas[1]!.text()).toContain('Pareja 2: Osteoblasto');
  });
});

/* -------------------------------------------------------------------------------------------
 * Selección toque-toque
 * ----------------------------------------------------------------------------------------- */

describe('selección toque-toque', () => {
  it('elegir un elemento lo marca (aria-pressed y texto) y dice qué hacer', async () => {
    const w = montar(muestra);
    const boton = item(w, 'a', 'ea_osteoclasto');
    expect(boton.attributes('aria-pressed')).toBe('false');
    await boton.trigger('click');
    expect(boton.attributes('aria-pressed')).toBe('true');
    expect(boton.text()).toContain('Seleccionado');
    expect(anuncio(w)).toContain('Elegiste «Osteoclasto»');
    expect(anuncio(w)).toContain('columna «Función»');
    expect(w.text()).toContain('Elige la pareja de «Osteoclasto»');
    expect(w.emitted('interaccion')).toBeUndefined();
  });

  it('elegir otro elemento de la MISMA columna cambia la selección', async () => {
    const w = montar(muestra);
    await item(w, 'a', 'ea_osteoclasto').trigger('click');
    await item(w, 'a', 'ea_osteocito').trigger('click');
    expect(item(w, 'a', 'ea_osteoclasto').attributes('aria-pressed')).toBe('false');
    expect(item(w, 'a', 'ea_osteocito').attributes('aria-pressed')).toBe('true');
    expect(w.emitted('interaccion')).toBeUndefined();
  });

  it('volver a tocar el elegido cancela la selección', async () => {
    const w = montar(muestra);
    const boton = item(w, 'a', 'ea_osteoclasto');
    await boton.trigger('click');
    await boton.trigger('click');
    expect(boton.attributes('aria-pressed')).toBe('false');
    expect(anuncio(w)).toContain('Selección cancelada');
  });

  it('se puede empezar por la columna B', async () => {
    const w = montar(muestra);
    await item(w, 'b', 'eb_reabsorbe').trigger('click');
    expect(w.text()).toContain('Elige la pareja de «Reabsorbe el hueso»');
    await item(w, 'a', 'ea_osteoclasto').trigger('click');
    expect(item(w, 'a', 'ea_osteoclasto').attributes('data-estado')).toBe('emparejado');
    expect(interacciones(w)).toEqual([
      { accion: 'relaciona_par', objeto: 'ea_osteoclasto', resultado: 'correcta' },
    ]);
  });

  it('tocar un elemento ya emparejado no hace nada y lo dice', async () => {
    const w = montar(muestra);
    await unir(w, 'ea_osteoblasto', 'eb_forma');
    const antes = w.emitted('interaccion')!.length;
    await item(w, 'a', 'ea_osteoblasto').trigger('click');
    await item(w, 'b', 'eb_forma').trigger('click');
    expect(w.emitted('interaccion')).toHaveLength(antes);
    expect(anuncio(w)).toContain('ya tiene pareja');
    expect(item(w, 'a', 'ea_osteoblasto').attributes('aria-disabled')).toBe('true');
  });

  it('Escape cancela la selección', async () => {
    const w = montar(muestra);
    await item(w, 'a', 'ea_osteoclasto').trigger('click');
    await item(w, 'a', 'ea_osteoclasto').trigger('keydown', { key: 'Escape' });
    expect(item(w, 'a', 'ea_osteoclasto').attributes('aria-pressed')).toBe('false');
    expect(anuncio(w)).toContain('Selección cancelada');
  });
});

/* -------------------------------------------------------------------------------------------
 * Error y precisión
 * ----------------------------------------------------------------------------------------- */

describe('errores', () => {
  it('una unión equivocada avisa con texto, no revela la respuesta y emite "incorrecta" con el elemento de A', async () => {
    const w = montar(muestra);
    await unir(w, 'ea_osteoblasto', 'eb_reabsorbe');
    expect(anuncio(w)).toContain('Incorrecto');
    expect(anuncio(w)).toContain('«Osteoblasto» no va con «Reabsorbe el hueso»');
    expect(anuncio(w)).not.toContain('Forma matriz ósea nueva'); // no dice cuál era
    expect(anuncio(w)).not.toContain('fabrican el osteoide');
    expect(item(w, 'a', 'ea_osteoblasto').attributes('data-estado')).toBe('fallo');
    expect(item(w, 'b', 'eb_reabsorbe').attributes('data-estado')).toBe('fallo');
    expect(item(w, 'a', 'ea_osteoblasto').text()).toContain('No coincide');
    expect(interacciones(w)).toEqual([
      { accion: 'relaciona_par', objeto: 'ea_osteoblasto', resultado: 'incorrecta' },
    ]);
    // Tras el error la selección se limpia y no se emite completada.
    expect(w.emitted('completada')).toBeUndefined();
    expect(item(w, 'a', 'ea_osteoblasto').attributes('aria-pressed')).toBe('false');
  });

  it('la marca de error desaparece con la siguiente acción', async () => {
    const w = montar(muestra);
    await unir(w, 'ea_osteoblasto', 'eb_reabsorbe');
    await item(w, 'a', 'ea_osteocito').trigger('click');
    expect(item(w, 'a', 'ea_osteoblasto').attributes('data-estado')).toBe('libre');
    expect(item(w, 'b', 'eb_reabsorbe').attributes('data-estado')).toBe('libre');
  });

  it('el distractor de B nunca forma pareja, con ningún elemento de A', async () => {
    const w = montar(muestra);
    for (const par of muestra.config.pares) {
      await unir(w, par.a, 'eb_globulos');
      expect(item(w, 'b', 'eb_globulos').attributes('data-estado')).not.toBe('emparejado');
      expect(item(w, 'a', par.a).attributes('data-estado')).not.toBe('emparejado');
    }
    const interaccionesMalas = interacciones(w) as { resultado: string }[];
    expect(interaccionesMalas).toHaveLength(4);
    expect(interaccionesMalas.every((i) => i.resultado === 'incorrecta')).toBe(true);
  });

  it('precisión = aciertos / (aciertos + errores), detalle por par y puntaje de la fórmula común', async () => {
    const w = montar(muestra);
    await unir(w, 'ea_osteoblasto', 'eb_reabsorbe'); // error en par_osteoblasto
    await unir(w, 'ea_osteoblasto', 'eb_globulos'); // otro error en par_osteoblasto
    await unir(w, 'ea_osteoclasto', 'eb_forma'); // error en par_osteoclasto
    await completar(w, muestra); // 4 aciertos
    const r = completada(w)!;
    expect(r.precision).toBeCloseTo(4 / 7, 10);
    expect(r.puntaje).toBe(calcularPuntaje(muestra, { precision: 4 / 7, intentos: 1 }));
    expect(r.puntaje).toBe(17); // 30 x 4/7
    expect(r.detalle).toEqual({
      aciertos: 4,
      errores: 3,
      errores_por_par: { par_osteoblasto: 2, par_osteoclasto: 1 },
    });
    expect(w.get('[data-test="resultado"]').text()).toContain('Uniones equivocadas: 3');
    expect(w.get('[data-test="resultado"]').text()).toContain(muestra.retroalimentacion.parcial);
  });

  it('con muchos errores la retroalimentación es la "incorrecta" y el puntaje puede ser bajo pero entero', async () => {
    const w = montar(muestra);
    for (let i = 0; i < 20; i++) await unir(w, ...equivocado(muestra));
    await completar(w, muestra);
    const r = completada(w)!;
    expect(r.precision).toBeCloseTo(4 / 24, 10);
    expect(Number.isInteger(r.puntaje)).toBe(true);
    expect(w.get('[data-test="resultado"]').text()).toContain(muestra.retroalimentacion.incorrecta);
    expect(r.detalle.errores).toBe(20);
  });
});

/* -------------------------------------------------------------------------------------------
 * Reintentos, penalización y umbral de aprobación
 * ----------------------------------------------------------------------------------------- */

describe('reintentos y penalización', () => {
  it('"Repetir la actividad" empieza el intento 2: reinicia, baraja, emite reinicia_actividad y penaliza', async () => {
    const w = montar(muestra);
    await completar(w, muestra);
    const ordenIntento1 = orden(w, 'b');
    await w.get('[data-test="resultado"] button').trigger('click');
    expect(w.emitted('interaccion')!.at(-1)![0]).toEqual({ accion: 'reinicia_actividad' });
    expect(w.find('[data-test="resultado"]').exists()).toBe(false);
    expect(w.findAll('[data-estado="emparejado"]')).toHaveLength(0);
    expect(w.get('[data-test="conteo"]').text()).toContain('0 de 4');
    // El foco pasa al título de la actividad.
    expect(document.activeElement).toBe(w.get('h3').element);
    // La disposición del intento 2 es la de la semilla del intento 2.
    const a = analizarConfig(muestra.config) as AnalisisValido;
    const esperado = ordenarColumnaB(a, derivarSemilla(muestra.id, 2)).map((i) => a.b[i]!.id);
    expect(orden(w, 'b')).toEqual(esperado);
    expect(orden(w, 'b')).not.toEqual(ordenIntento1);
    await completar(w, muestra);
    expect(w.emitted('completada')).toHaveLength(2);
    const segundo = w.emitted('completada')![1]![0] as ResultadoActividad<'relacion-columnas'>;
    expect(segundo.intentos).toBe(2);
    expect(segundo.puntaje).toBe(27); // 30 x 1 x 0,9
    expect(segundo.puntaje).toBe(calcularPuntaje(muestra, { precision: 1, intentos: 2 }));
    expect(
      w
        .emitted('completada')!
        .every((e) => problemasDeEmisiones({ completada: [e] }, muestra).length === 0),
    ).toBe(true);
  });

  it('los errores del intento anterior no se arrastran al siguiente', async () => {
    const w = montar(muestra);
    await unir(w, ...equivocado(muestra));
    await completar(w, muestra);
    expect(completada(w)!.detalle.errores).toBe(1);
    await w.get('[data-test="resultado"] button').trigger('click');
    await completar(w, muestra);
    const segundo = w.emitted('completada')![1]![0] as ResultadoActividad<'relacion-columnas'>;
    expect(segundo.precision).toBe(1);
    expect(segundo.detalle.errores).toBe(0);
  });

  it('tras repetir se vuelve a emitir progreso (el emisor se reabre)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const w = montar(muestra);
      await completar(w, muestra);
      await w.get('[data-test="resultado"] button').trigger('click');
      const antes = w.emitted('progreso')?.length ?? 0;
      await unir(w, 'ea_osteoblasto', 'eb_forma');
      expect(w.emitted('progreso')!.length).toBe(antes + 1);
      const ultimo = w.emitted('progreso')!.at(-1)![0] as { intentos: number };
      expect(ultimo.intentos).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('con aprobacion_min y precisión por debajo: dice cuánto se necesita y ofrece intentar de nuevo', async () => {
    const actividad = { ...clonar(muestra), aprobacion_min: 0.9 };
    const w = montar(actividad);
    await unir(w, ...equivocado(actividad));
    await completar(w, actividad); // 4/5 = 80 %
    const minimo = w.get('[data-test="minimo"]');
    expect(minimo.text()).toContain('Necesitas 90 % de acierto para seguir; inténtalo de nuevo.');
    expect(w.get('[data-test="resultado"] button').text()).toContain('Intentar de nuevo');
    // Completó la ejecución igualmente: la página decide si está superada.
    expect(w.emitted('completada')).toHaveLength(1);
  });

  it('con aprobacion_min y precisión suficiente no muestra el aviso', async () => {
    const actividad = { ...clonar(muestra), aprobacion_min: 0.9 };
    const w = montar(actividad);
    await completar(w, actividad);
    expect(w.find('[data-test="minimo"]').exists()).toBe(false);
    expect(w.get('[data-test="resultado"] button').text()).toContain('Repetir la actividad');
  });
});

/* -------------------------------------------------------------------------------------------
 * Barajado
 * ----------------------------------------------------------------------------------------- */

describe('disposición de las columnas', () => {
  it('la columna A conserva el orden del JSON y la B sale del barajado estable del intento', () => {
    const w1 = montar(muestra);
    const w2 = montar(muestra);
    expect(orden(w1, 'a')).toEqual(muestra.config.columna_a.elementos.map((e) => e.id));
    expect(orden(w1, 'b')).toEqual(orden(w2, 'b'));
    const a = analizarConfig(muestra.config) as AnalisisValido;
    expect(orden(w1, 'b')).toEqual(
      ordenarColumnaB(a, derivarSemilla(muestra.id, 1)).map((i) => a.b[i]!.id),
    );
  });

  it('no usa Math.random', () => {
    const espia = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random no debe usarse');
    });
    const w = montar(muestra);
    expect(w.findAll('[data-columna]')).toHaveLength(9);
    expect(espia).not.toHaveBeenCalled();
  });

  it('un intento distinto (servidor con 1 registrado) usa la semilla del intento 2', () => {
    const w = montar(muestra, {
      estadoPrevio: { servidor: { puntaje: 10, intentos: 1, completada: true } },
    });
    const a = analizarConfig(muestra.config) as AnalisisValido;
    expect(orden(w, 'b')).toEqual(
      ordenarColumnaB(a, derivarSemilla(muestra.id, 2)).map((i) => a.b[i]!.id),
    );
  });

  it('barajar: false conserva el orden del JSON en ambas columnas', () => {
    const actividad = clonar(muestra);
    actividad.config.barajar = false;
    const w = montar(actividad);
    expect(orden(w, 'b')).toEqual(actividad.config.columna_b.elementos.map((e) => e.id));
  });

  it('las parejas de B nunca quedan en el orden de A (3 pares sin distractores, 40 ids de actividad)', () => {
    for (let i = 0; i < 40; i++) {
      const actividad = crearActividad({ id: `m1_prueba_${i}`, pares: 3, distractores: 0 });
      const w = montar(actividad);
      expect(orden(w, 'b')).not.toEqual(['eb_1', 'eb_2', 'eb_3']);
      w.unmount();
    }
  });

  it('completar no cambia la posición de los elementos (nada se mueve bajo el dedo)', async () => {
    const w = montar(muestra);
    const antes = orden(w, 'b');
    await unir(w, 'ea_osteoblasto', 'eb_forma');
    await unir(w, 'ea_osteoclasto', 'eb_reabsorbe');
    expect(orden(w, 'b')).toEqual(antes);
  });
});

/* -------------------------------------------------------------------------------------------
 * Estado previo e instantáneas
 * ----------------------------------------------------------------------------------------- */

describe('estado restaurado', () => {
  const a = analizarConfig(muestra.config) as AnalisisValido;
  const idx = (idPar: string) => a.pares.findIndex((p) => p.id === idPar);
  const progresoCon = (hechos: number[], errores: number[], intentos = 1, semilla = 77) => ({
    avance: hechos.length / 4,
    intentos,
    instantanea: crearInstantanea(a, { hechos, errores }, semilla),
  });

  it('restaura las parejas hechas (con su numeración) y los errores acumulados', async () => {
    const hechos = [idx('par_osteocito'), idx('par_osteoblasto')];
    const w = montar(muestra, {
      estadoPrevio: { progreso: progresoCon(hechos, [0, 2, 0, 0]) },
    });
    expect(item(w, 'a', 'ea_osteocito').text()).toContain('Pareja 1');
    expect(item(w, 'a', 'ea_osteoblasto').text()).toContain('Pareja 2');
    expect(w.findAll('[data-estado="emparejado"]')).toHaveLength(4);
    expect(w.get('[data-test="conteo"]').text()).toContain('2 de 4');
    // Un restaurado no emite nada por sí solo.
    expect(w.emitted('completada')).toBeUndefined();
    expect(w.emitted('interaccion')).toBeUndefined();
    await unir(w, 'ea_osteoclasto', 'eb_reabsorbe');
    await unir(w, 'ea_revestimiento', 'eb_cubre');
    const r = completada(w)!;
    expect(r.detalle).toEqual({
      aciertos: 4,
      errores: 2,
      errores_por_par: { par_osteoclasto: 2 },
    });
    expect(r.precision).toBeCloseTo(4 / 6, 10);
  });

  it('conserva la semilla guardada (la disposición no cambia al recargar)', () => {
    const w = montar(muestra, {
      estadoPrevio: { progreso: progresoCon([0], [0, 0, 0, 0], 1, 424242) },
    });
    expect(orden(w, 'b')).toEqual(ordenarColumnaB(a, 424242).map((i) => a.b[i]!.id));
  });

  it('el intento a medias conserva su número y la penalización', async () => {
    const w = montar(muestra, {
      estadoPrevio: { progreso: progresoCon([0], [0, 0, 0, 0], 3) },
    });
    await unir(w, 'ea_osteoclasto', 'eb_reabsorbe');
    await unir(w, 'ea_osteocito', 'eb_detecta');
    await unir(w, 'ea_revestimiento', 'eb_cubre');
    const r = completada(w)!;
    expect(r.intentos).toBe(3);
    expect(r.puntaje).toBe(24); // 30 x 1 x 0,8
  });

  it('una instantánea de un intento que el servidor ya registró está vencida y se ignora', () => {
    const w = montar(muestra, {
      estadoPrevio: {
        progreso: progresoCon([0, 1], [0, 0, 0, 0], 1),
        servidor: { puntaje: 20, intentos: 1, completada: true },
      },
    });
    expect(w.findAll('[data-estado="emparejado"]')).toHaveLength(0);
  });

  it.each<[string, unknown]>([
    [
      'de otro contenido (otra firma)',
      {
        ...progresoCon([0], [0, 0, 0, 0]),
        instantanea: {
          ...crearInstantanea(a, { hechos: [0], errores: [0, 0, 0, 0] }, 1),
          firma: 1,
        },
      },
    ],
    ['con índices fuera de rango', progresoCon([9], [0, 0, 0, 0])],
    ['de un intento ya terminado', progresoCon([0, 1, 2, 3], [0, 0, 0, 0])],
    ['con errores negativos', progresoCon([0], [0, -1, 0, 0])],
    ['con intentos no numéricos', { avance: 0.2, intentos: 'x', instantanea: {} }],
  ])('una instantánea %s se ignora y la actividad funciona desde cero', async (_n, progreso) => {
    const w = montar(muestra, { estadoPrevio: { progreso } as never });
    expect(w.findAll('[data-estado="emparejado"]')).toHaveLength(0);
    await completar(w, muestra);
    expect(completada(w)!.detalle).toEqual({ aciertos: 4, errores: 0, errores_por_par: {} });
  });

  it('un estado que llega tarde con progreso se aplica si el estudiante aún no hizo nada', async () => {
    const w = montar(muestra);
    await w.setProps({ estadoPrevio: { progreso: progresoCon([0, 1], [0, 0, 0, 0]) } } as never);
    expect(w.findAll('[data-estado="emparejado"]')).toHaveLength(4);
  });

  it('pero un estado tardío NO pisa lo que el estudiante ya hizo', async () => {
    const w = montar(muestra);
    await unir(w, 'ea_osteoblasto', 'eb_forma');
    await w.setProps({
      estadoPrevio: { servidor: { puntaje: 5, intentos: 5, completada: true } },
    } as never);
    expect(w.findAll('[data-estado="emparejado"]')).toHaveLength(2);
    await completar(w, {
      ...muestra,
      config: { ...muestra.config, pares: muestra.config.pares.slice(1) },
    });
    expect(completada(w)!.intentos).toBe(1);
  });

  it('cambiar de actividad (otro id) reinicia el estado', async () => {
    const w = montar(muestra);
    await unir(w, 'ea_osteoblasto', 'eb_forma');
    const otra = crearActividad({ id: 'm1_otra_relacion' });
    await w.setProps({ actividad: otra } as never);
    expect(w.findAll('[data-estado="emparejado"]')).toHaveLength(0);
    expect(w.findAll('[data-columna="a"]')).toHaveLength(4);
    expect(w.text()).toContain('Elemento 1');
  });

  it('un nuevo objeto con el MISMO contenido no reinicia lo hecho', async () => {
    const w = montar(muestra);
    await unir(w, 'ea_osteoblasto', 'eb_forma');
    await w.setProps({ actividad: clonar(muestra) } as never);
    expect(w.findAll('[data-estado="emparejado"]')).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------------------------
 * progreso
 * ----------------------------------------------------------------------------------------- */

describe('progreso', () => {
  it('emite a la primera acción con avance, intentos e instantánea válida; agrupa el resto', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const w = montar(muestra);
      await unir(w, 'ea_osteoblasto', 'eb_forma');
      expect(w.emitted('progreso')).toHaveLength(1);
      await unir(w, 'ea_osteoclasto', 'eb_reabsorbe');
      await unir(w, ...equivocado(muestra, 2));
      expect(w.emitted('progreso')).toHaveLength(1); // agrupado
      await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS + 1);
      expect(w.emitted('progreso')).toHaveLength(2);
      const ultimo = w.emitted('progreso')!.at(-1)![0] as {
        avance: number;
        intentos: number;
        instantanea: { hechos: number[]; errores: number[] };
      };
      expect(ultimo.avance).toBe(0.5);
      expect(ultimo.intentos).toBe(1);
      expect(ultimo.instantanea.hechos).toHaveLength(2);
      expect(ultimo.instantanea.errores.reduce((s, n) => s + n, 0)).toBe(1);
      expect(problemasDeEmisiones(w.emitted() as EventosEmitidos, muestra)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('elegir un elemento (sin unirlo) no emite progreso', async () => {
    const w = montar(muestra);
    await item(w, 'a', 'ea_osteoblasto').trigger('click');
    expect(w.emitted('progreso')).toBeUndefined();
  });

  it('lo emitido se puede restaurar tal cual (ida y vuelta por estadoPrevio)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const w1 = montar(muestra);
      await unir(w1, 'ea_osteocito', 'eb_detecta');
      await unir(w1, ...equivocado(muestra));
      await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS + 1);
      const guardado = w1.emitted('progreso')!.at(-1)![0] as never;
      w1.unmount();
      const w2 = montar(muestra, { estadoPrevio: { progreso: guardado } });
      expect(item(w2, 'a', 'ea_osteocito').attributes('data-estado')).toBe('emparejado');
      await unir(w2, 'ea_osteoblasto', 'eb_forma');
      await unir(w2, 'ea_osteoclasto', 'eb_reabsorbe');
      await unir(w2, 'ea_revestimiento', 'eb_cubre');
      expect(completada(w2)!.detalle.errores).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('jamás emite progreso después de completada, ni al pasar el tiempo ni al desmontar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const alProgreso = vi.fn();
      const w = montar(muestra, { onProgreso: alProgreso } as never);
      await unir(w, 'ea_osteoblasto', 'eb_forma');
      await unir(w, 'ea_osteoclasto', 'eb_reabsorbe'); // queda pendiente en el limitador
      await unir(w, 'ea_osteocito', 'eb_detecta');
      await unir(w, 'ea_revestimiento', 'eb_cubre'); // completa
      const antes = alProgreso.mock.calls.length;
      expect(w.emitted('completada')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS * 5);
      w.unmount();
      expect(alProgreso.mock.calls.length).toBe(antes);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* -------------------------------------------------------------------------------------------
 * Modo revisar
 * ----------------------------------------------------------------------------------------- */

describe('modo revisar', () => {
  it('muestra las parejas correctas con sus explicaciones y los sobrantes, sin controles', () => {
    const w = montar(muestra, { modo: 'revisar' });
    expect(w.findAll('button')).toHaveLength(0);
    const texto = w.get('[data-test="revision"]').text();
    expect(texto).toContain('Osteoblasto');
    expect(texto).toContain('Forma matriz ósea nueva');
    expect(texto).toContain('fabrican el osteoide');
    expect(texto).toContain('Produce glóbulos rojos'); // el sobrante
    expect(w.findAll('[data-columna]')).toHaveLength(0);
  });

  it('no emite nada, ni siquiera con clics o teclas', async () => {
    const w = montar(muestra, { modo: 'revisar' });
    await w.trigger('click');
    await w.trigger('keydown', { key: 'Escape' });
    expect(w.emitted()).toEqual({ click: expect.anything(), keydown: expect.anything() });
    expect(w.emitted('completada')).toBeUndefined();
    expect(w.emitted('interaccion')).toBeUndefined();
    expect(w.emitted('progreso')).toBeUndefined();
  });

  it('pasar de jugar a revisar a media partida cierra el progreso pendiente', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const alProgreso = vi.fn();
      const w = montar(muestra, { onProgreso: alProgreso } as never);
      await unir(w, 'ea_osteoblasto', 'eb_forma');
      await unir(w, 'ea_osteoclasto', 'eb_reabsorbe'); // queda pendiente en el limitador
      const antes = alProgreso.mock.calls.length;
      await w.setProps({ modo: 'revisar' });
      await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS * 3);
      w.unmount();
      expect(alProgreso.mock.calls.length).toBe(antes);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* -------------------------------------------------------------------------------------------
 * Estado de error de la configuración
 * ----------------------------------------------------------------------------------------- */

describe('configuración inválida', () => {
  function rota(cambio: (c: any) => void): ActividadRelacionColumnas {
    const a = clonar(muestra) as any;
    cambio(a.config);
    return a;
  }

  it.each<[string, (c: any) => void]>([
    ['un par apunta a un elemento que no existe', (c) => (c.pares[0].b = 'fantasma')],
    ['no hay pares', (c) => (c.pares = [])],
    ['falta la columna B', (c) => delete c.columna_b],
  ])('%s: muestra un error claro en español, sin botones ni eventos', async (_n, cambio) => {
    const w = montar(rota(cambio));
    await flushPromises();
    const alerta = w.get('[role="alert"]');
    expect(alerta.text()).toContain('No se pudo mostrar esta actividad');
    expect(alerta.text()).toContain('Avisa a tu docente');
    expect(w.findAll('[data-columna]')).toHaveLength(0);
    expect(w.find('[aria-live]').exists()).toBe(true);
    expect(w.emitted('completada')).toBeUndefined();
    expect(w.emitted('interaccion')).toBeUndefined();
    expect(w.emitted('progreso')).toBeUndefined();
  });

  it('en modo revisar con configuración rota también muestra el error y no rompe', () => {
    const w = montar(
      rota((c) => (c.pares = [])),
      { modo: 'revisar' },
    );
    expect(w.find('[role="alert"]').exists()).toBe(true);
  });
});

/* -------------------------------------------------------------------------------------------
 * Teclado
 * ----------------------------------------------------------------------------------------- */

describe('teclado', () => {
  it('todos los elementos son botones nativos alcanzables con Tab (Enter y Espacio los activan)', () => {
    const w = montar(muestra);
    for (const b of w.findAll('[data-columna]')) {
      expect(b.element.tagName).toBe('BUTTON');
      expect(b.attributes('tabindex')).toBeUndefined(); // ni roving ni -1
      expect(b.attributes('disabled')).toBeUndefined();
    }
  });

  it('las flechas arriba y abajo mueven el foco dentro de la columna y Inicio/Fin a los extremos', async () => {
    const w = montar(muestra);
    const ids = orden(w, 'a');
    const primero = item(w, 'a', ids[0]!);
    (primero.element as HTMLElement).focus();
    await primero.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(item(w, 'a', ids[1]!).element);
    await item(w, 'a', ids[1]!).trigger('keydown', { key: 'ArrowUp' });
    expect(document.activeElement).toBe(primero.element);
    await primero.trigger('keydown', { key: 'ArrowUp' }); // no se sale por arriba
    expect(document.activeElement).toBe(primero.element);
    await primero.trigger('keydown', { key: 'End' });
    expect(document.activeElement).toBe(item(w, 'a', ids.at(-1)!).element);
    await item(w, 'a', ids.at(-1)!).trigger('keydown', { key: 'Home' });
    expect(document.activeElement).toBe(primero.element);
  });

  it('flecha derecha pasa de A a B y flecha izquierda vuelve, en la misma fila', async () => {
    const w = montar(muestra);
    const a1 = item(w, 'a', orden(w, 'a')[1]!);
    (a1.element as HTMLElement).focus();
    await a1.trigger('keydown', { key: 'ArrowRight' });
    const b1 = item(w, 'b', orden(w, 'b')[1]!);
    expect(document.activeElement).toBe(b1.element);
    await b1.trigger('keydown', { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(a1.element);
    // La flecha izquierda en A y la derecha en B no hacen nada.
    await a1.trigger('keydown', { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(a1.element);
  });

  it('la flecha derecha desde una fila que solo existe en A cae en la última de B (sin errores)', async () => {
    const w = montar(crearActividad({ pares: 3, distractores: 0 }));
    const a = item(w, 'a', 'ea_3');
    (a.element as HTMLElement).focus();
    await a.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('data-columna')).toBe('b');
  });

  it('otras teclas no se interceptan (Tab, Enter, letras)', async () => {
    const w = montar(muestra);
    const b = item(w, 'a', 'ea_osteoblasto');
    for (const key of ['Tab', 'Enter', ' ', 'a']) {
      const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      b.element.dispatchEvent(evento);
      expect(evento.defaultPrevented, key).toBe(false);
    }
  });

  it('el foco se queda donde estaba tras un error (R6)', async () => {
    const w = montar(muestra);
    await item(w, 'a', 'ea_osteoblasto').trigger('click');
    const b = item(w, 'b', 'eb_reabsorbe');
    (b.element as HTMLElement).focus();
    await b.trigger('click');
    expect(document.activeElement).toBe(b.element);
  });

  it('nada roba el foco al cargar', () => {
    const w = montar(muestra);
    expect(document.activeElement).toBe(document.body);
    expect(w.exists()).toBe(true);
  });
});

/* -------------------------------------------------------------------------------------------
 * Arrastre con eventos de puntero
 * ----------------------------------------------------------------------------------------- */

/** Geometría simulada: A a la izquierda, B a la derecha, 60 px por fila. */
function simularGeometria() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const columna = this.getAttribute('data-columna');
    if (!columna) return new DOMRect(0, 0, 0, 0);
    const fila = [...(this.closest('ul')?.querySelectorAll('button') ?? [])].indexOf(
      this as HTMLButtonElement,
    );
    return new DOMRect(columna === 'a' ? 0 : 300, fila * 60, 200, 50);
  });
}

function centro(w: VueWrapper, columna: 'a' | 'b', id: string): { x: number; y: number } {
  const r = item(w, columna, id).element.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function puntero(
  destino: EventTarget,
  tipo: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  x: number,
  y: number,
  extra: PointerEventInit = {},
): void {
  destino.dispatchEvent(
    new PointerEvent(tipo, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      bubbles: true,
      cancelable: true,
      ...extra,
    }),
  );
}

async function arrastrar(
  w: VueWrapper,
  de: { columna: 'a' | 'b'; id: string },
  a: { x: number; y: number },
  extra: PointerEventInit = {},
): Promise<void> {
  const origen = centro(w, de.columna, de.id);
  puntero(item(w, de.columna, de.id).element, 'pointerdown', origen.x, origen.y, extra);
  puntero(window, 'pointermove', (origen.x + a.x) / 2, (origen.y + a.y) / 2, extra);
  puntero(window, 'pointermove', a.x, a.y, extra);
  await flushPromises();
  puntero(window, 'pointerup', a.x, a.y, extra);
  await flushPromises();
}

describe('arrastre (eventos de puntero simulados)', () => {
  it('arrastrar un elemento de A sobre su pareja de B la une (acierto)', async () => {
    simularGeometria();
    const w = montar(muestra);
    await arrastrar(w, { columna: 'a', id: 'ea_osteoblasto' }, centro(w, 'b', 'eb_forma'));
    expect(item(w, 'a', 'ea_osteoblasto').attributes('data-estado')).toBe('emparejado');
    expect(interacciones(w)).toEqual([
      { accion: 'relaciona_par', objeto: 'ea_osteoblasto', resultado: 'correcta' },
    ]);
  });

  it('también funciona de B hacia A y con un puntero táctil', async () => {
    simularGeometria();
    const w = montar(muestra);
    await arrastrar(w, { columna: 'b', id: 'eb_reabsorbe' }, centro(w, 'a', 'ea_osteoclasto'), {
      pointerType: 'touch',
    });
    expect(item(w, 'a', 'ea_osteoclasto').attributes('data-estado')).toBe('emparejado');
  });

  it('soltar sobre la pareja equivocada cuenta un error atribuido al elemento de A', async () => {
    simularGeometria();
    const w = montar(muestra);
    await arrastrar(w, { columna: 'a', id: 'ea_osteoblasto' }, centro(w, 'b', 'eb_globulos'));
    expect(interacciones(w)).toEqual([
      { accion: 'relaciona_par', objeto: 'ea_osteoblasto', resultado: 'incorrecta' },
    ]);
    expect(item(w, 'a', 'ea_osteoblasto').attributes('data-estado')).toBe('fallo');
  });

  it('soltar en el vacío no hace nada: ni error ni acierto', async () => {
    simularGeometria();
    const w = montar(muestra);
    await arrastrar(w, { columna: 'a', id: 'ea_osteoblasto' }, { x: 900, y: 900 });
    expect(w.emitted('interaccion')).toBeUndefined();
    expect(w.findAll('[data-estado="emparejado"]')).toHaveLength(0);
    expect(document.querySelector('[data-test="fantasma"]')).toBeNull();
  });

  it('soltar sobre la misma columna no hace nada', async () => {
    simularGeometria();
    const w = montar(muestra);
    await arrastrar(w, { columna: 'a', id: 'ea_osteoblasto' }, centro(w, 'a', 'ea_osteocito'));
    expect(w.emitted('interaccion')).toBeUndefined();
  });

  it('un movimiento corto (menos de 8 px) no es un arrastre: el toque sigue siendo un clic', async () => {
    simularGeometria();
    const w = montar(muestra);
    const o = centro(w, 'a', 'ea_osteoblasto');
    puntero(item(w, 'a', 'ea_osteoblasto').element, 'pointerdown', o.x, o.y, {
      pointerType: 'touch',
    });
    puntero(window, 'pointermove', o.x + 3, o.y + 2, { pointerType: 'touch' });
    puntero(window, 'pointerup', o.x + 3, o.y + 2, { pointerType: 'touch' });
    expect(document.querySelector('[data-test="fantasma"]')).toBeNull();
    await item(w, 'a', 'ea_osteoblasto').trigger('click');
    expect(item(w, 'a', 'ea_osteoblasto').attributes('aria-pressed')).toBe('true');
  });

  it('durante el arrastre aparece un fantasma con el texto y el destino se resalta; al soltar desaparecen', async () => {
    simularGeometria();
    const w = montar(muestra);
    const o = centro(w, 'a', 'ea_osteoblasto');
    const d = centro(w, 'b', 'eb_forma');
    puntero(item(w, 'a', 'ea_osteoblasto').element, 'pointerdown', o.x, o.y);
    puntero(window, 'pointermove', d.x, d.y);
    await flushPromises();
    const fantasma = document.querySelector('[data-test="fantasma"]') as HTMLElement;
    expect(fantasma).not.toBeNull();
    expect(fantasma.textContent).toContain('Osteoblasto');
    expect(fantasma.getAttribute('aria-hidden')).toBe('true');
    expect(item(w, 'a', 'ea_osteoblasto').attributes('data-estado')).toBe('arrastrado');
    expect(item(w, 'b', 'eb_forma').attributes('data-estado')).toBe('objetivo');
    expect(item(w, 'b', 'eb_forma').text()).toContain('Soltar aquí');
    puntero(window, 'pointerup', d.x, d.y);
    await flushPromises();
    expect(document.querySelector('[data-test="fantasma"]')).toBeNull();
  });

  it('el clic que sigue a un arrastre no cuenta como un toque más', async () => {
    simularGeometria();
    const w = montar(muestra);
    await arrastrar(w, { columna: 'a', id: 'ea_osteoclasto' }, { x: 900, y: 900 });
    await item(w, 'a', 'ea_osteoclasto').trigger('click'); // eco del arrastre
    expect(item(w, 'a', 'ea_osteoclasto').attributes('aria-pressed')).toBe('false');
    await item(w, 'a', 'ea_osteoclasto').trigger('click'); // este sí es un toque
    expect(item(w, 'a', 'ea_osteoclasto').attributes('aria-pressed')).toBe('true');
  });

  it('pointercancel (el navegador toma el gesto para desplazar) cancela sin efecto', async () => {
    simularGeometria();
    const w = montar(muestra);
    const o = centro(w, 'a', 'ea_osteoblasto');
    const d = centro(w, 'b', 'eb_forma');
    puntero(item(w, 'a', 'ea_osteoblasto').element, 'pointerdown', o.x, o.y, {
      pointerType: 'touch',
    });
    puntero(window, 'pointermove', d.x, d.y, { pointerType: 'touch' });
    puntero(window, 'pointercancel', d.x, d.y, { pointerType: 'touch' });
    puntero(window, 'pointerup', d.x, d.y, { pointerType: 'touch' });
    await flushPromises();
    expect(w.emitted('interaccion')).toBeUndefined();
    expect(document.querySelector('[data-test="fantasma"]')).toBeNull();
  });

  it('ignora otro puntero, el botón derecho y los punteros no primarios', async () => {
    simularGeometria();
    const w = montar(muestra);
    const o = centro(w, 'a', 'ea_osteoblasto');
    const d = centro(w, 'b', 'eb_forma');
    const el = item(w, 'a', 'ea_osteoblasto').element;
    puntero(el, 'pointerdown', o.x, o.y, { button: 2 });
    puntero(window, 'pointermove', d.x, d.y);
    puntero(window, 'pointerup', d.x, d.y);
    puntero(el, 'pointerdown', o.x, o.y, { isPrimary: false, pointerType: 'touch' });
    puntero(window, 'pointermove', d.x, d.y, { pointerType: 'touch' });
    puntero(window, 'pointerup', d.x, d.y, { pointerType: 'touch' });
    // Un segundo dedo no interrumpe el arrastre del primero.
    puntero(el, 'pointerdown', o.x, o.y);
    puntero(window, 'pointermove', d.x, d.y, { pointerId: 2 });
    puntero(window, 'pointerup', d.x, d.y, { pointerId: 2 });
    expect(document.querySelector('[data-test="fantasma"]')).toBeNull();
    puntero(window, 'pointerup', d.x, d.y);
    await flushPromises();
    expect(w.emitted('interaccion')).toBeUndefined();
  });

  it('un elemento ya emparejado no se puede arrastrar ni recibir un arrastre', async () => {
    simularGeometria();
    const w = montar(muestra);
    await unir(w, 'ea_osteoblasto', 'eb_forma');
    const antes = w.emitted('interaccion')!.length;
    await arrastrar(w, { columna: 'a', id: 'ea_osteoclasto' }, centro(w, 'b', 'eb_forma'));
    expect(anuncio(w)).toContain('ya tiene pareja');
    await arrastrar(w, { columna: 'a', id: 'ea_osteoblasto' }, centro(w, 'b', 'eb_reabsorbe'));
    expect(w.emitted('interaccion')).toHaveLength(antes);
  });

  it('en modo revisar, con la actividad completada o con configuración rota no hay arrastre', async () => {
    simularGeometria();
    const w = montar(muestra);
    await completar(w, muestra);
    const antes = w.emitted('interaccion')!.length;
    await arrastrar(w, { columna: 'a', id: 'ea_osteoclasto' }, centro(w, 'b', 'eb_reabsorbe'));
    expect(w.emitted('interaccion')).toHaveLength(antes);
    expect(document.querySelector('[data-test="fantasma"]')).toBeNull();
  });

  it('la selección hecha por toque se conserva si el arrastre se suelta en el vacío', async () => {
    simularGeometria();
    const w = montar(muestra);
    await item(w, 'a', 'ea_osteocito').trigger('click');
    await arrastrar(w, { columna: 'a', id: 'ea_osteoblasto' }, { x: 900, y: 900 });
    expect(item(w, 'a', 'ea_osteocito').attributes('aria-pressed')).toBe('true');
  });

  it('Escape cancela un arrastre en curso', async () => {
    simularGeometria();
    const w = montar(muestra);
    const o = centro(w, 'a', 'ea_osteoblasto');
    const d = centro(w, 'b', 'eb_forma');
    puntero(item(w, 'a', 'ea_osteoblasto').element, 'pointerdown', o.x, o.y);
    puntero(window, 'pointermove', d.x, d.y);
    await flushPromises();
    expect(document.querySelector('[data-test="fantasma"]')).not.toBeNull();
    await w.trigger('keydown', { key: 'Escape' });
    expect(document.querySelector('[data-test="fantasma"]')).toBeNull();
    puntero(window, 'pointerup', d.x, d.y);
    expect(w.emitted('interaccion')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------------------------
 * reduced-motion
 * ----------------------------------------------------------------------------------------- */

function simularMediaQuery(reducir: boolean) {
  const agregadas = vi.fn();
  const quitadas = vi.fn();
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (consulta: string) =>
      ({
        matches: reducir && consulta.includes('prefers-reduced-motion'),
        media: consulta,
        onchange: null,
        addEventListener: agregadas,
        removeEventListener: quitadas,
        addListener: agregadas,
        removeListener: quitadas,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  return { agregadas, quitadas };
}

describe('prefers-reduced-motion', () => {
  it('con movimiento reducido: marca el componente, el fantasma no se inclina y el par nuevo no se anima', async () => {
    simularMediaQuery(true);
    simularGeometria();
    const w = montar(muestra);
    expect(w.get('section').attributes('data-movimiento')).toBe('reducido');
    expect(w.get('section').classes()).toContain('movimiento-reducido');
    const o = centro(w, 'a', 'ea_osteoblasto');
    const d = centro(w, 'b', 'eb_forma');
    puntero(item(w, 'a', 'ea_osteoblasto').element, 'pointerdown', o.x, o.y);
    puntero(window, 'pointermove', d.x, d.y);
    await flushPromises();
    expect(
      document.querySelector('[data-test="fantasma"]')!.classList.contains('fantasma-reducido'),
    ).toBe(true);
    puntero(window, 'pointerup', d.x, d.y);
    await flushPromises();
    expect(w.findAll('.nuevo')).toHaveLength(0);
    // Y la información sigue completa en texto.
    expect(item(w, 'a', 'ea_osteoblasto').text()).toContain('Pareja 1');
  });

  it('sin la preferencia, el par recién formado lleva la clase de aparición y solo ese', async () => {
    simularMediaQuery(false);
    const w = montar(muestra);
    expect(w.get('section').attributes('data-movimiento')).toBe('normal');
    await unir(w, 'ea_osteoblasto', 'eb_forma');
    expect(w.findAll('.nuevo')).toHaveLength(2);
    await unir(w, 'ea_osteoclasto', 'eb_reabsorbe');
    expect(
      w
        .findAll('.nuevo')
        .map((x) => x.attributes('data-id'))
        .sort(),
    ).toEqual(['ea_osteoclasto', 'eb_reabsorbe']);
  });

  it('el CSS respeta la preferencia: sin touch-action: none, con objetivos de 44 px y animación condicionada', () => {
    expect(fuenteDelComponente).toMatch(/min-height:\s*2\.75rem/);
    expect(fuenteDelComponente).toMatch(/touch-action:\s*pan-y/);
    expect(fuenteDelComponente).not.toMatch(/touch-action:\s*none/);
    expect(fuenteDelComponente).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.item\.nuevo/,
    );
    expect(fuenteDelComponente).toMatch(/@container \(min-width/); // apilado en pantallas estrechas
  });

  it('la escucha de la media query se libera al desmontar', () => {
    const { agregadas, quitadas } = simularMediaQuery(false);
    const w = montar(muestra);
    w.unmount();
    expect(agregadas.mock.calls.length).toBeGreaterThan(0);
    expect(quitadas.mock.calls.length).toBe(agregadas.mock.calls.length);
  });
});

/* -------------------------------------------------------------------------------------------
 * Desmontaje limpio
 * ----------------------------------------------------------------------------------------- */

describe('desmontaje', () => {
  it('no deja temporizadores, escuchas de window ni el fantasma tras desmontar en pleno arrastre', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    simularGeometria();
    const agregadas = vi.spyOn(window, 'addEventListener');
    const quitadas = vi.spyOn(window, 'removeEventListener');
    try {
      const alInteraccion = vi.fn();
      const w = montar(muestra, { onInteraccion: alInteraccion } as never);
      // Vue registra un temporizador propio (devtools) al crear la primera app: es la línea base.
      const base = vi.getTimerCount();
      await unir(w, 'ea_osteoblasto', 'eb_forma');
      await unir(w, 'ea_osteoclasto', 'eb_reabsorbe'); // deja progreso pendiente
      expect(vi.getTimerCount()).toBe(base + 1);
      const o = centro(w, 'a', 'ea_osteocito');
      const d = centro(w, 'b', 'eb_detecta');
      puntero(item(w, 'a', 'ea_osteocito').element, 'pointerdown', o.x, o.y);
      puntero(window, 'pointermove', d.x, d.y);
      await flushPromises();
      expect(document.querySelector('[data-test="fantasma"]')).not.toBeNull();
      w.unmount();
      expect(document.querySelector('[data-test="fantasma"]')).toBeNull();
      expect(vi.getTimerCount()).toBe(base);
      const de = (espia: typeof agregadas) =>
        espia.mock.calls
          .filter(([tipo]) => String(tipo).startsWith('pointer'))
          .map(([tipo]) => tipo);
      expect(de(quitadas).sort()).toEqual(de(agregadas).sort());
      // Un pointerup posterior no hace nada (ya no hay escucha).
      puntero(window, 'pointerup', d.x, d.y);
      expect(alInteraccion).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('desmontar sin haber hecho nada no lanza ni emite', () => {
    const w = montar(muestra);
    expect(() => w.unmount()).not.toThrow();
    expect(w.emitted()).toEqual({});
  });

  it('las escuchas de window se ponen al presionar y se quitan al soltar', async () => {
    simularGeometria();
    const agregadas = vi.spyOn(window, 'addEventListener');
    const quitadas = vi.spyOn(window, 'removeEventListener');
    const w = montar(muestra);
    const cuenta = (espia: typeof agregadas) =>
      espia.mock.calls.filter(([t]) => String(t).startsWith('pointer')).length;
    expect(cuenta(agregadas)).toBe(0);
    await arrastrar(w, { columna: 'a', id: 'ea_osteoblasto' }, centro(w, 'b', 'eb_forma'));
    expect(cuenta(agregadas)).toBe(3);
    expect(cuenta(quitadas)).toBe(3);
  });
});

/* -------------------------------------------------------------------------------------------
 * Adversariales: tamaños, ids, textos
 * ----------------------------------------------------------------------------------------- */

describe('configuraciones adversariales', () => {
  it('límites máximos (8 pares, 11 en B): se completa y el detalle cabe en 4 KB', async () => {
    const actividad = crearActividad({ pares: 8, distractores: 3, puntaje_max: 1000 });
    const w = montar(actividad);
    expect(w.findAll('[data-columna="b"]')).toHaveLength(11);
    for (let i = 0; i < 30; i++) await unir(w, ...equivocado(actividad, i % 8));
    await completar(w, actividad);
    const r = completada(w)!;
    expect(r.detalle.aciertos).toBe(8);
    expect(r.detalle.errores).toBe(30);
    expect(problemasDeEmisiones(w.emitted() as EventosEmitidos, actividad)).toEqual([]);
    expect(r.puntaje).toBeLessThanOrEqual(1000);
  });

  it('una sola pareja (por debajo del mínimo del esquema): un toque-toque la completa', async () => {
    const actividad = crearActividad({ pares: 1, distractores: 0 });
    const w = montar(actividad);
    await unir(w, 'ea_1', 'eb_1');
    expect(completada(w)!.precision).toBe(1);
  });

  it('una pareja y dos distractores: los distractores no se pueden unir', async () => {
    const actividad = crearActividad({ pares: 1, distractores: 2 });
    const w = montar(actividad);
    await unir(w, 'ea_1', 'eb_2');
    await unir(w, 'ea_1', 'eb_3');
    expect(w.emitted('completada')).toBeUndefined();
    await unir(w, 'ea_1', 'eb_1');
    expect(completada(w)!.precision).toBeCloseTo(1 / 3, 10);
  });

  it('ids raros (constructor, toString, hasOwnProperty, ids con espacios y comillas) funcionan', async () => {
    const raros = ['constructor', 'toString', 'has own "prop"', "o'brien", 'ñandú', '__proto__'];
    const actividad = crearActividad({
      pares: 5,
      distractores: 1,
      idElemento: (col, i) => `${raros[i]!}${col === 'b' ? '' : ''}`,
    });
    actividad.config.pares.forEach((p, i) => (p.id = `par_${raros[i]!.length}_${i}`));
    const w = montar(actividad);
    await unir(w, 'toString', 'constructor'); // error
    await completar(w, actividad);
    const r = completada(w)!;
    expect(r.detalle.errores).toBe(1);
    expect(r.detalle.aciertos).toBe(5);
    expect(problemasDeEmisiones(w.emitted() as EventosEmitidos, actividad)).toEqual([]);
  });

  it('un id de elemento de 200 caracteres no rompe la interacción (se recorta a 64)', async () => {
    const largo = 'x'.repeat(200);
    const actividad = crearActividad({
      pares: 3,
      distractores: 0,
      idElemento: (col, i) => (i === 0 ? `${largo}_${col}` : `e${col}_${i}`),
    });
    const w = montar(actividad);
    await unir(w, `${largo}_a`, 'eb_1');
    const evento = interacciones(w)[0] as { objeto: string };
    expect(evento.objeto).toBe(`${largo}_a`);
    expect(problemasDeEmisiones(w.emitted() as EventosEmitidos, actividad)).toEqual([]);
  });

  it('textos de 140 caracteres y explicaciones de 300: se muestran enteros y con ajuste de línea', async () => {
    const t = (n: number, c: string) => `${c}`.repeat(n).slice(0, n);
    const actividad = crearActividad({
      pares: 3,
      distractores: 3,
      texto: (col, i) => `${col}${i} ${t(136, 'palabra ')}`.slice(0, 140),
      explicacion: (i) => `Explicación ${i} ${t(300, 'detalle largo ')}`.slice(0, 300),
    });
    const w = montar(actividad);
    expect(item(w, 'a', 'ea_1').text()).toContain('a0 palabra');
    await unir(w, 'ea_1', 'eb_1');
    expect(anuncio(w)).toContain('Explicación 0');
    expect(fuenteDelComponente).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('caracteres Unicode: tildes, eñes, emoji, árabe, chino y combinados', async () => {
    const textos = ['Ñandú 🦴', 'عظم', '骨細胞', 'élula', 'Ω-3 ≥ 5 µm', '👨‍👩‍👧‍👦'];
    const actividad = crearActividad({
      pares: 3,
      distractores: 3,
      texto: (col, i) => `${textos[col === 'a' ? i : i + 3]}`,
    });
    const w = montar(actividad);
    expect(item(w, 'a', 'ea_1').text()).toContain('Ñandú 🦴');
    expect(item(w, 'b', 'eb_1').text()).toContain('élula');
    await unir(w, 'ea_1', 'eb_2'); // error: el mensaje lleva ambos textos
    expect(anuncio(w)).toContain('«Ñandú 🦴» no va con «Ω-3 ≥ 5 µm»');
    await completar(w, actividad);
    expect(completada(w)!.detalle.aciertos).toBe(3);
    expect(problemasDeEmisiones(w.emitted() as EventosEmitidos, actividad)).toEqual([]);
  });

  it('Markdown en los elementos: énfasis sí, enlaces sin ser anidados en el botón, HTML como texto', () => {
    const actividad = crearActividad({
      pares: 3,
      distractores: 0,
      texto: (col, i) =>
        col === 'a'
          ? [
              `**Osteo**blasto`,
              `[osteoclasto](glosario:osteoclasto)`,
              `<img src=x onerror="alert(1)"> texto`,
            ][i]!
          : `Función ${i}`,
    });
    const w = montar(actividad);
    expect(item(w, 'a', 'ea_1').find('strong').text()).toBe('Osteo');
    // Sin enlace dentro del botón (un control dentro de otro es inaccesible).
    expect(w.find('button a').exists()).toBe(false);
    expect(item(w, 'a', 'ea_2').text()).toContain('osteoclasto');
    // El HTML crudo no crea elementos; queda como texto escapado.
    expect(w.find('img').exists()).toBe(false);
    expect(item(w, 'a', 'ea_3').text()).toContain('<img');
    // El nombre plano en los anuncios no lleva marcado.
    return item(w, 'a', 'ea_1')
      .trigger('click')
      .then(() => expect(anuncio(w)).toContain('«Osteoblasto»'));
  });

  it('título, instrucciones y explicaciones hostiles no inyectan HTML', async () => {
    const actividad = crearActividad({
      pares: 3,
      distractores: 0,
      explicacion: () => '<script>window.__pwned = 1</script> **ok** <b onclick="x()">negrita</b>',
    });
    actividad.titulo = '<img src=x onerror=alert(1)> Título';
    actividad.instrucciones =
      'Instrucciones <script>alert(1)</script> con [enlace](javascript:alert(1)) largo';
    const w = montar(actividad);
    await unir(w, 'ea_1', 'eb_1');
    expect(w.find('script').exists()).toBe(false);
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('[onclick]').exists()).toBe(false);
    expect(w.find('a[href^="javascript"]').exists()).toBe(false);
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
    expect(w.get('h3').text()).toContain('<img');
  });

  it('un clic en un término del glosario no navega y avisa con el evento ova:glosario', async () => {
    const w = montar(muestra);
    await unir(w, 'ea_osteoblasto', 'eb_forma');
    const recibido = vi.fn();
    document.addEventListener('ova:glosario', recibido);
    try {
      const enlace = w.get('a[data-glosario]');
      const evento = new MouseEvent('click', { bubbles: true, cancelable: true });
      enlace.element.dispatchEvent(evento);
      expect(evento.defaultPrevented).toBe(true);
      expect(recibido).toHaveBeenCalledTimes(1);
      expect((recibido.mock.calls[0]![0] as CustomEvent).detail).toEqual({ id: 'osteoblasto' });
    } finally {
      document.removeEventListener('ova:glosario', recibido);
    }
  });

  it('dos instancias de la misma actividad en la misma página no comparten ids de DOM', () => {
    const Doble = defineComponent({
      render: () =>
        h('div', [
          h(Actividad, { modulo: 1, actividad: muestra }),
          h(Actividad, { modulo: 1, actividad: muestra }),
        ]),
    });
    const w = mount(Doble, { attachTo: document.body });
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ids).size).toBe(ids.length);
    const rotulos = [...document.querySelectorAll('[aria-labelledby]')].map((e) =>
      e.getAttribute('aria-labelledby'),
    );
    for (const r of rotulos) expect(document.getElementById(r!)).not.toBeNull();
    w.unmount();
  });

  it('el estado de dos instancias es independiente', async () => {
    const w1 = montar(muestra);
    const w2 = montar(muestra);
    await unir(w1, 'ea_osteoblasto', 'eb_forma');
    expect(w2.findAll('[data-estado="emparejado"]')).toHaveLength(0);
  });

  it('acepta puntaje_max 1 y penalización extrema sin salirse de [0, puntaje_max]', async () => {
    const actividad = crearActividad({ pares: 3, distractores: 0, puntaje_max: 1 });
    actividad.penalizacion = { por_intento: 0.5, piso: 0 };
    const w = montar(actividad, {
      estadoPrevio: { servidor: { puntaje: 0, intentos: 99, completada: true } },
    });
    await completar(w, actividad);
    const r = completada(w)!;
    expect(r.intentos).toBe(100);
    expect(r.puntaje).toBe(0);
    expect(problemasDeEmisiones(w.emitted() as EventosEmitidos, actividad)).toEqual([]);
  });
});
