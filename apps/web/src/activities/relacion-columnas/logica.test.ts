import { describe, expect, it } from 'vitest';
import { ActividadRelacionColumnasSchema } from '@/content/schema';
import {
  analizarConfig,
  construirDetalle,
  crearAzar,
  crearInstantanea,
  derivarSemilla,
  evaluarPar,
  hashTexto,
  leerInstantanea,
  ordenarColumnaB,
  regalaLaRespuesta,
  romperOrdenDeA,
  totalErrores,
} from './logica';
import type { AnalisisValido } from './logica';
import { actividadDeMuestra, clonar, crearActividad } from './utilesPrueba';

function analizar(opciones: Parameters<typeof crearActividad>[0] = {}): AnalisisValido {
  const a = analizarConfig(crearActividad(opciones).config);
  if (!a.ok) throw new Error(a.motivo);
  return a;
}

describe('hash y azar deterministas', () => {
  it('hashTexto es estable y distingue textos', () => {
    expect(hashTexto('m1_relacion#1')).toBe(hashTexto('m1_relacion#1'));
    expect(hashTexto('a')).not.toBe(hashTexto('b'));
    expect(hashTexto('')).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hashTexto('ñandú 🦴'))).toBe(true);
  });

  it('crearAzar repite la secuencia con la misma semilla y queda en [0, 1)', () => {
    const x = crearAzar(42);
    const y = crearAzar(42);
    for (let i = 0; i < 50; i++) {
      const v = x();
      expect(v).toBe(y());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(crearAzar(1)()).not.toBe(crearAzar(2)());
  });

  it('derivarSemilla depende del id y del intento, y sanea intentos absurdos', () => {
    expect(derivarSemilla('m1_x', 1)).toBe(derivarSemilla('m1_x', 1));
    expect(derivarSemilla('m1_x', 1)).not.toBe(derivarSemilla('m1_x', 2));
    expect(derivarSemilla('m1_x', 1)).not.toBe(derivarSemilla('m1_y', 1));
    expect(derivarSemilla('m1_x', 0)).toBe(derivarSemilla('m1_x', 1));
    expect(derivarSemilla('m1_x', NaN)).toBe(derivarSemilla('m1_x', 1));
    expect(derivarSemilla('m1_x', 2.9)).toBe(derivarSemilla('m1_x', 2));
  });
});

describe('analizarConfig', () => {
  it('acepta la actividad de muestra y las dimensiones máximas del esquema', () => {
    expect(analizarConfig(actividadDeMuestra().config).ok).toBe(true);
    const grande = crearActividad({ pares: 8, distractores: 3 });
    expect(ActividadRelacionColumnasSchema.safeParse(grande).success).toBe(true);
    const a = analizarConfig(grande.config);
    expect(a.ok && a.a.length).toBe(8);
    expect(a.ok && a.b.length).toBe(11);
  });

  it('acepta una sola pareja (más pequeño que el esquema) sin romperse', () => {
    expect(analizarConfig(crearActividad({ pares: 1, distractores: 0 }).config).ok).toBe(true);
  });

  it.each<[string, (config: any) => void, string]>([
    ['sin pares', (c) => (c.pares = []), 'ningún par'],
    ['pares que no es lista', (c) => (c.pares = 'x'), 'ningún par'],
    ['sin columna A', (c) => delete c.columna_a, 'columna A'],
    ['columna B vacía', (c) => (c.columna_b.elementos = []), 'columna B'],
    ['elemento sin texto', (c) => delete c.columna_a.elementos[0].texto, 'sin id o sin texto'],
    ['elemento con id vacío', (c) => (c.columna_a.elementos[0].id = ''), 'sin id o sin texto'],
    [
      'id repetido en A',
      (c) => (c.columna_a.elementos[1].id = c.columna_a.elementos[0].id),
      'repite',
    ],
    ['par hacia A inexistente', (c) => (c.pares[0].a = 'no_existe'), 'columna A'],
    ['par hacia B inexistente', (c) => (c.pares[0].b = 'no_existe'), 'columna B'],
    ['elemento de B en dos pares', (c) => (c.pares[1].b = c.pares[0].b), 'reutiliza'],
    ['elemento de A en dos pares', (c) => (c.pares[1].a = c.pares[0].a), 'reutiliza'],
    ['par repetido', (c) => (c.pares[1].id = c.pares[0].id), 'repetido'],
    ['par sin explicación', (c) => delete c.pares[0].explicacion, 'explicación'],
    [
      'elemento de A sin par',
      (c) => c.columna_a.elementos.push({ id: 'extra', texto: 'Extra' }),
      'no tiene pareja',
    ],
  ])('rechaza: %s', (_nombre, romper, fragmento) => {
    const config = clonar(crearActividad().config) as any;
    romper(config);
    const resultado = analizarConfig(config);
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.motivo).toContain(fragmento);
  });

  it.each([undefined, null, 5, 'texto', []])('rechaza una config que es %j', (basura) => {
    expect(analizarConfig(basura).ok).toBe(false);
  });

  it('`barajar` ausente cuenta como verdadero y solo `false` lo apaga', () => {
    const config = clonar(crearActividad().config) as any;
    delete config.barajar;
    expect((analizarConfig(config) as AnalisisValido).barajar).toBe(true);
    config.barajar = false;
    expect((analizarConfig(config) as AnalisisValido).barajar).toBe(false);
  });

  it('la firma cambia si cambia el emparejamiento y no si cambian los textos', () => {
    const base = analizar();
    expect(analizar().firma).toBe(base.firma);
    const otra = clonar(crearActividad().config) as any;
    [otra.pares[0].b, otra.pares[1].b] = [otra.pares[1].b, otra.pares[0].b];
    expect((analizarConfig(otra) as AnalisisValido).firma).not.toBe(base.firma);
    const otroTexto = analizar({ texto: () => 'otro texto' });
    expect(otroTexto.firma).toBe(base.firma);
  });

  it('ids como constructor, toString o hasOwnProperty no chocan con el prototipo', () => {
    const raros = ['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__'];
    const a = analizar({
      pares: 4,
      distractores: 1,
      idElemento: (col, i) => (i < raros.length ? raros[i]! : `${col}_x`),
    });
    expect(a.parDeA.get('constructor')).toBe(0);
    expect(a.parDeA.get('valueOf')).toBe(3);
    expect(a.parDeB.has('__proto__')).toBe(false); // distractor
    expect(evaluarPar(a, 'valueOf', '__proto__')?.correcto).toBe(false);
    expect(evaluarPar(a, 'toString', 'toString')?.correcto).toBe(true);
    expect(evaluarPar(a, 'toString', 'constructor')?.correcto).toBe(false);
    expect(evaluarPar(a, 'no_existe', 'constructor')).toBeNull();
  });
});

describe('ordenarColumnaB', () => {
  it('con barajar: false conserva el orden del JSON', () => {
    const a = analizar({ barajar: false, pares: 5, distractores: 2 });
    expect(ordenarColumnaB(a, 12345)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('es una permutación de todos los elementos de B, distractores incluidos', () => {
    const a = analizar({ pares: 8, distractores: 3 });
    for (let s = 1; s <= 30; s++) {
      const orden = ordenarColumnaB(a, s);
      expect([...orden].sort((x, y) => x - y)).toEqual(Array.from({ length: 11 }, (_, i) => i));
    }
  });

  it('es estable: la misma semilla da siempre el mismo orden (sin Math.random)', () => {
    const a = analizar({ pares: 6, distractores: 2 });
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random no debe usarse');
    };
    try {
      const semilla = derivarSemilla('m1_relacion_prueba', 1);
      expect(ordenarColumnaB(a, semilla)).toEqual(ordenarColumnaB(a, semilla));
    } finally {
      Math.random = original;
    }
  });

  it('cambia entre intentos (más de un orden distinto en 10 intentos)', () => {
    const a = analizar({ pares: 6, distractores: 2 });
    const ordenes = new Set(
      Array.from({ length: 10 }, (_, i) =>
        ordenarColumnaB(a, derivarSemilla('m1_relacion_prueba', i + 1)).join(','),
      ),
    );
    expect(ordenes.size).toBeGreaterThan(5);
  });

  it('con 3 pares y sin distractores NUNCA deja las parejas en el orden de A (300 semillas)', () => {
    const a = analizar({ pares: 3, distractores: 0 });
    for (let s = 0; s < 300; s++) {
      expect(regalaLaRespuesta(a, ordenarColumnaB(a, s)), `semilla ${s}`).toBe(false);
    }
  });

  it('tampoco con 2 pares ni con distractores intercalados', () => {
    for (const [pares, distractores] of [
      [2, 0],
      [2, 3],
      [4, 1],
      [8, 3],
    ] as const) {
      const a = analizar({ pares, distractores });
      for (let s = 0; s < 100; s++) {
        expect(regalaLaRespuesta(a, ordenarColumnaB(a, s))).toBe(false);
      }
    }
  });

  it('con una sola pareja no hay nada que romper', () => {
    const a = analizar({ pares: 1, distractores: 2 });
    expect(ordenarColumnaB(a, 7)).toHaveLength(3);
  });

  it('regalaLaRespuesta detecta el orden de A y romperOrdenDeA lo arregla', () => {
    const a = analizar({ pares: 3, distractores: 1 });
    expect(regalaLaRespuesta(a, [0, 1, 2, 3])).toBe(true);
    expect(regalaLaRespuesta(a, [0, 3, 1, 2])).toBe(true); // el distractor no cuenta
    expect(regalaLaRespuesta(a, [1, 0, 2, 3])).toBe(false);
    const roto = romperOrdenDeA(a, [0, 1, 2, 3]);
    expect(regalaLaRespuesta(a, roto)).toBe(false);
    expect([...roto].sort()).toEqual([0, 1, 2, 3]);
    expect(romperOrdenDeA(analizar({ pares: 1, distractores: 1 }), [0, 1])).toEqual([0, 1]);
  });
});

describe('evaluarPar', () => {
  const a = analizar({ pares: 3, distractores: 2 });

  it('la pareja correcta acierta y devuelve el índice del par', () => {
    expect(evaluarPar(a, 'ea_2', 'eb_2')).toEqual({ correcto: true, indicePar: 1 });
  });

  it('otra pareja de B falla y atribuye el error al par del elemento de A', () => {
    expect(evaluarPar(a, 'ea_2', 'eb_1')).toEqual({ correcto: false, indicePar: 1 });
  });

  it('un distractor de B nunca es correcto, con ningún elemento de A', () => {
    for (const idA of ['ea_1', 'ea_2', 'ea_3']) {
      for (const distractor of ['eb_4', 'eb_5']) {
        expect(evaluarPar(a, idA, distractor)?.correcto).toBe(false);
      }
    }
  });

  it('un elemento de A desconocido no se evalúa', () => {
    expect(evaluarPar(a, 'eb_1', 'eb_1')).toBeNull();
  });
});

describe('instantánea', () => {
  const a = analizar({ pares: 4, distractores: 1 });

  it('ida y vuelta conserva hechos, errores y semilla', () => {
    const estado = { hechos: [2, 0], errores: [1, 0, 3, 0] };
    const bruto = crearInstantanea(a, estado, 987654);
    expect(JSON.parse(JSON.stringify(bruto))).toEqual(bruto);
    expect(leerInstantanea(a, bruto)).toEqual({ ...estado, semilla: 987654 });
  });

  it('cabe de sobra en 8 KB con 8 pares', () => {
    const grande = analizar({ pares: 8, distractores: 3 });
    const bruto = crearInstantanea(
      grande,
      { hechos: [0, 1, 2, 3, 4, 5, 6], errores: Array(8).fill(999) },
      4294967295,
    );
    expect(new TextEncoder().encode(JSON.stringify(bruto)).length).toBeLessThan(1024);
  });

  const valida = () => crearInstantanea(a, { hechos: [1], errores: [0, 0, 0, 0] }, 5);
  it.each<[string, (i: any) => unknown]>([
    ['no es un objeto', () => 'basura'],
    ['es null', () => null],
    ['es una lista', () => []],
    ['otra firma (contenido distinto)', (i) => ({ ...i, firma: i.firma + 1 })],
    ['sin firma', (i) => ({ ...i, firma: undefined })],
    ['hechos que no es lista', (i) => ({ ...i, hechos: 'x' })],
    ['hechos con un índice fuera de rango', (i) => ({ ...i, hechos: [9] })],
    ['hechos con un índice negativo', (i) => ({ ...i, hechos: [-1] })],
    ['hechos con un índice decimal', (i) => ({ ...i, hechos: [0.5] })],
    ['hechos repetidos', (i) => ({ ...i, hechos: [1, 1] })],
    ['hechos con un texto', (i) => ({ ...i, hechos: ['1'] })],
    ['un intento ya terminado (todos los pares hechos)', (i) => ({ ...i, hechos: [0, 1, 2, 3] })],
    ['errores de otra longitud', (i) => ({ ...i, errores: [0, 0] })],
    ['errores negativos', (i) => ({ ...i, errores: [0, -1, 0, 0] })],
    ['errores absurdos', (i) => ({ ...i, errores: [0, 1e9, 0, 0] })],
    ['errores no numéricos', (i) => ({ ...i, errores: [0, null, 0, 0] })],
    ['errores ausentes', (i) => ({ ...i, errores: undefined })],
  ])('la descarta si %s', (_nombre, romper) => {
    expect(leerInstantanea(a, romper(valida()))).toBeNull();
  });

  it('una semilla inválida no invalida la instantánea: se deriva otra', () => {
    for (const semilla of [-1, 1.5, 2 ** 40, 'x', null]) {
      const leida = leerInstantanea(a, { ...valida(), semilla });
      expect(leida?.semilla).toBeUndefined();
      expect(leida?.hechos).toEqual([1]);
    }
  });
});

describe('construirDetalle', () => {
  it('cuenta aciertos y errores, y lista solo los pares con errores', () => {
    const a = analizar({ pares: 3, distractores: 0 });
    expect(construirDetalle(a, { hechos: [0, 1, 2], errores: [0, 2, 1] })).toEqual({
      aciertos: 3,
      errores: 3,
      errores_por_par: { par_2: 2, par_3: 1 },
    });
    expect(construirDetalle(a, { hechos: [0, 1, 2], errores: [0, 0, 0] }).errores_por_par).toEqual(
      {},
    );
    expect(totalErrores([1, 2, 3])).toBe(6);
  });

  it('un id de par raro no altera el prototipo del detalle', () => {
    const config = clonar(crearActividad({ pares: 3, distractores: 0 }).config) as any;
    config.pares[0].id = '__proto__';
    const a = analizarConfig(config) as AnalisisValido;
    const detalle = construirDetalle(a, { hechos: [1, 2, 0], errores: [2, 0, 0] });
    expect(Object.getPrototypeOf(detalle.errores_por_par)).toBe(Object.prototype);
    expect(Object.keys(detalle.errores_por_par)).toEqual(['__proto__']);
    expect(JSON.stringify(detalle)).toContain('"__proto__":2');
  });
});
