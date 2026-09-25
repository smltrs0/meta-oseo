import { describe, expect, it, vi } from 'vitest';
import {
  ErrorModelo,
  ROTACION_X_BODYPARTS3D,
  crearGeometriaMandibula,
  descargarModelo,
} from './stl';
import type { ProgresoDescarga } from './stl';
import { respuestaFalsa, stlAscii, stlBinario, triangulosDeCaja, trocear } from './stlDePrueba';

/** Caja más alta (Z) que ancha, lejos del origen y en unidades de BodyParts3D (mm). */
const CAJA = triangulosDeCaja([10, -130, 1450], [100, 60, 80]);

describe('crearGeometriaMandibula', () => {
  it('parsea un STL binario, suelda vértices y cuenta triángulos', () => {
    const modelo = crearGeometriaMandibula(stlBinario(CAJA));
    expect(modelo.triangulos).toBe(12);
    expect(modelo.vertices).toBe(8); // 36 vértices de STL soldados en los 8 de la caja
    expect(modelo.geometria.index).not.toBeNull();
  });

  it('centra el modelo en el origen y lo normaliza a una esfera de radio 1', () => {
    const { geometria, radioOriginal } = crearGeometriaMandibula(stlBinario(CAJA));
    expect(radioOriginal).toBeCloseTo(Math.hypot(50, 30, 40), 3); // media diagonal de la caja
    expect(geometria.boundingSphere?.radius).toBeCloseTo(1, 5);
    const centro = geometria.boundingSphere?.center;
    expect(centro?.x).toBeCloseTo(0, 5);
    expect(centro?.y).toBeCloseTo(0, 5);
    expect(centro?.z).toBeCloseTo(0, 5);
  });

  it('orienta el eje Z anatómico (arriba) hacia Y de three.js', () => {
    expect(ROTACION_X_BODYPARTS3D).toBeCloseTo(-Math.PI / 2);
    const { geometria } = crearGeometriaMandibula(stlBinario(CAJA));
    const caja = geometria.boundingBox!;
    const ancho = caja.max.x - caja.min.x;
    const alto = caja.max.y - caja.min.y;
    const fondo = caja.max.z - caja.min.z;
    // 100 : 80 : 60 en X : Z original : Y original.
    expect(alto / ancho).toBeCloseTo(0.8, 5);
    expect(fondo / ancho).toBeCloseTo(0.6, 5);
  });

  it('el frente anatómico (Y negativo) queda hacia la cámara (Z positivo)', () => {
    // Un triángulo delantero (Y = -100) y otro trasero (Y = -60), a la misma altura.
    const modelo = crearGeometriaMandibula(
      stlBinario([
        [
          [0, -100, 1400],
          [10, -100, 1400],
          [0, -100, 1410],
        ],
        [
          [0, -60, 1400],
          [10, -60, 1400],
          [0, -60, 1410],
        ],
      ]),
    );
    const posiciones = modelo.geometria.getAttribute('position');
    // El soldado conserva el orden de primera aparición: los vértices 0-2 son del triángulo
    // delantero y los 3-5 del trasero. Tras centrar, el delantero queda en z > 0.
    expect(posiciones.count).toBe(6);
    expect(posiciones.getZ(0)).toBeGreaterThan(0);
    expect(posiciones.getZ(3)).toBeLessThan(0);
    expect(posiciones.getZ(0)).toBeGreaterThan(posiciones.getZ(3));
  });

  it('calcula normales suaves y unitarias', () => {
    const { geometria } = crearGeometriaMandibula(stlBinario(CAJA));
    const normales = geometria.getAttribute('normal');
    expect(normales.count).toBe(8);
    for (let i = 0; i < normales.count; i++) {
      const largo = Math.hypot(normales.getX(i), normales.getY(i), normales.getZ(i));
      expect(largo).toBeCloseTo(1, 5);
    }
    // Sin colores por vértice: se descartaron para poder soldar.
    expect(geometria.getAttribute('color')).toBeUndefined();
  });

  it('acepta STL ASCII', () => {
    const modelo = crearGeometriaMandibula(stlAscii());
    expect(modelo.triangulos).toBe(1);
    expect(modelo.geometria.boundingSphere?.radius).toBeCloseTo(1, 5);
  });

  it('rechaza contenido que no es un STL (bytes de menos, HTML, sin triángulos)', () => {
    expect(() => crearGeometriaMandibula(new ArrayBuffer(10))).toThrow(ErrorModelo);
    const html = new TextEncoder().encode(`<!doctype html><html>${' '.repeat(120)}</html>`);
    expect(() => crearGeometriaMandibula(html.buffer as ArrayBuffer)).toThrow(ErrorModelo);
    expect(() => crearGeometriaMandibula(stlBinario([]))).toThrow(ErrorModelo);
  });

  it('el error lleva un mensaje para el estudiante, sin detalle técnico', () => {
    try {
      crearGeometriaMandibula(new ArrayBuffer(10));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorModelo);
      expect((error as ErrorModelo).message).toMatch(/no es válido/);
      expect((error as ErrorModelo).name).toBe('ErrorModelo');
    }
  });
});

describe('descargarModelo', () => {
  const bytes = stlBinario(CAJA);

  it('devuelve los bytes completos y avisa del progreso por fragmentos', async () => {
    const fragmentos = trocear(bytes, 200);
    const fetchFn = vi.fn(async () =>
      respuestaFalsa({ longitud: bytes.byteLength, fragmentos }),
    ) as unknown as typeof fetch;
    const progresos: ProgresoDescarga[] = [];

    const resultado = await descargarModelo('/models/x.stl', {
      fetchFn,
      onProgreso: (p) => progresos.push(p),
    });

    expect(new Uint8Array(resultado)).toEqual(new Uint8Array(bytes));
    expect(progresos[0]).toEqual({ cargado: 0, total: bytes.byteLength, fraccion: 0 });
    expect(progresos.at(-1)).toEqual({
      cargado: bytes.byteLength,
      total: bytes.byteLength,
      fraccion: 1,
    });
    const fracciones = progresos.map((p) => p.fraccion ?? -1);
    expect([...fracciones].sort((a, b) => a - b)).toEqual(fracciones); // nunca retrocede
  });

  it('sin Content-Length el progreso es indeterminado (fracción null)', async () => {
    const progresos: ProgresoDescarga[] = [];
    await descargarModelo('/x.stl', {
      fetchFn: (async () =>
        respuestaFalsa({ fragmentos: trocear(bytes, 300) })) as unknown as typeof fetch,
      onProgreso: (p) => progresos.push(p),
    });
    expect(progresos.every((p) => p.total === null && p.fraccion === null)).toBe(true);
    expect(progresos.at(-1)?.cargado).toBe(bytes.byteLength);
  });

  it('nunca pasa del 100 % aunque el servidor comprima y anuncie menos bytes', async () => {
    const progresos: ProgresoDescarga[] = [];
    await descargarModelo('/x.stl', {
      fetchFn: (async () =>
        respuestaFalsa({
          longitud: 100,
          fragmentos: trocear(bytes, 400),
        })) as unknown as typeof fetch,
      onProgreso: (p) => progresos.push(p),
    });
    expect(Math.max(...progresos.map((p) => p.fraccion ?? 0))).toBe(1);
  });

  it('sin ReadableStream usa arrayBuffer() y notifica el 100 %', async () => {
    const progresos: ProgresoDescarga[] = [];
    const resultado = await descargarModelo('/x.stl', {
      fetchFn: (async () =>
        respuestaFalsa({
          sinCuerpo: true,
          fragmentos: [new Uint8Array(bytes)],
        })) as unknown as typeof fetch,
      onProgreso: (p) => progresos.push(p),
    });
    expect(resultado.byteLength).toBe(bytes.byteLength);
    expect(progresos).toEqual([
      { cargado: bytes.byteLength, total: bytes.byteLength, fraccion: 1 },
    ]);
  });

  it('un error HTTP se convierte en ErrorModelo con el código', async () => {
    const fetchFn = (async () =>
      respuestaFalsa({ ok: false, status: 404 })) as unknown as typeof fetch;
    await expect(descargarModelo('/x.stl', { fetchFn })).rejects.toThrow(/error 404/);
    await expect(descargarModelo('/x.stl', { fetchFn })).rejects.toBeInstanceOf(ErrorModelo);
  });

  it('una página HTML con 200 (fallback de la SPA) no se toma por el modelo', async () => {
    const fetchFn = (async () =>
      respuestaFalsa({ tipo: 'text/html; charset=utf-8' })) as unknown as typeof fetch;
    await expect(descargarModelo('/x.stl', { fetchFn })).rejects.toThrow(/no está disponible/);
  });

  it('un fallo de red se convierte en ErrorModelo y conserva la causa', async () => {
    const causa = new TypeError('Failed to fetch');
    const fetchFn = (async () => {
      throw causa;
    }) as unknown as typeof fetch;
    const error = await descargarModelo('/x.stl', { fetchFn }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorModelo);
    expect((error as ErrorModelo).message).toMatch(/Revisa tu conexión/);
    expect((error as ErrorModelo).causa).toBe(causa);
  });

  it('un corte a mitad de la descarga se informa como interrupción', async () => {
    const respuesta = respuestaFalsa({ fragmentos: [new Uint8Array(10)] });
    let lecturas = 0;
    (respuesta.body as unknown as { getReader: () => unknown }).getReader = () => ({
      read: async () => {
        lecturas += 1;
        if (lecturas === 1) return { done: false, value: new Uint8Array(10) };
        throw new TypeError('network error');
      },
    });
    const fetchFn = (async () => respuesta) as unknown as typeof fetch;
    await expect(descargarModelo('/x.stl', { fetchFn })).rejects.toThrow(/interrumpió/);
  });

  it('una cancelación se propaga tal cual (no es un error para el estudiante)', async () => {
    const control = new AbortController();
    const abortar = new DOMException('cancelado', 'AbortError');
    const fetchFn = vi.fn(async () => {
      control.abort();
      throw abortar;
    }) as unknown as typeof fetch;
    const error = await descargarModelo('/x.stl', { fetchFn, signal: control.signal }).catch(
      (e: unknown) => e,
    );
    expect(error).toBe(abortar);
    expect(error).not.toBeInstanceOf(ErrorModelo);
  });

  it('pasa la señal de cancelación a fetch', async () => {
    const control = new AbortController();
    const fetchFn = vi.fn(async () =>
      respuestaFalsa({ fragmentos: [new Uint8Array(bytes)] }),
    ) as unknown as typeof fetch;
    await descargarModelo('/models/x.stl', { fetchFn, signal: control.signal });
    expect(fetchFn).toHaveBeenCalledWith('/models/x.stl', { signal: control.signal });
  });
});
