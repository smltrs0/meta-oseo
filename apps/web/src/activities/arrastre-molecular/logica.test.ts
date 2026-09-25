/**
 * Pruebas de la lógica pura del arrastre molecular: modelo, resolución de sueltas, precisión por
 * conteo, competencia en un receptor e instantánea (incluida la corrupta).
 */
import { describe, expect, it } from 'vitest';
import type { ConfigArrastreMolecular } from '@/content/schema';
import {
  aInstantanea,
  aplicarSuelta,
  construirModelo,
  erroresPorId,
  estaCompleto,
  estadoVacio,
  paresAcopladosEn,
  parVisibleDeReceptor,
  resolverSuelta,
  restaurarInstantanea,
} from './logica';
import type { EstadoArrastre } from './logica';

const efecto = (animacion: 'activacion' | 'inhibicion' = 'activacion') => ({
  titulo: 'Efecto de prueba',
  descripcion: 'Descripción del efecto de prueba.',
  animacion,
});

/** Wnt y esclerostina compiten por LRP5/6 (dos pares, un receptor); "Ruido" es un distractor. */
function configCompetencia(): ConfigArrastreMolecular {
  return {
    escena: { viewBox: '0 0 800 600', alt: 'Escena de prueba con dos receptores.' },
    moleculas: [
      { id: 'wnt', etiqueta: 'Wnt', descripcion: 'Activa la vía canónica.', forma: 'circulo' },
      { id: 'sost', etiqueta: 'SOST', descripcion: 'Bloquea el receptor.', forma: 'cuadrado' },
      { id: 'pth', etiqueta: 'PTH', descripcion: 'Hormona paratiroidea.', forma: 'rombo' },
      {
        id: 'ruido',
        etiqueta: 'Ruido',
        descripcion: 'No encaja en ningún sitio.',
        forma: 'triangulo',
        rechazo: 'No encaja en ningún receptor de esta escena.',
      },
    ],
    receptores: [
      {
        id: 'lrp',
        etiqueta: 'LRP5/6',
        descripcion: 'Correceptor de la vía Wnt.',
        posicion: { x: 30, y: 50 },
      },
      {
        id: 'pth1r',
        etiqueta: 'PTH1R',
        descripcion: 'Receptor de la hormona.',
        posicion: { x: 70, y: 50 },
      },
    ],
    pares: [
      { id: 'p_wnt', molecula: 'wnt', receptor: 'lrp', efecto: efecto('activacion') },
      { id: 'p_sost', molecula: 'sost', receptor: 'lrp', efecto: efecto('inhibicion') },
      { id: 'p_pth', molecula: 'pth', receptor: 'pth1r', efecto: efecto('activacion') },
    ],
    distractores: ['ruido'],
  } as ConfigArrastreMolecular;
}

describe('construirModelo', () => {
  it('indexa moléculas, receptores y pares, y marca al distractor sin par', () => {
    const m = construirModelo(configCompetencia());
    expect(m.problema).toBeNull();
    expect(m.moleculas.map((x) => x.par)).toEqual([0, 1, 2, null]);
    expect(m.receptores[0]!.pares).toEqual([0, 1]);
    expect(m.receptores[1]!.pares).toEqual([2]);
    expect(m.pares.map((p) => [p.molecula, p.receptor])).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
    ]);
  });

  it.each<[string, (c: ConfigArrastreMolecular) => void, RegExp]>([
    ['par con molécula inexistente', (c) => void (c.pares[0]!.molecula = 'no_existe'), /no existe/],
    ['par con receptor inexistente', (c) => void (c.pares[0]!.receptor = 'no_hay'), /no existe/],
    ['molécula en dos pares', (c) => void (c.pares[1]!.molecula = 'wnt'), /más de un par/],
    ['sin moléculas', (c) => void ((c.moleculas = []), (c.pares = [])), /No hay moléculas/],
    ['sin receptores', (c) => void ((c.receptores = []), (c.pares = [])), /No hay receptores/],
    ['sin pares', (c) => void (c.pares = []), /No hay pares/],
    [
      'receptor sin posición',
      (c) => void ((c.receptores[0] as { posicion?: unknown }).posicion = undefined),
      /posición/,
    ],
  ])('detecta %s en vez de romper', (_nombre, romper, patron) => {
    const c = configCompetencia();
    romper(c);
    const m = construirModelo(c);
    expect(m.problema).toMatch(patron);
  });

  it('no rompe con una configuración vacía o sin listas', () => {
    expect(construirModelo({} as ConfigArrastreMolecular).problema).toMatch(/No hay moléculas/);
    expect(construirModelo(undefined as never).problema).not.toBeNull();
  });

  it('listas que no son listas o con elementos nulos se tratan como vacías, sin lanzar', () => {
    const roto = {
      moleculas: 'x',
      receptores: 5,
      pares: null,
    } as unknown as ConfigArrastreMolecular;
    expect(construirModelo(roto).problema).toMatch(/No hay moléculas/);
    const c = configCompetencia();
    (c.moleculas as unknown[]).push(null, 3);
    (c.pares as unknown[]).push(undefined);
    const m = construirModelo(c);
    expect(m.problema).toBeNull();
    expect(m.moleculas).toHaveLength(4);
  });

  it('ids con nombres del prototipo no rompen el modelo', () => {
    const c = configCompetencia();
    c.moleculas[0]!.id = '__proto__';
    c.moleculas[1]!.id = 'constructor';
    c.pares[0]!.molecula = '__proto__';
    c.pares[1]!.molecula = 'constructor';
    const m = construirModelo(c);
    expect(m.problema).toBeNull();
    expect(m.pares).toHaveLength(3);
  });
});

describe('resolverSuelta y aplicarSuelta', () => {
  const modelo = construirModelo(configCompetencia());

  it('acoplar en su receptor es un acierto, y repetirlo no cuenta ni como acierto ni como fallo', () => {
    let estado = estadoVacio();
    const s1 = resolverSuelta(modelo, estado, 0, 0);
    expect(s1).toEqual({ tipo: 'acierto', par: 0 });
    estado = aplicarSuelta(estado, s1, 0);
    expect(estado.acoplados).toEqual([0]);
    const s2 = resolverSuelta(modelo, estado, 0, 0);
    expect(s2).toEqual({ tipo: 'repetido', par: 0 });
    const despues = aplicarSuelta(estado, s2, 0);
    expect(despues.fallos).toBe(0);
    expect(despues.acoplados).toEqual([0]);
  });

  it('un receptor equivocado es fallo (con contador por molécula) y un distractor lo es en cualquiera', () => {
    let estado = estadoVacio();
    const fallo = resolverSuelta(modelo, estado, 2, 0);
    expect(fallo).toEqual({ tipo: 'fallo', distractor: false });
    estado = aplicarSuelta(estado, fallo, 2);
    expect(estado).toMatchObject({ fallos: 1, errores: { 2: 1 }, acoplados: [] });
    for (const receptor of [0, 1]) {
      expect(resolverSuelta(modelo, estado, 3, receptor)).toEqual({
        tipo: 'fallo',
        distractor: true,
      });
    }
    estado = aplicarSuelta(estado, { tipo: 'fallo', distractor: true }, 3);
    estado = aplicarSuelta(estado, { tipo: 'fallo', distractor: true }, 3);
    expect(estado.errores).toEqual({ 2: 1, 3: 2 });
    expect(estado.fallos).toBe(3);
  });

  it('aplicarSuelta no muta el estado anterior', () => {
    const antes = estadoVacio();
    const copia = structuredClone(antes);
    aplicarSuelta(antes, { tipo: 'fallo', distractor: false }, 1);
    aplicarSuelta(antes, { tipo: 'acierto', par: 1 }, 1);
    expect(antes).toEqual(copia);
  });

  it('una molécula o un receptor fuera de rango no lanza', () => {
    const estado = estadoVacio();
    expect(resolverSuelta(modelo, estado, 99, 0).tipo).toBe('fallo');
    expect(resolverSuelta(modelo, estado, 0, 99).tipo).toBe('fallo');
  });
});

describe('competencia en un receptor: el efecto es el de la última molécula y el orden no importa', () => {
  const modelo = construirModelo(configCompetencia());
  const acoplar = (orden: [number, number][]): EstadoArrastre =>
    orden.reduce((estado, [mol, rec]) => {
      const s = resolverSuelta(modelo, estado, mol, rec);
      return aplicarSuelta(estado, s, mol);
    }, estadoVacio());

  it('muestra el par de la última acoplada y conserva las dos en el receptor', () => {
    const a = acoplar([
      [0, 0],
      [1, 0],
    ]);
    expect(parVisibleDeReceptor(modelo, a, 0)).toBe(1);
    expect(paresAcopladosEn(modelo, a, 0)).toEqual([0, 1]);
    const b = acoplar([
      [1, 0],
      [0, 0],
    ]);
    expect(parVisibleDeReceptor(modelo, b, 0)).toBe(0);
    expect(parVisibleDeReceptor(modelo, b, 1)).toBeNull();
  });

  it('volver a soltar la primera molécula devuelve el efecto a esa molécula', () => {
    const a = acoplar([
      [0, 0],
      [1, 0],
      [0, 0],
    ]);
    expect(parVisibleDeReceptor(modelo, a, 0)).toBe(0);
    expect(a.acoplados).toEqual([1, 0]);
    expect(a.fallos).toBe(0);
  });

  it('cualquier orden completa la actividad con los mismos aciertos y fallos', () => {
    const ordenes: [number, number][][] = [
      [
        [0, 0],
        [1, 0],
        [2, 1],
      ],
      [
        [2, 1],
        [1, 0],
        [0, 0],
      ],
      [
        [1, 0],
        [2, 1],
        [0, 0],
      ],
    ];
    for (const orden of ordenes) {
      const e = acoplar(orden);
      expect(estaCompleto(modelo, e)).toBe(true);
      expect(e.fallos).toBe(0);
    }
  });

  it('no está completo hasta que cada par se acopló al menos una vez', () => {
    const e = acoplar([
      [0, 0],
      [2, 1],
    ]);
    expect(estaCompleto(modelo, e)).toBe(false);
    expect(estaCompleto({ ...modelo, pares: [] }, estadoVacio())).toBe(false);
  });
});

describe('instantánea', () => {
  const modelo = construirModelo(configCompetencia());
  const estado: EstadoArrastre = { acoplados: [0, 2], fallos: 3, errores: { 3: 2, 1: 1 } };

  it('ida y vuelta conserva el estado y la semilla', () => {
    const r = restaurarInstantanea(aInstantanea(estado, 1234), modelo)!;
    expect(r.estado).toEqual(estado);
    expect(r.semilla).toBe(1234);
  });

  it('es JSON puro y muy por debajo del tope de 8 KB', () => {
    const json = JSON.stringify(aInstantanea(estado, 4294967295));
    expect(new TextEncoder().encode(json).length).toBeLessThan(500);
    expect(JSON.parse(json)).toMatchObject({ acoplados: [0, 2], fallos: 3 });
  });

  it.each<[string, unknown]>([
    ['nulo', null],
    ['texto', 'hola'],
    ['número', 7],
    ['lista', [1, 2]],
    ['objeto vacío', {}],
    ['ids de otro contenido', { id_que_no_existe: 'x', visitadas: ['fantasma'], orden: [9] }],
  ])('%s se ignora', (_nombre, basura) => {
    expect(restaurarInstantanea(basura, modelo)).toBeNull();
  });

  it('descarta índices fuera de rango, repetidos, no enteros y de tipo equivocado', () => {
    const r = restaurarInstantanea(
      {
        acoplados: [0, 0, 1.5, -1, 99, '2', null, 2],
        fallos: -4,
        errores: { '0': 2, '77': 1, x: 3, '1': 'mucho', '2': 0 },
        semilla: 'no',
      },
      modelo,
    )!;
    expect(r.estado.acoplados).toEqual([0, 2]);
    expect(r.estado.errores).toEqual({ 0: 2 });
    // `fallos` nunca baja de la suma de los errores por molécula.
    expect(r.estado.fallos).toBe(2);
    expect(r.semilla).toBeNull();
  });

  it('una cifra absurda de fallos no se restaura', () => {
    const r = restaurarInstantanea({ acoplados: [0], fallos: 1e12 }, modelo)!;
    expect(r.estado.fallos).toBe(0);
  });

  it('la instantánea de una ejecución ya terminada no se restaura', () => {
    expect(
      restaurarInstantanea({ acoplados: [0, 1, 2], fallos: 0, semilla: 5 }, modelo),
    ).toBeNull();
  });

  it('una semilla fuera de 32 bits o fraccionaria se ignora', () => {
    expect(restaurarInstantanea({ acoplados: [0], semilla: 2 ** 40 }, modelo)!.semilla).toBeNull();
    expect(restaurarInstantanea({ acoplados: [0], semilla: 1.5 }, modelo)!.semilla).toBeNull();
  });
});

describe('erroresPorId', () => {
  it('traduce índices a ids, omite ceros y suma ids repetidos sin chocar con el prototipo', () => {
    const c = configCompetencia();
    c.moleculas[0]!.id = 'constructor';
    c.moleculas[1]!.id = 'constructor';
    c.pares[0]!.molecula = 'constructor';
    const m = construirModelo(c);
    const e: EstadoArrastre = { acoplados: [], fallos: 5, errores: { 0: 2, 1: 3, 2: 0, 40: 9 } };
    const r = erroresPorId(m, e);
    expect(r).toEqual({ constructor: 5 });
    expect(Object.keys(r)).toEqual(['constructor']);
  });
});
