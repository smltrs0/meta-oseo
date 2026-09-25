import { describe, expect, it } from 'vitest';
import {
  ELEVACION_INICIAL_GRADOS,
  FOV_VERTICAL_GRADOS,
  MARGEN_ENCUADRE,
  RADIO_NORMALIZADO,
  distanciaParaEncajar,
  escalaParaEncajar,
  esToqueSinArrastre,
  limitesDistancia,
  posicionInicialCamara,
} from './encuadre';

const aRadianes = (grados: number) => (grados * Math.PI) / 180;

describe('escalaParaEncajar', () => {
  it('lleva la esfera al radio objetivo (por defecto 1)', () => {
    expect(escalaParaEncajar(50)).toBeCloseTo(0.02);
    expect(escalaParaEncajar(0.5)).toBeCloseTo(2);
    expect(escalaParaEncajar(10, 5)).toBeCloseTo(0.5);
  });

  it('no escala con un radio inválido', () => {
    expect(escalaParaEncajar(0)).toBe(1);
    expect(escalaParaEncajar(-3)).toBe(1);
    expect(escalaParaEncajar(Number.NaN)).toBe(1);
    expect(escalaParaEncajar(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('distanciaParaEncajar', () => {
  it('en lienzo apaisado la esfera cabe justo en el eje vertical, con el margen pedido', () => {
    const d = distanciaParaEncajar(1, 16 / 9);
    // La esfera de radio (radio * margen) subtiende exactamente el campo de visión vertical.
    const mitadFov = Math.asin((RADIO_NORMALIZADO * MARGEN_ENCUADRE) / d);
    expect(mitadFov).toBeCloseTo(aRadianes(FOV_VERTICAL_GRADOS) / 2, 6);
  });

  it('en lienzo vertical (móvil) usa el eje horizontal y queda más lejos', () => {
    const apaisado = distanciaParaEncajar(1, 16 / 9);
    const vertical = distanciaParaEncajar(1, 390 / 579);
    expect(vertical).toBeGreaterThan(apaisado);
    // Comprobación geométrica: en horizontal la esfera también cabe.
    const fovV = aRadianes(FOV_VERTICAL_GRADOS);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * (390 / 579));
    expect(Math.asin(MARGEN_ENCUADRE / vertical)).toBeCloseTo(fovH / 2, 6);
  });

  it('con aspecto 1 coincide en ambos ejes y escala con el radio', () => {
    expect(distanciaParaEncajar(2, 1)).toBeCloseTo(2 * distanciaParaEncajar(1, 1));
  });

  it('acepta margen y campo de visión propios', () => {
    expect(distanciaParaEncajar(1, 1, 90, 1)).toBeCloseTo(1 / Math.sin(aRadianes(45)));
  });

  it('con un aspecto inválido supone un lienzo cuadrado (sin NaN)', () => {
    const cuadrado = distanciaParaEncajar(1, 1);
    expect(distanciaParaEncajar(1, 0)).toBeCloseTo(cuadrado);
    expect(distanciaParaEncajar(1, Number.NaN)).toBeCloseTo(cuadrado);
    expect(distanciaParaEncajar(1, -2)).toBeCloseTo(cuadrado);
  });
});

describe('posicionInicialCamara', () => {
  it('coloca la cámara de frente (x = 0), elevada y a la distancia pedida', () => {
    const [x, y, z] = posicionInicialCamara(4);
    expect(x).toBe(0);
    expect(y).toBeGreaterThan(0);
    expect(z).toBeGreaterThan(0);
    expect(Math.hypot(x, y, z)).toBeCloseTo(4, 10);
    expect(Math.atan2(y, z)).toBeCloseTo(aRadianes(ELEVACION_INICIAL_GRADOS), 10);
  });

  it('admite otra elevación', () => {
    const [, y, z] = posicionInicialCamara(2, 0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(2);
  });
});

describe('limitesDistancia', () => {
  it('la mínima impide entrar en el hueso y la máxima deja alejarse del encuadre', () => {
    const { minima, maxima } = limitesDistancia(1, 3.2);
    expect(minima).toBeGreaterThan(1);
    expect(minima).toBeLessThan(3.2);
    expect(maxima).toBeGreaterThan(3.2);
  });

  it('la máxima nunca queda por debajo del doble de la mínima', () => {
    const { minima, maxima } = limitesDistancia(1, 0.1);
    expect(maxima).toBeGreaterThanOrEqual(minima * 2);
  });
});

describe('esToqueSinArrastre', () => {
  it('acepta un toque sin desplazamiento y uno dentro del umbral', () => {
    expect(esToqueSinArrastre({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
    expect(esToqueSinArrastre({ x: 100, y: 100 }, { x: 105, y: 103 })).toBe(true);
  });

  it('rechaza un arrastre más largo que el umbral, en cualquier dirección', () => {
    expect(esToqueSinArrastre({ x: 100, y: 100 }, { x: 140, y: 100 })).toBe(false);
    expect(esToqueSinArrastre({ x: 100, y: 100 }, { x: 100, y: 60 })).toBe(false);
    expect(esToqueSinArrastre({ x: 0, y: 0 }, { x: 8, y: 8 })).toBe(false); // 11,3 px > 8
  });

  it('el umbral es ajustable y su límite es inclusivo', () => {
    expect(esToqueSinArrastre({ x: 0, y: 0 }, { x: 8, y: 0 })).toBe(true);
    expect(esToqueSinArrastre({ x: 0, y: 0 }, { x: 20, y: 0 }, 30)).toBe(true);
  });

  it('sin punto de inicio (p. ej. activación con teclado) se acepta', () => {
    expect(esToqueSinArrastre(null, { x: 500, y: 500 })).toBe(true);
  });
});
