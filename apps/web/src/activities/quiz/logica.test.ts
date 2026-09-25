/**
 * Pruebas de la lógica pura del quiz: azar determinista, barajado que nunca regala el orden
 * correcto, depuración de preguntas hostiles e instantánea (ida y vuelta y entradas corruptas).
 */
import { describe, expect, it } from 'vitest';
import { INSTANTANEA_MAX_BYTES } from '@/activities/types';
import type { Pregunta } from '@/content/schema';
import type { RespuestaPregunta } from '@/content/scoring';
import {
  armarInstantanea,
  barajar,
  codificarRespuesta,
  crearAzar,
  decodificarRespuesta,
  depurarPreguntas,
  derivarSemilla,
  instantaneaVigente,
  leerInstantanea,
  ordenNoCorrecto,
  posicionDeReanudacion,
  presentarQuiz,
  respuestaCorrecta,
  veredictoDe,
} from './logica';

const opcion = (id: string, texto = id) => ({ id, texto });
const om = (id: string, correctas: string[], ids = ['a', 'b', 'c']): Pregunta => ({
  id,
  formato: 'opcion_multiple',
  enunciado: `Enunciado de ${id}`,
  opciones: ids.map((i) => opcion(i)),
  correctas,
  explicacion: `Explicación de ${id}`,
});
const vf = (id: string, correcta: boolean): Pregunta => ({
  id,
  formato: 'verdadero_falso',
  enunciado: `Enunciado de ${id}`,
  correcta,
  explicacion: `Explicación de ${id}`,
});
const ord = (id: string, n: number): Pregunta => ({
  id,
  formato: 'ordenar',
  enunciado: `Enunciado de ${id}`,
  pasos: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, texto: `Paso ${i}` })),
  explicacion: `Explicación de ${id}`,
});

describe('azar determinista', () => {
  it('la misma semilla da la misma secuencia; otra semilla, otra', () => {
    const a = crearAzar(42);
    const b = crearAzar(42);
    const c = crearAzar(43);
    const sa = Array.from({ length: 10 }, () => a());
    expect(Array.from({ length: 10 }, () => b())).toEqual(sa);
    expect(Array.from({ length: 10 }, () => c())).not.toEqual(sa);
    for (const v of sa) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('acepta semillas extremas (0, 2^32-1) sin salirse de [0, 1)', () => {
    for (const semilla of [0, 1, 2 ** 32 - 1]) {
      const azar = crearAzar(semilla);
      for (let i = 0; i < 100; i++) {
        const v = azar();
        expect(v >= 0 && v < 1).toBe(true);
      }
    }
  });

  it('barajar devuelve una permutación y no toca el original', () => {
    const original = [1, 2, 3, 4, 5, 6, 7];
    const copia = [...original];
    const mezclado = barajar(original, crearAzar(7));
    expect(original).toEqual(copia);
    expect([...mezclado].sort()).toEqual(copia);
  });

  it('barajar con un azar que devuelve exactamente 1 (fuera de contrato) no rompe', () => {
    expect([...barajar([1, 2, 3], () => 1)].sort()).toEqual([1, 2, 3]);
  });

  it('derivarSemilla: distinta sal, distinta semilla; siempre entero de 32 bits', () => {
    const vistos = new Set(Array.from({ length: 50 }, (_, sal) => derivarSemilla(1234, sal)));
    expect(vistos.size).toBe(50);
    for (const v of vistos) {
      expect(Number.isInteger(v) && v >= 0 && v < 2 ** 32).toBe(true);
    }
  });
});

describe('ordenNoCorrecto: nunca deja el orden correcto', () => {
  it.each([2, 3, 4, 5, 6, 7])('con %i pasos, en 600 semillas ninguna da la identidad', (n) => {
    for (let semilla = 0; semilla < 600; semilla++) {
      const orden = ordenNoCorrecto(n, crearAzar(semilla));
      expect(
        orden.some((v, i) => v !== i),
        `n=${n} semilla=${semilla}`,
      ).toBe(true);
      expect([...orden].sort((x, y) => x - y)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });

  it('aunque el azar sea el peor posible (siempre produce la identidad), rota una posición', () => {
    // Un azar que devuelve siempre 0.999 deja el arreglo como estaba (identidad).
    const orden = ordenNoCorrecto(4, () => 0.999999);
    expect(orden).not.toEqual([0, 1, 2, 3]);
    expect([...orden].sort()).toEqual([0, 1, 2, 3]);
  });

  it('con 1 paso o 0 no hay otra permutación', () => {
    expect(ordenNoCorrecto(1, crearAzar(1))).toEqual([0]);
    expect(ordenNoCorrecto(0, crearAzar(1))).toEqual([]);
  });
});

describe('depurarPreguntas', () => {
  it('conserva las válidas en su orden y descarta ids repetidos', () => {
    const lista = [om('p1', ['a']), vf('p2', true), om('p1', ['b']), ord('p3', 3)];
    expect(depurarPreguntas(lista).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('una lista que no es lista, o basura, da una lista vacía', () => {
    for (const malo of [undefined, null, 7, 'x', {}, [null], [7], ['x'], [[]], [{}]]) {
      expect(depurarPreguntas(malo)).toEqual([]);
    }
  });

  it('descarta preguntas con forma inservible', () => {
    const malas: unknown[] = [
      { ...vf('a', true), correcta: 'true' },
      { ...vf('a', true), enunciado: '' },
      { ...vf('a', true), explicacion: undefined },
      { ...vf('a', true), id: '' },
      { ...vf('a', true), formato: 'abierta' },
      { ...om('a', ['a']), opciones: [] },
      { ...om('a', ['a']), correctas: [] },
      { ...om('a', ['z']) }, // la correcta no existe en las opciones
      { ...om('a', ['a']), opciones: [opcion('a'), opcion('a')] }, // opciones repetidas
      { ...om('a', ['a']), opciones: [opcion('a'), { id: 'b' }] }, // sin texto
      { ...ord('a', 3), pasos: [] },
      {
        ...ord('a', 3),
        pasos: [
          { id: 'x', texto: 'a' },
          { id: 'x', texto: 'b' },
        ],
      },
      { ...ord('a', 3), pasos: 'no' },
    ];
    for (const m of malas) expect(depurarPreguntas([m]), JSON.stringify(m)).toEqual([]);
  });

  it('admite lo límite: una sola opción, un solo paso', () => {
    expect(depurarPreguntas([om('a', ['a'], ['a'])])).toHaveLength(1);
    expect(depurarPreguntas([ord('a', 1)])).toHaveLength(1);
  });
});

describe('presentarQuiz', () => {
  const preguntas = [
    om('p1', ['a'], ['a', 'b', 'c', 'd', 'e', 'f']),
    vf('p2', false),
    ord('p3', 4),
  ];

  it('es determinista según la semilla', () => {
    const opciones = { barajarPreguntas: true, barajarOpciones: true };
    expect(presentarQuiz(preguntas, 99, opciones)).toEqual(presentarQuiz(preguntas, 99, opciones));
  });

  it('sin barajar, conserva el orden del contenido (los pasos, en cambio, siempre se barajan)', () => {
    const p = presentarQuiz(preguntas, 5, { barajarPreguntas: false, barajarOpciones: false });
    expect(p.map((x) => x.pregunta.id)).toEqual(['p1', 'p2', 'p3']);
    expect(p[0]!.ordenOpciones).toEqual([0, 1, 2, 3, 4, 5]);
    expect(p[2]!.ordenPasos).not.toEqual([0, 1, 2, 3]);
  });

  it('barajar_preguntas y barajar_opciones producen permutaciones para alguna semilla', () => {
    const ordenes = new Set<string>();
    const opcionesVistas = new Set<string>();
    for (let semilla = 0; semilla < 40; semilla++) {
      const p = presentarQuiz(preguntas, semilla, {
        barajarPreguntas: true,
        barajarOpciones: true,
      });
      ordenes.add(p.map((x) => x.indice).join());
      opcionesVistas.add(p.find((x) => x.indice === 0)!.ordenOpciones.join());
      expect(p.map((x) => x.indice).sort()).toEqual([0, 1, 2]);
    }
    expect(ordenes.size).toBeGreaterThan(1);
    expect(opcionesVistas.size).toBeGreaterThan(1);
  });

  it('el orden de los pasos nunca es el correcto, en 300 semillas y con 2 a 7 pasos', () => {
    for (let n = 2; n <= 7; n++) {
      for (let semilla = 0; semilla < 300; semilla++) {
        const [p] = presentarQuiz([ord('o', n)], semilla, {
          barajarPreguntas: false,
          barajarOpciones: true,
        });
        expect(
          p!.ordenPasos.some((v, i) => v !== i),
          `n=${n} semilla=${semilla}`,
        ).toBe(true);
      }
    }
  });
});

describe('veredictoDe', () => {
  it('correcta solo con 1; incorrecta solo con 0', () => {
    expect(veredictoDe(1)).toBe('correcta');
    expect(veredictoDe(0.9999999999)).toBe('correcta'); // ruido de coma flotante
    expect(veredictoDe(0.5)).toBe('parcial');
    expect(veredictoDe(0.01)).toBe('parcial');
    expect(veredictoDe(0)).toBe('incorrecta');
    expect(veredictoDe(-0)).toBe('incorrecta');
  });
});

describe('respuestaCorrecta y la codificación de respuestas', () => {
  const preguntas = [om('p1', ['b', 'c'], ['a', 'b', 'c', 'd']), vf('p2', false), ord('p3', 4)];

  it('respuestaCorrecta puntúa 1 en las tres formas', () => {
    expect(respuestaCorrecta(preguntas[0]!)).toEqual({
      formato: 'opcion_multiple',
      seleccion: ['b', 'c'],
    });
    expect(respuestaCorrecta(preguntas[1]!)).toEqual({ formato: 'verdadero_falso', valor: false });
    expect(respuestaCorrecta(preguntas[2]!)).toEqual({
      formato: 'ordenar',
      orden: ['p0', 'p1', 'p2', 'p3'],
    });
  });

  it('ida y vuelta: codificar y decodificar devuelve la misma respuesta', () => {
    const respuestas: RespuestaPregunta[] = [
      { formato: 'opcion_multiple', seleccion: ['c', 'a'] },
      { formato: 'verdadero_falso', valor: true },
      { formato: 'ordenar', orden: ['p3', 'p1', 'p0', 'p2'] },
    ];
    respuestas.forEach((r, i) => {
      const codificada = codificarRespuesta(preguntas[i]!, r);
      expect(codificada).not.toBeNull();
      const vuelta = decodificarRespuesta(preguntas[i]!, JSON.parse(JSON.stringify(codificada)));
      if (r.formato === 'opcion_multiple') {
        expect(vuelta).toEqual({ formato: 'opcion_multiple', seleccion: ['a', 'c'] }); // por orden de opción
      } else {
        expect(vuelta).toEqual(r);
      }
    });
  });

  it('una respuesta de otro formato o con ids desconocidos no se codifica', () => {
    expect(
      codificarRespuesta(preguntas[0]!, { formato: 'verdadero_falso', valor: true }),
    ).toBeNull();
    expect(
      codificarRespuesta(preguntas[2]!, { formato: 'ordenar', orden: ['x', 'y', 'z', 'w'] }),
    ).toBeNull();
  });

  it.each<[number, unknown]>([
    [0, 'a'],
    [0, [9]],
    [0, [-1]],
    [0, [1.5]],
    [0, [0, 0]],
    [0, [null]],
    [1, 1],
    [1, 'true'],
    [1, null],
    [2, [0, 1, 2]], // faltan pasos
    [2, [0, 1, 2, 2]], // repetido
    [2, [0, 1, 2, 9]],
    [2, 'orden'],
  ])('decodificar rechaza el valor inválido (pregunta %i: %j)', (i, valor) => {
    expect(decodificarRespuesta(preguntas[i]!, valor)).toBeUndefined();
  });
});

describe('instantánea', () => {
  const preguntas = [om('p1', ['b'], ['a', 'b', 'c']), vf('p2', true), ord('p3', 5)];
  const respuestas: (RespuestaPregunta | null)[] = [
    { formato: 'opcion_multiple', seleccion: ['b'] },
    null,
    { formato: 'ordenar', orden: ['p4', 'p3', 'p2', 'p1', 'p0'] },
  ];

  it('ida y vuelta con huecos (null) y con la semilla', () => {
    const instantanea = armarInstantanea(preguntas, respuestas, 123456);
    expect(instantanea).toEqual({ v: 1, semilla: 123456, r: [[1], null, [4, 3, 2, 1, 0]] });
    const leida = leerInstantanea(preguntas, JSON.parse(JSON.stringify(instantanea)));
    expect(leida).toEqual({ semilla: 123456, respuestas });
  });

  it('es diminuta: 20 preguntas de 7 pasos con ids de 64 caracteres caben en 8 KB con holgura', () => {
    const grandes = Array.from({ length: 20 }, (_, i) => ({
      ...ord(`${'q'.repeat(60)}${i}`, 7),
      pasos: Array.from({ length: 7 }, (_, k) => ({ id: `${'p'.repeat(60)}${k}`, texto: `t${k}` })),
    })) as Pregunta[];
    const resp = grandes.map((p) => ({
      formato: 'ordenar' as const,
      orden: (p.formato === 'ordenar' ? p.pasos : []).map((paso) => paso.id).reverse(),
    }));
    const bytes = new TextEncoder().encode(
      JSON.stringify(armarInstantanea(grandes, resp, 2 ** 32 - 1)),
    ).length;
    expect(bytes).toBeLessThan(INSTANTANEA_MAX_BYTES / 8);
  });

  it.each<[string, unknown]>([
    ['no es un objeto', 'x'],
    ['es null', null],
    ['es una lista', []],
    ['versión desconocida', { v: 2, semilla: 1, r: [null, null, null] }],
    ['sin versión', { semilla: 1, r: [null, null, null] }],
    ['semilla negativa', { v: 1, semilla: -1, r: [null, null, null] }],
    ['semilla decimal', { v: 1, semilla: 1.5, r: [null, null, null] }],
    ['semilla gigante', { v: 1, semilla: 2 ** 32, r: [null, null, null] }],
    ['semilla NaN', { v: 1, semilla: NaN, r: [null, null, null] }],
    ['semilla texto', { v: 1, semilla: '7', r: [null, null, null] }],
    ['respuestas null', { v: 1, semilla: 1, r: null }],
    [
      'menos respuestas que preguntas (otra versión del contenido)',
      { v: 1, semilla: 1, r: [null] },
    ],
    ['más respuestas que preguntas', { v: 1, semilla: 1, r: [null, null, null, null] }],
    [
      'una respuesta inválida invalida TODA la instantánea',
      { v: 1, semilla: 1, r: [[9], null, null] },
    ],
    ['orden con repetidos', { v: 1, semilla: 1, r: [null, null, [0, 0, 1, 2, 3]] }],
    ['formato equivocado', { v: 1, semilla: 1, r: [true, null, null] }],
  ])('se ignora entera si %s', (_nombre, valor) => {
    expect(leerInstantanea(preguntas, valor)).toBeNull();
  });

  it('un objeto inesperado (el de la batería de conformidad) se ignora', () => {
    expect(
      leerInstantanea(preguntas, {
        id_que_no_existe: 'x',
        visitadas: ['fantasma'],
        orden: [9, 9, 9],
        respuestas: null,
      }),
    ).toBeNull();
  });
});

describe('instantaneaVigente', () => {
  const progreso = (intentos: number) => ({ avance: 0.4, intentos, instantanea: {} });

  it('sin instantánea no hay nada vigente', () => {
    expect(instantaneaVigente(undefined)).toBe(false);
    expect(instantaneaVigente({})).toBe(false);
  });

  it('vigente si es posterior a lo que el servidor cuenta como terminado', () => {
    expect(instantaneaVigente({ progreso: progreso(1) })).toBe(true);
    expect(
      instantaneaVigente({
        progreso: progreso(2),
        servidor: { puntaje: 5, intentos: 1, completada: true },
      }),
    ).toBe(true);
  });

  it('vieja si el servidor ya registra ese intento (se completó en otro dispositivo)', () => {
    expect(
      instantaneaVigente({
        progreso: progreso(2),
        servidor: { puntaje: 5, intentos: 2, completada: true },
      }),
    ).toBe(false);
    expect(
      instantaneaVigente({
        progreso: progreso(1),
        servidor: { puntaje: 5, intentos: 3, completada: true },
      }),
    ).toBe(false);
  });

  it('intentos que no son números no dan una instantánea vigente', () => {
    expect(instantaneaVigente({ progreso: progreso(NaN) })).toBe(false);
    expect(instantaneaVigente({ progreso: { ...progreso(1), intentos: undefined as never } })).toBe(
      false,
    );
  });
});

describe('posicionDeReanudacion', () => {
  const preguntas = [vf('a', true), vf('b', true), vf('c', true)];
  const presentadas = presentarQuiz(preguntas, 1, {
    barajarPreguntas: false,
    barajarOpciones: false,
  });
  const r: RespuestaPregunta = { formato: 'verdadero_falso', valor: true };

  it('la primera sin responder, o la última si todas están respondidas', () => {
    expect(posicionDeReanudacion(presentadas, [null, null, null])).toBe(0);
    expect(posicionDeReanudacion(presentadas, [r, null, null])).toBe(1);
    expect(posicionDeReanudacion(presentadas, [r, r, null])).toBe(2);
    expect(posicionDeReanudacion(presentadas, [r, r, r])).toBe(2);
    expect(posicionDeReanudacion([], [])).toBe(0);
  });

  it('con preguntas barajadas cuenta en el orden presentado, no en el del contenido', () => {
    const barajadas = presentarQuiz(preguntas, 3, {
      barajarPreguntas: true,
      barajarOpciones: false,
    });
    const primera = barajadas[0]!.indice;
    const respuestas: (RespuestaPregunta | null)[] = [null, null, null];
    respuestas[primera] = r;
    expect(posicionDeReanudacion(barajadas, respuestas)).toBe(1);
  });
});
