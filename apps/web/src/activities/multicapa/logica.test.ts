/** Pruebas de la lógica pura de la actividad multicapa. */
import { describe, expect, it } from 'vitest';
import type { ConfigMulticapa } from '@/content/schema';
import {
  barajar,
  capasAcertadas,
  construirConsignas,
  crearInstantanea,
  detalleDeExplorar,
  detalleDeIdentificar,
  erroresDe,
  leerInstantanea,
  requeridasEfectivas,
  totalErrores,
  veredictoDeToque,
} from './logica';
import { clonar, explorarDeMuestra, identificarDeMuestra } from './utilesPrueba';

const explorar = explorarDeMuestra().config;
const identificar = identificarDeMuestra().config;

describe('requeridasEfectivas y consignas', () => {
  it('descarta ids inexistentes y repetidos, conservando el orden', () => {
    const config = {
      ...explorar,
      requeridas: ['capa_medula_osea', 'nada', 'capa_periostio', 'capa_medula_osea'],
    };
    expect(requeridasEfectivas(config)).toEqual(['capa_medula_osea', 'capa_periostio']);
  });

  it('una consigna por pista y por pista extra, en el orden de requeridas', () => {
    const c = construirConsignas(identificar);
    expect(c.map((x) => x.capa)).toEqual([
      'histo_osteoblasto',
      'histo_osteocito',
      'histo_osteoclasto',
      'histo_osteoclasto',
    ]);
    expect(c[3]!.texto).toContain('borde en cepillo');
  });

  it('una capa requerida sin pista se pide por su nombre, para no dejarla sin salida', () => {
    const config = clonar(identificar) as ConfigMulticapa;
    delete (config.capas[0] as { pista?: string }).pista;
    expect(construirConsignas(config)[0]!.texto).toContain(config.capas[0]!.etiqueta);
  });
});

describe('veredictoDeToque', () => {
  it('correcta, repetida e incorrecta', () => {
    const acertadas = new Set(['b']);
    expect(veredictoDeToque('a', 'a', acertadas)).toBe('correcta');
    expect(veredictoDeToque('b', 'a', acertadas)).toBe('repetida');
    expect(veredictoDeToque('c', 'a', acertadas)).toBe('incorrecta');
  });

  it('capasAcertadas acota el paso', () => {
    const c = construirConsignas(identificar);
    expect(capasAcertadas(c, -3).size).toBe(0);
    expect([...capasAcertadas(c, 2)]).toEqual(['histo_osteoblasto', 'histo_osteocito']);
    expect(capasAcertadas(c, 999).size).toBe(3);
  });
});

describe('barajar', () => {
  it('es determinista por semilla, no muta y conserva los elementos', () => {
    const base = Array.from({ length: 15 }, (_, i) => i);
    const a = barajar(base, 42);
    expect(barajar(base, 42)).toEqual(a);
    expect(barajar(base, 43)).not.toEqual(a);
    expect([...a].sort((x, y) => x - y)).toEqual(base);
    expect(base[0]).toBe(0);
  });

  it('acepta listas de 0 y 1 elemento', () => {
    expect(barajar([], 1)).toEqual([]);
    expect(barajar(['x'], 1)).toEqual(['x']);
  });
});

describe('instantánea', () => {
  it('ida y vuelta en explorar y en identificar', () => {
    const e = crearInstantanea({ modo: 'explorar', visitadas: ['capa_periostio'] });
    expect(leerInstantanea(e, explorar, 0)).toEqual({
      modo: 'explorar',
      visitadas: ['capa_periostio'],
    });
    const i = crearInstantanea({
      modo: 'identificar',
      paso: 2,
      semilla: 7,
      erroresPorCapa: { histo_osteocito: 2 },
    });
    expect(leerInstantanea(i, identificar, 4)).toEqual({
      modo: 'identificar',
      paso: 2,
      semilla: 7,
      erroresPorCapa: { histo_osteocito: 2 },
    });
  });

  it('cabe con holgura en el límite de instantánea aun con 15 capas y fallos altos', () => {
    const erroresPorCapa = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`capa_${i}`, 999]),
    );
    const bytes = new TextEncoder().encode(
      JSON.stringify(
        crearInstantanea({ modo: 'identificar', paso: 29, semilla: 2 ** 31 - 1, erroresPorCapa }),
      ),
    ).length;
    expect(bytes).toBeLessThan(1024);
  });

  it('acota y filtra lo que no sirve', () => {
    const r = leerInstantanea(
      {
        modo: 'identificar',
        paso: 1,
        errores_por_capa: {
          histo_osteocito: 1e9,
          histo_osteoblasto: -1,
          fantasma: 3,
          histo_osteoclasto: Number.NaN,
        },
      },
      identificar,
      4,
    );
    expect(r).toEqual({ modo: 'identificar', paso: 1, erroresPorCapa: { histo_osteocito: 999 } });
  });

  it('un paso igual al total de consignas era un intento ya resuelto: se ignora; el último paso válido se conserva', () => {
    expect(leerInstantanea({ modo: 'identificar', paso: 4 }, identificar, 4)).toBeNull();
    expect(leerInstantanea({ modo: 'identificar', paso: 3 }, identificar, 4)).toMatchObject({
      paso: 3,
    });
  });

  it('rechaza tipos raros', () => {
    for (const x of [
      undefined,
      null,
      3,
      'a',
      [],
      { modo: 'otro' },
      { modo: 'identificar', paso: '1' },
    ]) {
      expect(leerInstantanea(x, identificar, 4)).toBeNull();
    }
  });
});

describe('resultado', () => {
  it('erroresDe y totalErrores ignoran basura', () => {
    expect(erroresDe({ a: 2 }, 'a')).toBe(2);
    expect(erroresDe({ a: 2 }, 'b')).toBe(0);
    expect(erroresDe({}, '__proto__')).toBe(0);
    expect(erroresDe({}, 'constructor')).toBe(0);
    expect(totalErrores({ a: 2, b: -1, c: Number.NaN, d: 3 })).toBe(5);
  });

  it('detalles con la forma del contrato', () => {
    expect(detalleDeExplorar(['a', 'b'])).toEqual({ modo: 'explorar', visitadas: ['a', 'b'] });
    expect(detalleDeIdentificar(4, { a: 1, b: 2 })).toEqual({
      modo: 'identificar',
      aciertos: 4,
      errores: 3,
      errores_por_capa: { a: 1, b: 2 },
    });
  });
});
