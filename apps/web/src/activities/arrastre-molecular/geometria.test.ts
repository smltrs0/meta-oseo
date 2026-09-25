/**
 * Pruebas de la geometría del arrastre: radio de captura (contrato: 56 px), receptor más cercano,
 * márgenes en píxeles a 320 px de ancho y barajado con semilla.
 */
import { describe, expect, it } from 'vitest';
import { RADIO_CAPTURA_MIN_PX, TAMANO_TACTIL_MIN_PX } from '../types';
import {
  RADIO_CAPTURA_PX,
  TAMANO_RECEPTOR_PX,
  alineacionEtiqueta,
  anchoMaxEtiquetaPx,
  aspectoDeViewBox,
  centroDeRect,
  distancia,
  generadorConSemilla,
  margenInferiorEscena,
  ordenBarajado,
  receptorMasCercano,
  semillaNueva,
} from './geometria';

describe('constantes del contrato', () => {
  it('el radio de captura no baja de 56 px y la zona táctil es de 44 px', () => {
    expect(RADIO_CAPTURA_PX).toBeGreaterThanOrEqual(RADIO_CAPTURA_MIN_PX);
    expect(RADIO_CAPTURA_MIN_PX).toBe(56);
    expect(TAMANO_RECEPTOR_PX).toBeGreaterThanOrEqual(TAMANO_TACTIL_MIN_PX);
  });
});

describe('receptorMasCercano', () => {
  const centros = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ];

  it('elige por cercanía dentro del radio, no por intersección exacta', () => {
    expect(receptorMasCercano({ x: 100, y: 100 }, centros)).toBe(0);
    // Justo en el borde del radio (56 px) todavía captura; un píxel más, no.
    expect(receptorMasCercano({ x: 100 - 56, y: 100 }, centros)).toBe(0);
    expect(receptorMasCercano({ x: 200, y: 100 + 56 }, centros)).toBe(1);
    expect(receptorMasCercano({ x: 100, y: 100 + 55 }, [centros[0]!])).toBe(0);
  });

  it('fuera del radio devuelve null (soltar en el vacío no es un error)', () => {
    expect(receptorMasCercano({ x: 100, y: 100 + 57 }, centros)).toBeNull();
    expect(receptorMasCercano({ x: 0, y: 0 }, centros)).toBeNull();
    expect(receptorMasCercano({ x: 0, y: 0 }, [])).toBeNull();
  });

  it('con radios solapados gana el más cercano y en un empate el de menor índice', () => {
    expect(receptorMasCercano({ x: 140, y: 100 }, centros)).toBe(0);
    expect(receptorMasCercano({ x: 160, y: 100 }, centros)).toBe(1);
    expect(receptorMasCercano({ x: 150, y: 100 }, centros)).toBe(0);
  });

  it('ignora centros ausentes o no finitos y puntos no finitos', () => {
    const raros = [null, undefined, { x: NaN, y: 0 }, { x: 10, y: 10 }];
    expect(receptorMasCercano({ x: 12, y: 12 }, raros)).toBe(3);
    expect(receptorMasCercano({ x: NaN, y: 0 }, centros)).toBeNull();
    expect(receptorMasCercano({ x: Infinity, y: 0 }, centros)).toBeNull();
  });

  it('acepta un radio propio', () => {
    expect(receptorMasCercano({ x: 130, y: 100 }, centros, 20)).toBeNull();
    expect(receptorMasCercano({ x: 115, y: 100 }, centros, 20)).toBe(0);
  });
});

describe('medidas', () => {
  it('distancia y centro de un rectángulo', () => {
    expect(distancia({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(centroDeRect({ left: 10, top: 20, width: 44, height: 44 })).toEqual({ x: 32, y: 42 });
  });

  it('aspectoDeViewBox lee "0 0 ancho alto" y usa 4/3 si no cuadra', () => {
    expect(aspectoDeViewBox('0 0 800 600')).toBeCloseTo(4 / 3);
    expect(aspectoDeViewBox('0 0 1000 500')).toBe(2);
    expect(aspectoDeViewBox('0 0 800.5 400.25')).toBeCloseTo(800.5 / 400.25);
    for (const malo of ['', 'abc', '0 0 0 0', '0 0 800', undefined, '5 5 800 600']) {
      expect(aspectoDeViewBox(malo), String(malo)).toBeCloseTo(4 / 3);
    }
  });

  it('margenInferiorEscena: 0 si la etiqueta cabe en la escena y crece con receptores bajos', () => {
    // 320 x 240 px: un receptor al 50 % deja de sobra.
    expect(margenInferiorEscena([{ y: 50 }], 4 / 3)).toBe(0);
    const bajo = margenInferiorEscena([{ y: 95 }], 4 / 3);
    expect(bajo).toBeGreaterThan(0);
    expect(margenInferiorEscena([{ y: 95 }, { y: 50 }], 4 / 3)).toBe(bajo);
    expect(margenInferiorEscena([], 4 / 3)).toBe(0);
    expect(margenInferiorEscena([{ y: 500 }], NaN)).toBeGreaterThan(0);
  });

  it('anchoMaxEtiquetaPx: se reduce con vecinos cercanos y nunca baja de 44 px ni pasa del máximo', () => {
    const aislado = [{ x: 50, y: 50 }];
    expect(anchoMaxEtiquetaPx(aislado, 0, 4 / 3)).toBe(112);
    // Dos receptores a 25 % y 45 % de 320 px = 64 px de separación horizontal.
    const juntos = [
      { x: 25, y: 50 },
      { x: 45, y: 50 },
    ];
    expect(anchoMaxEtiquetaPx(juntos, 0, 4 / 3)).toBe(60);
    const pegados = [
      { x: 50, y: 50 },
      { x: 51, y: 50 },
    ];
    expect(anchoMaxEtiquetaPx(pegados, 0, 4 / 3)).toBe(44);
    // A distinta altura no se pisan.
    const arribaYAbajo = [
      { x: 50, y: 10 },
      { x: 51, y: 90 },
    ];
    expect(anchoMaxEtiquetaPx(arribaYAbajo, 0, 4 / 3)).toBe(112);
    expect(anchoMaxEtiquetaPx(aislado, 5, 4 / 3)).toBe(112);
  });

  it('alineacionEtiqueta evita que la etiqueta se salga de la escena', () => {
    expect(alineacionEtiqueta(5)).toBe('inicio');
    expect(alineacionEtiqueta(50)).toBe('centro');
    expect(alineacionEtiqueta(95)).toBe('fin');
  });
});

describe('barajado con semilla', () => {
  it('es una permutación, estable con la misma semilla y distinta con otra', () => {
    const a = ordenBarajado(8, 42);
    expect([...a].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(ordenBarajado(8, 42)).toEqual(a);
    const otros = new Set(Array.from({ length: 30 }, (_, s) => ordenBarajado(8, s).join()));
    expect(otros.size).toBeGreaterThan(10);
  });

  it('tamaños límite', () => {
    expect(ordenBarajado(0, 1)).toEqual([]);
    expect(ordenBarajado(1, 1)).toEqual([0]);
    expect(ordenBarajado(-3, 1)).toEqual([]);
    expect(ordenBarajado(2.9, 1)).toHaveLength(2);
  });

  it('el generador da valores en [0, 1) y es determinista', () => {
    const g1 = generadorConSemilla(7);
    const g2 = generadorConSemilla(7);
    for (let i = 0; i < 50; i++) {
      const v = g1();
      expect(v).toBe(g2());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('semillaNueva es un entero de 32 bits', () => {
    for (let i = 0; i < 20; i++) {
      const s = semillaNueva();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(4294967295);
    }
  });
});
