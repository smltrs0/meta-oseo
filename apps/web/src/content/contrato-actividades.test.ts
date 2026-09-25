/**
 * Pruebas del contrato de los componentes de actividad (src/activities/types.ts): mapeo del
 * resultado a la API, interacciones, restauración de intentos, y que el compilador de Vue
 * resuelva las props y los eventos importados. Viven aquí porque `activities/types.ts` es el
 * único archivo de esa carpeta que pertenece al arquitecto del contenido.
 */
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  ACCIONES_INTERACCION,
  INSTANTANEA_MAX_BYTES,
  PROGRESO_INTERVALO_MIN_MS,
  TAMANO_TACTIL_MIN_PX,
  UMBRAL_VIDEO_VISTO,
  aPeticionResultadoApi,
  describirInteraccion,
  detalleParaApi,
  esProgresoTardio,
  intentoInicial,
  seleccionDeInteraccion,
} from '@/activities/types';
import type {
  DetallePorTipo,
  EmitsActividadQuiz,
  InteraccionActividad,
  PropsActividad,
  PropsActividadQuiz,
  PropsPorTipo,
  ResultadoActividad,
} from '@/activities/types';
import { API_DETALLE_MAX_BYTES } from './constantes';
import { listarActividades } from './consultas';
import type { ActividadQuiz, TipoActividad } from './schema';
import ActividadContrato from './__fixtures__/ActividadContrato.vue';
import { pruebasDeContratoActividad, problemasDeEmisiones } from './__fixtures__/contrato';
import type { EventosEmitidos } from './__fixtures__/contrato';
import { muestra, validar } from './__fixtures__/utiles';

const modulo = validar(muestra()).modulo!;
const quiz = listarActividades(modulo).find((u) => u.actividad.id === 'm1_quiz_repaso')!
  .actividad as ActividadQuiz;

/** Lo que valida el backend en POST /api/activities/{id}/result (app/schemas/activity.py). */
const CuerpoBackend = z.strictObject({
  modulo: z.number().int().min(1).max(6),
  tipo: z.enum([
    'multicapa',
    'arrastre-molecular',
    'relacion-columnas',
    'quiz',
    'video-texto',
    'exploracion-3d',
  ]),
  puntaje: z.number().int().min(0).max(1000),
  intentos: z.number().int().min(1).max(100),
  completada: z.boolean(),
  detalle: z
    .record(z.string(), z.unknown())
    .refine((d) => new TextEncoder().encode(JSON.stringify(d)).length <= 4096, 'detalle > 4 KB')
    .optional(),
});
const ACTIVITY_ID_BACKEND = /^[a-z0-9_-]{1,64}$/;

function resultado(
  sobrescribir: Partial<ResultadoActividad<'quiz'>> = {},
): ResultadoActividad<'quiz'> {
  return {
    puntaje: 40,
    intentos: 2,
    precision: 0.8,
    detalle: { preguntas: { qr_p1: 1 } },
    ...sobrescribir,
  };
}

describe('tipos del contrato', () => {
  it('hay props y detalle para exactamente los 6 tipos de actividad', () => {
    expectTypeOf<keyof PropsPorTipo>().toEqualTypeOf<TipoActividad>();
    expectTypeOf<keyof DetallePorTipo>().toEqualTypeOf<TipoActividad>();
    expectTypeOf<PropsActividad<'quiz'>>().toEqualTypeOf<PropsActividadQuiz>();
    expectTypeOf<PropsActividadQuiz['actividad']>().toEqualTypeOf<ActividadQuiz>();
    expectTypeOf<PropsActividadQuiz['modulo']>().toEqualTypeOf<1 | 2 | 3 | 4 | 5 | 6>();
    expectTypeOf<PropsActividadQuiz['modo']>().toEqualTypeOf<'jugar' | 'revisar' | undefined>();
  });

  it('las constantes de accesibilidad y de progreso son las del contrato', () => {
    expect(TAMANO_TACTIL_MIN_PX).toBe(44);
    expect(UMBRAL_VIDEO_VISTO).toBe(0.9);
    expect(INSTANTANEA_MAX_BYTES).toBe(8192);
    expect(PROGRESO_INTERVALO_MIN_MS).toBe(300);
  });
});

describe('aPeticionResultadoApi: ResultadoActividad -> POST /api/activities/{id}/result', () => {
  it('arma ruta y cuerpo exactos del contrato', () => {
    const peticion = aPeticionResultadoApi(quiz, 1, resultado());
    expect(peticion).toEqual({
      ruta: '/activities/m1_quiz_repaso/result',
      cuerpo: {
        modulo: 1,
        tipo: 'quiz',
        puntaje: 40,
        intentos: 2,
        completada: true,
        detalle: { preguntas: { qr_p1: 1 }, precision: 0.8 },
      },
    });
    expect(CuerpoBackend.safeParse(peticion.cuerpo).success).toBe(true);
  });

  it('el id de actividad de la ruta cumple el patrón de la API', () => {
    for (const u of listarActividades(modulo)) {
      const { ruta } = aPeticionResultadoApi(u.actividad, 1, resultado());
      const id = /^\/activities\/(.+)\/result$/.exec(ruta)?.[1] ?? '';
      expect(ACTIVITY_ID_BACKEND.test(id), id).toBe(true);
      expect(id).toBe(u.actividad.id);
    }
  });

  it('el tipo y el módulo salen de la actividad y del módulo', () => {
    for (const u of listarActividades(modulo)) {
      const { cuerpo } = aPeticionResultadoApi(u.actividad, 1, resultado());
      expect(cuerpo.tipo).toBe(u.actividad.tipo);
      expect(cuerpo.modulo).toBe(1);
    }
    expect(aPeticionResultadoApi(quiz, 4, resultado()).cuerpo.modulo).toBe(4);
  });

  it('acota el puntaje entre 0 y puntaje_max (y 1000) y el número de intentos entre 1 y 100', () => {
    const cuerpo = (r: Partial<ResultadoActividad<'quiz'>>) =>
      aPeticionResultadoApi(quiz, 1, resultado(r)).cuerpo;
    expect(cuerpo({ puntaje: 999 }).puntaje).toBe(50); // puntaje_max del quiz
    expect(cuerpo({ puntaje: -7 }).puntaje).toBe(0);
    expect(cuerpo({ puntaje: NaN }).puntaje).toBe(0);
    expect(cuerpo({ puntaje: 33.6 }).puntaje).toBe(34);
    expect(cuerpo({ intentos: 0 }).intentos).toBe(1);
    expect(cuerpo({ intentos: -3 }).intentos).toBe(1);
    expect(cuerpo({ intentos: NaN }).intentos).toBe(1);
    expect(cuerpo({ intentos: 2.9 }).intentos).toBe(2);
    expect(cuerpo({ intentos: 4000 }).intentos).toBe(100);
    const enorme = { ...quiz, puntaje_max: 5000 };
    expect(aPeticionResultadoApi(enorme, 1, resultado({ puntaje: 4000 })).cuerpo.puntaje).toBe(
      1000,
    );
  });

  it('completada es true por defecto y se puede indicar false (intento a medias)', () => {
    expect(aPeticionResultadoApi(quiz, 1, resultado()).cuerpo.completada).toBe(true);
    expect(
      aPeticionResultadoApi(quiz, 1, resultado(), { completada: false }).cuerpo.completada,
    ).toBe(false);
  });

  it('todo cuerpo generado cumple el esquema del backend, con datos normales y con datos absurdos', () => {
    const absurdos = [
      resultado(),
      resultado({ puntaje: -1, intentos: 0, precision: 3 }),
      resultado({ puntaje: 1e9, intentos: 1e9, precision: NaN }),
      resultado({ puntaje: 0.4, intentos: 0.4, precision: -2 }),
    ];
    for (const u of listarActividades(modulo)) {
      for (const r of absurdos) {
        const { cuerpo } = aPeticionResultadoApi(u.actividad, 1, r as never);
        const validado = CuerpoBackend.safeParse(cuerpo);
        expect(validado.success, JSON.stringify(cuerpo)).toBe(true);
      }
    }
  });
});

describe('detalleParaApi', () => {
  it('añade la precisión (4 decimales) y conserva el detalle del componente', () => {
    expect(detalleParaApi(2 / 3, { visitados: ['a', 'b'] })).toEqual({
      visitados: ['a', 'b'],
      precision: 0.6667,
    });
    expect(detalleParaApi(1, undefined)).toEqual({ precision: 1 });
  });

  it('la precisión real gana sobre una "precision" que traiga el detalle', () => {
    expect(detalleParaApi(0.5, { precision: 99 })).toEqual({ precision: 0.5 });
  });

  it('precisión fuera de rango o NaN se acota', () => {
    expect(detalleParaApi(7, {}).precision).toBe(1);
    expect(detalleParaApi(-7, {}).precision).toBe(0);
    expect(detalleParaApi(NaN, {}).precision).toBe(0);
  });

  it('quita undefined y funciones (JSON), y NaN queda como null', () => {
    const detalle = { a: 1, b: undefined, c: () => 1, d: NaN, e: [1, undefined] } as never;
    expect(detalleParaApi(1, detalle)).toEqual({ a: 1, d: null, e: [1, null], precision: 1 });
  });

  it('un detalle de más de 4 KB (que la API rechazaría con 422) se sustituye por un resumen', () => {
    const grande = { ids: Array.from({ length: 400 }, (_, i) => `identificador_largo_${i}`) };
    expect(new TextEncoder().encode(JSON.stringify(grande)).length).toBeGreaterThan(
      API_DETALLE_MAX_BYTES,
    );
    expect(detalleParaApi(0.75, grande)).toEqual({ precision: 0.75, truncado: true });
  });

  it('el límite se mide en bytes UTF-8 igual que el backend, no en caracteres', () => {
    // "ñ" pesa 2 bytes: 2100 caracteres son 4200 bytes (> 4096) aunque 2100 < 4096.
    const conTildes = { texto: 'ñ'.repeat(2100) };
    expect(detalleParaApi(1, conTildes)).toEqual({ precision: 1, truncado: true });
  });

  it('el límite es exacto: 4096 bytes pasan y 4097 no', () => {
    const base = JSON.stringify({ x: '', precision: 1 }).length;
    const justo = { x: 'a'.repeat(API_DETALLE_MAX_BYTES - base) };
    const completo = detalleParaApi(1, justo);
    expect(new TextEncoder().encode(JSON.stringify(completo)).length).toBe(API_DETALLE_MAX_BYTES);
    expect(completo.truncado).toBeUndefined();
    expect(detalleParaApi(1, { x: 'a'.repeat(API_DETALLE_MAX_BYTES - base + 1) }).truncado).toBe(
      true,
    );
  });

  it('un detalle con referencias circulares no rompe el envío', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.yo = circular;
    expect(detalleParaApi(1, circular as never)).toEqual({ precision: 1, truncado: true });
  });

  it('el detalle de 12 capas o 20 preguntas cabe de sobra', () => {
    const preguntas = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`m3_pregunta_${i}`, 0.67]),
    );
    expect(detalleParaApi(1, { preguntas }).truncado).toBeUndefined();
    const errores = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`capa_estructura_${i}`, 3]),
    );
    expect(
      detalleParaApi(1, { modo: 'identificar', errores_por_capa: errores }).truncado,
    ).toBeUndefined();
  });
});

describe('interacciones', () => {
  it('describirInteraccion: accion[:objeto][:resultado]', () => {
    expect(describirInteraccion({ accion: 'selecciona_capa', objeto: 'capa_periostio' })).toBe(
      'selecciona_capa:capa_periostio',
    );
    expect(
      describirInteraccion({
        accion: 'responde_pregunta',
        objeto: 'm1_p3',
        resultado: 'incorrecta',
      }),
    ).toBe('responde_pregunta:m1_p3:incorrecta');
    expect(describirInteraccion({ accion: 'reinicia_actividad' })).toBe('reinicia_actividad');
    expect(describirInteraccion({ accion: 'acopla_molecula', resultado: 'correcta' })).toBe(
      'acopla_molecula:correcta',
    );
  });

  it('nunca pasa de 64 caracteres: recorta el objeto, no la acción ni el resultado', () => {
    for (const accion of ACCIONES_INTERACCION) {
      for (const resultado of [undefined, 'correcta', 'incorrecta'] as const) {
        const texto = describirInteraccion({ accion, objeto: 'x'.repeat(200), resultado });
        expect([...texto].length, texto).toBeLessThanOrEqual(64);
        expect(texto.startsWith(accion)).toBe(true);
        if (resultado) expect(texto.endsWith(`:${resultado}`)).toBe(true);
      }
    }
    // Con un objeto de 64 caracteres exactos y una acción larga, el objeto se recorta.
    const texto = describirInteraccion({
      accion: 'responde_pregunta',
      objeto: 'o'.repeat(64),
      resultado: 'incorrecta',
    });
    expect(texto).toBe(
      `responde_pregunta:${'o'.repeat(64 - 'responde_pregunta'.length - ':incorrecta'.length - 1)}:incorrecta`,
    );
    expect([...texto].length).toBe(64);
  });

  it('cuenta caracteres, no unidades UTF-16 (no parte un emoji ni una tilde)', () => {
    const texto = describirInteraccion({ accion: 'selecciona_nodo', objeto: 'ñ'.repeat(80) });
    expect([...texto].length).toBe(64);
    expect(texto).not.toContain('\uFFFD');
  });

  it('seleccionDeInteraccion: capas y nodos fijan la estructura; moléculas, la molécula', () => {
    const sel = (i: InteraccionActividad) => seleccionDeInteraccion(i);
    expect(sel({ accion: 'selecciona_capa', objeto: 'capa_a' })).toEqual({ estructura: 'capa_a' });
    expect(sel({ accion: 'identifica_capa', objeto: 'capa_a', resultado: 'incorrecta' })).toEqual({
      estructura: 'capa_a',
    });
    expect(sel({ accion: 'selecciona_nodo', objeto: 'condilo' })).toEqual({
      estructura: 'condilo',
    });
    expect(sel({ accion: 'arrastra_molecula', objeto: 'mol_rankl' })).toEqual({
      molecula: 'mol_rankl',
    });
    expect(sel({ accion: 'acopla_molecula', objeto: 'mol_rankl', resultado: 'correcta' })).toEqual({
      molecula: 'mol_rankl',
    });
    expect(sel({ accion: 'responde_pregunta', objeto: 'p1' })).toBeNull();
    expect(sel({ accion: 'avanza_paso', objeto: 'paso_1' })).toBeNull();
    expect(sel({ accion: 'selecciona_capa' })).toBeNull();
  });

  it('el vocabulario de acciones es cerrado, sin repetidos y en snake_case', () => {
    expect(new Set(ACCIONES_INTERACCION).size).toBe(ACCIONES_INTERACCION.length);
    for (const accion of ACCIONES_INTERACCION) expect(accion).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });
});

describe('intentoInicial', () => {
  it('sin estado previo es el intento 1', () => {
    expect(intentoInicial(undefined)).toBe(1);
    expect(intentoInicial({})).toBe(1);
  });

  it('continúa tras los intentos que el servidor ya registró', () => {
    expect(intentoInicial({ servidor: { puntaje: 40, intentos: 2, completada: true } })).toBe(3);
    expect(intentoInicial({ servidor: { puntaje: 0, intentos: 0, completada: false } })).toBe(1);
    expect(intentoInicial({ servidor: { puntaje: 0, intentos: NaN, completada: false } })).toBe(1);
  });

  it('un intento a medias conserva su número si es posterior a lo que sabe el servidor', () => {
    const progreso = { avance: 0.5, intentos: 4, instantanea: {} };
    expect(
      intentoInicial({ progreso, servidor: { puntaje: 10, intentos: 2, completada: true } }),
    ).toBe(4);
    expect(intentoInicial({ progreso })).toBe(4);
    expect(intentoInicial({ progreso: { ...progreso, intentos: 0 } })).toBe(1);
    expect(intentoInicial({ progreso: { ...progreso, intentos: NaN } })).toBe(1);
  });

  it('una instantánea local vieja no esquiva la penalización: manda el servidor si registra más', () => {
    const vieja = { avance: 0.2, intentos: 1, instantanea: {} };
    expect(
      intentoInicial({ progreso: vieja, servidor: { puntaje: 10, intentos: 3, completada: true } }),
    ).toBe(4);
    // El intento 2 se completó en otro dispositivo: el siguiente es el 3.
    const dos = { avance: 0.2, intentos: 2, instantanea: {} };
    expect(
      intentoInicial({ progreso: dos, servidor: { puntaje: 10, intentos: 2, completada: true } }),
    ).toBe(3);
    // El intento 2 está a medias y el servidor solo conoce el 1: sigue siendo el 2.
    expect(
      intentoInicial({ progreso: dos, servidor: { puntaje: 10, intentos: 1, completada: true } }),
    ).toBe(2);
  });
});

describe('esProgresoTardio', () => {
  it('descarta un progreso de un intento que ya se completó', () => {
    expect(esProgresoTardio({ intentos: 2 }, 2)).toBe(true);
    expect(esProgresoTardio({ intentos: 1 }, 2)).toBe(true);
    expect(esProgresoTardio({ intentos: 3 }, 2)).toBe(false);
    expect(esProgresoTardio({ intentos: 1 }, undefined)).toBe(false);
  });
});

describe('problemasDeEmisiones', () => {
  const actividad = { id: quiz.id, tipo: quiz.tipo, puntaje_max: quiz.puntaje_max };
  const bien: EventosEmitidos = {
    progreso: [[{ avance: 0.4, intentos: 1, instantanea: { respondidas: ['qr_p1'] } }]],
    interaccion: [[{ accion: 'responde_pregunta', objeto: 'qr_p1', resultado: 'correcta' }]],
    completada: [[resultado({ puntaje: 45, intentos: 1, precision: 0.9 })]],
  };

  it('no encuentra nada en emisiones correctas ni cuando no se emitió nada', () => {
    expect(problemasDeEmisiones(bien, actividad)).toEqual([]);
    expect(problemasDeEmisiones({}, actividad)).toEqual([]);
  });

  it.each<[string, EventosEmitidos, string]>([
    ['puntaje mayor que el máximo', { completada: [[resultado({ puntaje: 51 })]] }, '"puntaje"'],
    ['puntaje negativo', { completada: [[resultado({ puntaje: -1 })]] }, '"puntaje"'],
    ['puntaje decimal', { completada: [[resultado({ puntaje: 12.5 })]] }, '"puntaje"'],
    ['intentos cero', { completada: [[resultado({ intentos: 0 })]] }, '"intentos"'],
    ['precisión mayor que 1', { completada: [[resultado({ precision: 1.2 })]] }, '"precision"'],
    [
      'precisión ausente',
      { completada: [[{ puntaje: 1, intentos: 1, detalle: {} }]] },
      '"precision"',
    ],
    ['detalle ausente', { completada: [[{ puntaje: 1, intentos: 1, precision: 1 }]] }, '"detalle"'],
    ['completada dos veces', { completada: [[resultado()], [resultado()]] }, '2 veces'],
    ['payload que no es un objeto', { completada: [['listo']] }, 'ResultadoActividad'],
    [
      'detalle de más de 4 KB',
      { completada: [[resultado({ detalle: { x: 'y'.repeat(5000) } as never })]] },
      '4 KB',
    ],
    ['acción fuera del vocabulario', { interaccion: [[{ accion: 'toca' }]] }, 'vocabulario'],
    [
      'objeto que no es texto',
      { interaccion: [[{ accion: 'selecciona_capa', objeto: 7 }]] },
      '"objeto"',
    ],
    [
      'resultado inválido',
      { interaccion: [[{ accion: 'acopla_molecula', resultado: 'bien' }]] },
      '"resultado"',
    ],
    [
      'avance mayor que 1',
      { progreso: [[{ avance: 2, intentos: 1, instantanea: {} }]] },
      '"avance"',
    ],
    [
      'avance negativo',
      { progreso: [[{ avance: -0.1, intentos: 1, instantanea: {} }]] },
      '"avance"',
    ],
    ['progreso sin intentos', { progreso: [[{ avance: 0.5, instantanea: {} }]] }, '"intentos"'],
    [
      'instantánea que no es un objeto',
      { progreso: [[{ avance: 0.5, intentos: 1, instantanea: 'x' }]] },
      '"instantanea"',
    ],
    [
      'instantánea de más de 8 KB',
      { progreso: [[{ avance: 0.5, intentos: 1, instantanea: { x: 'z'.repeat(9000) } }]] },
      '8192',
    ],
  ])('detecta %s', (_nombre, eventos, fragmento) => {
    const problemas = problemasDeEmisiones(eventos, actividad);
    expect(problemas.length, 'debía detectar el problema').toBeGreaterThan(0);
    expect(
      problemas.some((p) => p.includes(fragmento)),
      problemas.join(' | '),
    ).toBe(true);
  });
});

describe('el compilador de Vue resuelve las props y los eventos importados del contrato', () => {
  it('ActividadContrato declara las props y los emits de PropsActividadQuiz y EmitsActividadQuiz', () => {
    const wrapper = mount(ActividadContrato, { props: { actividad: quiz, modulo: 1 } });
    const opciones = wrapper.vm.$options as { props?: Record<string, unknown>; emits?: string[] };
    expect(Object.keys(opciones.props ?? {}).sort()).toEqual([
      'actividad',
      'estadoPrevio',
      'modo',
      'modulo',
    ]);
    expect([...(opciones.emits ?? [])].sort()).toEqual(['completada', 'interaccion', 'progreso']);
    expect(wrapper.props('modo')).toBe('jugar'); // valor por defecto
    expect(wrapper.text()).toContain(quiz.titulo);
    wrapper.unmount();
  });

  it('respeta el tipo de EmitsActividadQuiz en TypeScript', () => {
    expectTypeOf<EmitsActividadQuiz>().toBeCallableWith('completada', {
      puntaje: 1,
      intentos: 1,
      precision: 1,
      detalle: { preguntas: {} },
    });
  });
});

// El componente de referencia pasa TODA la batería de conformidad que deben pasar los seis reales.
pruebasDeContratoActividad<'quiz'>({
  nombre: 'ActividadContrato (quiz de referencia)',
  actividad: quiz,
  montar: (props) => mount(ActividadContrato, { props }) as unknown as VueWrapper,
  completar: async (wrapper) => {
    const vm = wrapper.vm as unknown as {
      responder: (id: string, respuesta: unknown) => void;
      terminar: () => void;
    };
    vm.responder('qr_p1', { formato: 'opcion_multiple', seleccion: ['qr_p1_b'] });
    vm.responder('qr_p2', { formato: 'opcion_multiple', seleccion: ['qr_p2_a', 'qr_p2_b'] });
    vm.responder('qr_p3', { formato: 'verdadero_falso', valor: false });
    await wrapper.find('[data-test="terminar"]').trigger('click');
  },
});

describe('flujo completo: del componente al cuerpo de la API', () => {
  it('quiz con 3 de 5 a la segunda vez: puntaje, intentos y cuerpo cuadran', async () => {
    const wrapper = mount(ActividadContrato, {
      props: {
        actividad: quiz,
        modulo: 1,
        estadoPrevio: { servidor: { puntaje: 20, intentos: 1, completada: true } },
      },
    });
    const vm = wrapper.vm as unknown as { responder: (id: string, r: unknown) => void };
    vm.responder('qr_p1', { formato: 'opcion_multiple', seleccion: ['qr_p1_b'] });
    vm.responder('qr_p2', { formato: 'opcion_multiple', seleccion: ['qr_p2_a', 'qr_p2_b'] });
    vm.responder('qr_p3', { formato: 'verdadero_falso', valor: false });
    await wrapper.find('[data-test="terminar"]').trigger('click');

    const r = wrapper.emitted('completada')![0]![0] as ResultadoActividad<'quiz'>;
    expect(r.intentos).toBe(2);
    expect(r.precision).toBeCloseTo(0.6, 10);
    expect(r.puntaje).toBe(27); // 50 x 0,6 x 0,9
    const { ruta, cuerpo } = aPeticionResultadoApi(quiz, 1, r);
    expect(ruta).toBe('/activities/m1_quiz_repaso/result');
    expect(CuerpoBackend.safeParse(cuerpo).success).toBe(true);
    expect(cuerpo).toMatchObject({
      modulo: 1,
      tipo: 'quiz',
      puntaje: 27,
      intentos: 2,
      completada: true,
    });
    expect(cuerpo.detalle).toMatchObject({
      precision: 0.6,
      preguntas: { qr_p1: 1, qr_p4: 0, qr_p5: 0 },
    });
    wrapper.unmount();
  });
});
