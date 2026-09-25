/**
 * Pruebas de la lógica pura de `exploracion-3d`: saneado de la configuración, avance, instantánea y
 * restauración (con entradas corruptas o de otra versión del contenido).
 */
import { describe, expect, it } from 'vitest';
import type { ConfigExploracion3d } from '@/content/schema';
import {
  avanceDeExploracion,
  crearInstantanea,
  exploracionCompleta,
  prepararExploracion,
  requeridosVisitados,
  restaurarVisitados,
} from './logica';

function config(sobrescribir: Partial<ConfigExploracion3d> = {}): ConfigExploracion3d {
  return {
    modelo: 'mandibula',
    alt: 'Modelo tridimensional de la mandíbula.',
    nodos: [
      { id: 'condilo', etiqueta: 'Cóndilo', descripcion: 'Extremo superior de la rama del hueso.' },
      {
        id: 'zona_x',
        etiqueta: 'Zona X',
        descripcion: 'Una zona definida por su ancla sobre la malla.',
        ancla: { x: 0.5, y: 0.5, z: 0.5 },
        camara: { vista: 'posterior', zoom: 2 },
      },
      {
        id: 'cuerpo',
        etiqueta: 'Cuerpo',
        descripcion: 'Porción horizontal que aloja los dientes.',
      },
    ],
    requeridos: ['condilo', 'cuerpo'],
    ...sobrescribir,
  };
}

describe('prepararExploracion', () => {
  it('resuelve la cámara por defecto (frontal, zoom 1) y marca los requeridos', () => {
    const { nodos, requeridos } = prepararExploracion(config());
    expect(requeridos).toEqual(['condilo', 'cuerpo']);
    expect(nodos.map((n) => [n.id, n.requerido, n.vista, n.zoom])).toEqual([
      ['condilo', true, 'frontal', 1],
      ['zona_x', false, 'posterior', 2],
      ['cuerpo', true, 'frontal', 1],
    ]);
    expect(nodos[1]!.ancla).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
  });

  it('con ids repetidos gana el primero y no duplica requeridos', () => {
    const base = config();
    const { nodos, requeridos } = prepararExploracion(
      config({
        nodos: [
          ...base.nodos,
          {
            id: 'condilo',
            etiqueta: 'Repetido',
            descripcion: 'Otro nodo con el mismo id repetido.',
          },
        ],
        requeridos: ['condilo', 'condilo', 'cuerpo'],
      }),
    );
    expect(nodos.filter((n) => n.id === 'condilo')).toHaveLength(1);
    expect(nodos.find((n) => n.id === 'condilo')!.etiqueta).toBe('Cóndilo');
    expect(requeridos).toEqual(['condilo', 'cuerpo']);
  });

  it('ignora requeridos inexistentes; si no queda ninguno, exige todos los nodos', () => {
    expect(prepararExploracion(config({ requeridos: ['condilo', 'fantasma'] })).requeridos).toEqual(
      ['condilo'],
    );
    const sinNinguno = prepararExploracion(config({ requeridos: ['fantasma'] }));
    expect(sinNinguno.requeridos).toEqual(['condilo', 'zona_x', 'cuerpo']);
    expect(sinNinguno.nodos.every((n) => n.requerido)).toBe(true);
    expect(prepararExploracion(config({ requeridos: [] })).requeridos).toHaveLength(3);
  });

  it('no muta la configuración recibida', () => {
    const original = config();
    const copia = structuredClone(original);
    prepararExploracion(original);
    expect(original).toEqual(copia);
  });

  it('admite ids raros y textos Unicode sin alterarlos', () => {
    const { nodos } = prepararExploracion(
      config({
        nodos: [
          {
            id: '__proto__',
            etiqueta: 'Ñandú 🦴',
            descripcion: 'Texto con acentos y emoji 🦴 ok.',
          },
          { id: 'constructor', etiqueta: 'Ω', descripcion: 'Otro texto de descripción largo ok.' },
        ],
        requeridos: ['__proto__', 'constructor'],
      }),
    );
    expect(nodos.map((n) => n.id)).toEqual(['__proto__', 'constructor']);
    expect(nodos[0]!.etiqueta).toBe('Ñandú 🦴');
  });
});

describe('avance y completitud', () => {
  const requeridos = ['a', 'b', 'c'];

  it('cuenta solo los requeridos visitados (los opcionales no suman)', () => {
    expect(requeridosVisitados(requeridos, [])).toBe(0);
    expect(requeridosVisitados(requeridos, ['a', 'z'])).toBe(1);
    expect(requeridosVisitados(requeridos, ['a', 'a', 'b'])).toBe(2);
  });

  it('el avance va de 0 a 1 y con cero requeridos es 0', () => {
    expect(avanceDeExploracion(requeridos, [])).toBe(0);
    expect(avanceDeExploracion(requeridos, ['a'])).toBeCloseTo(1 / 3, 10);
    expect(avanceDeExploracion(requeridos, ['a', 'b', 'c', 'x'])).toBe(1);
    expect(avanceDeExploracion([], ['a'])).toBe(0);
  });

  it('está completa solo con todos los requeridos y nunca sin requeridos', () => {
    expect(exploracionCompleta(requeridos, ['a', 'b'])).toBe(false);
    expect(exploracionCompleta(requeridos, ['c', 'b', 'a'])).toBe(true);
    expect(exploracionCompleta([], ['a'])).toBe(false);
  });
});

describe('instantánea', () => {
  const nodos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('guarda índices, en orden de visita, y ocupa poco', () => {
    const instantanea = crearInstantanea(['c', 'a'], nodos);
    expect(instantanea).toEqual({ visitados: [2, 0] });
    expect(JSON.stringify(instantanea).length).toBeLessThan(64);
  });

  it('descarta ids que ya no existen al guardar', () => {
    expect(crearInstantanea(['a', 'fantasma'], nodos)).toEqual({ visitados: [0] });
  });

  it('restaura ida y vuelta', () => {
    const ids = restaurarVisitados(crearInstantanea(['c', 'a'], nodos), nodos);
    expect(ids).toEqual(['c', 'a']);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['número', 5],
    ['texto', 'visitados'],
    ['lista', [0, 1]],
    ['sin clave', {}],
    ['visitados no lista', { visitados: 'a' }],
    ['visitados objeto', { visitados: { 0: 0 } }],
  ])('una instantánea inválida (%s) empieza de cero', (_nombre, entrada) => {
    expect(restaurarVisitados(entrada, nodos)).toEqual([]);
  });

  it('ignora índices fuera de rango, negativos, decimales, repetidos y de otro tipo', () => {
    const basura = { visitados: [0, 0, 1.5, -1, 99, '2', null, NaN, Infinity, {}, [2], 2] };
    expect(restaurarVisitados(basura, nodos)).toEqual(['a', 'c']);
  });

  it('con menos nodos que antes (contenido nuevo) solo recupera los que existen', () => {
    expect(restaurarVisitados({ visitados: [0, 1, 2] }, [{ id: 'a' }])).toEqual(['a']);
  });
});
