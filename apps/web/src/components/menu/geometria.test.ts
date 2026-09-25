import { describe, expect, it } from 'vitest';
import {
  ALTO_CABECERA,
  ANCHO_ESCRITORIO,
  CENTRO_X,
  MARGEN_DERECHO,
  TAM_CONTROL,
  TAM_NODO,
  anguloDelNodo,
  calcularDisposicion,
  posicionNodo,
  posicionesNodos,
  sectorAnular,
  segmentosDeAnillo,
  separacionEntreNodos,
} from './geometria';

const semicirculo = { desde: 90, hasta: -90 };

describe('anguloDelNodo', () => {
  it('reparte los nodos en el centro de sub-sectores iguales', () => {
    const angulos = Array.from({ length: 6 }, (_, i) => anguloDelNodo(i, 6, semicirculo));
    expect(angulos).toEqual([75, 45, 15, -15, -45, -75]);
  });

  it('funciona con un cuarto de círculo y con un solo nodo', () => {
    expect([0, 1, 2].map((i) => anguloDelNodo(i, 3, { desde: 90, hasta: 0 }))).toEqual([
      75, 45, 15,
    ]);
    expect(anguloDelNodo(0, 1, semicirculo)).toBe(0);
  });

  it('acepta arcos recorridos en sentido contrario', () => {
    expect([0, 1].map((i) => anguloDelNodo(i, 2, { desde: 0, hasta: 90 }))).toEqual([22.5, 67.5]);
  });

  it('rechaza índices y totales inválidos', () => {
    expect(() => anguloDelNodo(6, 6, semicirculo)).toThrow(RangeError);
    expect(() => anguloDelNodo(-1, 6, semicirculo)).toThrow(RangeError);
    expect(() => anguloDelNodo(0, 0, semicirculo)).toThrow(RangeError);
    expect(() => anguloDelNodo(0, 2.5, semicirculo)).toThrow(RangeError);
  });
});

describe('posicionNodo / posicionesNodos', () => {
  it('coloca el nodo central de un semicírculo a la derecha del centro, a la altura del centro', () => {
    const p = posicionNodo(0, 1, 100, semicirculo);
    expect(p).toEqual({ indice: 0, angulo: 0, x: 100, y: 0 });
  });

  it('usa y hacia abajo: el ángulo positivo queda ARRIBA del centro', () => {
    const arriba = posicionNodo(0, 6, 100, semicirculo);
    const abajo = posicionNodo(5, 6, 100, semicirculo);
    expect(arriba.y).toBeLessThan(0);
    expect(abajo.y).toBeGreaterThan(0);
  });

  it('todos los nodos quedan exactamente a `radio` del centro', () => {
    for (const radio of [96, 150, 190]) {
      for (const n of posicionesNodos(6, radio, semicirculo)) {
        expect(Math.hypot(n.x, n.y)).toBeCloseTo(radio, 1);
      }
    }
  });

  it('el semicírculo es simétrico respecto del eje horizontal y va de arriba abajo', () => {
    const nodos = posicionesNodos(6, 150, semicirculo);
    nodos.forEach((n, i) => {
      const espejo = nodos[5 - i]!;
      expect(n.x).toBeCloseTo(espejo.x, 2);
      expect(n.y).toBeCloseTo(-espejo.y, 2);
      expect(n.x).toBeGreaterThan(0);
    });
    const ys = nodos.map((n) => n.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it('devuelve valores concretos conocidos (radio 100, semicírculo, 6 nodos)', () => {
    const [primero, tercero] = posicionesNodos(6, 100, semicirculo);
    expect(primero).toEqual({ indice: 0, angulo: 75, x: 25.88, y: -96.59 });
    expect(tercero).toEqual({ indice: 1, angulo: 45, x: 70.71, y: -70.71 });
  });

  it('nunca devuelve -0', () => {
    for (const n of posicionesNodos(3, 100, { desde: 90, hasta: -90 })) {
      expect(Object.is(n.x, -0)).toBe(false);
      expect(Object.is(n.y, -0)).toBe(false);
    }
  });

  it('rechaza radios inválidos', () => {
    expect(() => posicionNodo(0, 6, -1, semicirculo)).toThrow(RangeError);
    expect(() => posicionNodo(0, 6, Number.NaN, semicirculo)).toThrow(RangeError);
  });
});

describe('separacionEntreNodos', () => {
  it('es la cuerda entre nodos consecutivos', () => {
    // 6 nodos en 180 grados: paso de 30 grados, cuerda = 2 r sen(15 grados).
    expect(separacionEntreNodos(6, 100, semicirculo)).toBeCloseTo(51.76, 2);
  });

  it('con un solo nodo no hay separación que medir', () => {
    expect(separacionEntreNodos(1, 100, semicirculo)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('sectorAnular', () => {
  it('traza el semicírculo entre dos radios con sus dos arcos', () => {
    expect(sectorAnular(30, 60, 90, -90)).toBe(
      'M 0 -60 A 60 60 0 0 1 0 60 L 0 30 A 30 30 0 0 0 0 -30 Z',
    );
  });

  it('marca el arco grande cuando el barrido pasa de 180 grados', () => {
    expect(sectorAnular(10, 20, 100, -100)).toContain('A 20 20 0 1 1');
  });
});

describe('segmentosDeAnillo', () => {
  it('devuelve un segmento por parte, empezando arriba en sentido horario', () => {
    const segmentos = segmentosDeAnillo(6, 33, 36);
    expect(segmentos).toHaveLength(6);
    // El primero va de 4 a 56 grados en sentido horario desde las 12 en punto:
    // (36 + 33 sen 4, 36 - 33 cos 4) hasta (36 + 33 sen 56, 36 - 33 cos 56).
    expect(segmentos[0]).toBe('M 38.3 3.08 A 33 33 0 0 1 63.36 17.55');
    for (const d of segmentos) expect(d).toMatch(/^M [\d.]+ [\d.]+ A 33 33 0 0 1 [\d.]+ [\d.]+$/);
  });
});

describe('calcularDisposicion: modo', () => {
  it('cambia a escritorio desde el breakpoint md (768 px)', () => {
    expect(calcularDisposicion({ ancho: ANCHO_ESCRITORIO - 1, alto: 800, total: 6 }).modo).toBe(
      'movil',
    );
    expect(calcularDisposicion({ ancho: ANCHO_ESCRITORIO, alto: 800, total: 6 }).modo).toBe(
      'escritorio',
    );
  });

  it('escritorio usa el semicírculo derecho y móvil un cuarto de círculo hacia arriba', () => {
    const e = calcularDisposicion({ ancho: 1280, alto: 800, total: 6 });
    const m = calcularDisposicion({ ancho: 390, alto: 844, total: 6 });
    expect(e.arco).toEqual({ desde: 90, hasta: -90 });
    expect(m.arco.desde).toBeGreaterThan(m.arco.hasta);
    expect(m.arco.hasta).toBeGreaterThan(0);
    expect(e.nodos).toHaveLength(6);
    expect(m.nodos.every((n) => n.y < 0)).toBe(true);
  });
});

describe('calcularDisposicion: encaje en pantalla', () => {
  const escritorios = [
    [1280, 800],
    [1024, 768],
    [1920, 1080],
    [844, 390],
    [768, 500],
  ] as const;
  const moviles = [
    [360, 640],
    [375, 667],
    [390, 844],
    [412, 915],
    [430, 932],
    [767, 1024],
  ] as const;

  it.each([...escritorios, ...moviles])('%d x %d: los nodos no se pisan (>= 44 px)', (a, b) => {
    const d = calcularDisposicion({ ancho: a, alto: b, total: 6 });
    expect(separacionEntreNodos(6, d.radio, d.arco)).toBeGreaterThanOrEqual(TAM_NODO);
  });

  it.each([...escritorios, ...moviles])('%d x %d: los nodos no tocan el botón central', (a, b) => {
    const d = calcularDisposicion({ ancho: a, alto: b, total: 6 });
    const minimo = TAM_CONTROL / 2 + TAM_NODO / 2 + 8;
    for (const n of d.nodos) expect(Math.hypot(n.x, n.y)).toBeGreaterThanOrEqual(minimo);
  });

  it.each([...escritorios, ...moviles])(
    '%d x %d: cada píldora cabe entre el borde izquierdo y el derecho',
    (a, b) => {
      const d = calcularDisposicion({ ancho: a, alto: b, total: 6 });
      d.nodos.forEach((n, i) => {
        const izquierda = CENTRO_X + n.x - TAM_NODO / 2;
        expect(izquierda).toBeGreaterThanOrEqual(0);
        expect(izquierda + d.anchoMaximo[i]!).toBeLessThanOrEqual(a - MARGEN_DERECHO);
      });
    },
  );

  it.each(moviles.filter(([a]) => a >= 360))(
    '%d x %d: en móvil cada etiqueta conserva al menos 100 px de texto',
    (a, b) => {
      const d = calcularDisposicion({ ancho: a, alto: b, total: 6 });
      // Ancho de píldora menos el disco del nodo (42 px) y el relleno de la etiqueta (18 px).
      for (const ancho of d.anchoMaximo) expect(ancho - 42 - 18).toBeGreaterThanOrEqual(90);
    },
  );

  it.each(escritorios)('%d x %d: en escritorio el nodo más alto queda bajo la cabecera', (a, b) => {
    const d = calcularDisposicion({ ancho: a, alto: b, total: 6 });
    const arriba = b / 2 + d.nodos[0]!.y - TAM_NODO / 2;
    expect(arriba).toBeGreaterThanOrEqual(ALTO_CABECERA);
    const abajo = b / 2 + d.nodos[5]!.y + TAM_NODO / 2;
    expect(abajo).toBeLessThanOrEqual(b);
  });

  it.each(moviles.filter(([, b]) => b >= 640))(
    '%d x %d: en móvil el nodo más alto queda bajo la cabecera y el último sobre el botón del mentor',
    (a, b) => {
      const d = calcularDisposicion({ ancho: a, alto: b, total: 6 });
      // Centro del control a 44 px del borde inferior (16 px de margen + 28 de radio).
      const desdeAbajo = (n: { y: number }) => 44 - n.y;
      expect(b - (desdeAbajo(d.nodos[0]!) + TAM_NODO / 2)).toBeGreaterThanOrEqual(ALTO_CABECERA);
      // El botón del mentor ocupa los 72 px inferiores de la esquina derecha.
      expect(desdeAbajo(d.nodos[5]!) - TAM_NODO / 2).toBeGreaterThanOrEqual(76);
    },
  );

  it('reduce el radio del escritorio en ventanas bajas y lo limita en las altas', () => {
    const baja = calcularDisposicion({ ancho: 1024, alto: 420, total: 6 });
    const alta = calcularDisposicion({ ancho: 1024, alto: 1400, total: 6 });
    expect(baja.radio).toBeLessThan(alta.radio);
    expect(alta.radio).toBe(160);
    expect(baja.radio).toBeGreaterThanOrEqual(96);
  });

  it('el sector de fondo rodea a los nodos sin invadir el botón central', () => {
    const d = calcularDisposicion({ ancho: 1024, alto: 768, total: 6 });
    expect(d.sector.exterior).toBeGreaterThan(d.radio + TAM_NODO / 2);
    expect(d.sector.interior).toBeLessThan(d.radio - TAM_NODO / 2);
    expect(d.sector.interior).toBeGreaterThan(TAM_CONTROL / 2);
  });
});
