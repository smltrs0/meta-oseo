import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODULOS } from '@/data/modulos';
import {
  cargarModulo,
  crearRegistro,
  hayContenido,
  listarModulos,
  rutasNoReconocidas,
} from './registry';
import { fijar, muestra, validar } from './__fixtures__/utiles';

const RUTA_M1 = '../modules/m1_conociendo_el_hueso/content.json';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registro con el glob vacío (hoy no hay ningún módulo)', () => {
  const registro = crearRegistro({}, { registrarErrores: false });

  it('no lista ningún módulo y no lanza', () => {
    expect(registro.listarModulos()).toEqual([]);
    expect(registro.rutasNoReconocidas()).toEqual([]);
    for (let n = 0; n <= 7; n++) expect(registro.hayContenido(n)).toBe(false);
  });

  it('cargar un módulo oficial sin contenido da "sin_contenido" con un mensaje para el estudiante', async () => {
    const r = await registro.cargarModulo(1);
    expect(r).toMatchObject({ ok: false, motivo: 'sin_contenido', errores: [] });
    if (!r.ok) expect(r.mensaje).toMatch(/todavía no está disponible/);
  });

  it.each([0, 7, -1, 1.5, NaN, Infinity])('el número %s no es un módulo', async (n) => {
    const r = await registro.cargarModulo(n);
    expect(r).toMatchObject({ ok: false, motivo: 'numero_invalido' });
  });
});

describe('registro con el módulo de muestra', () => {
  it('lista el módulo con su carpeta y su slug oficial', () => {
    const registro = crearRegistro(
      { [RUTA_M1]: () => Promise.resolve(muestra()) },
      { registrarErrores: false },
    );
    expect(registro.listarModulos()).toEqual([
      { numero: 1, slug: 'conociendo_el_hueso', carpeta: 'm1_conociendo_el_hueso' },
    ]);
    expect(registro.hayContenido(1)).toBe(true);
    expect(registro.hayContenido(2)).toBe(false);
  });

  it('carga, valida y devuelve el módulo con los valores por defecto aplicados', async () => {
    const registro = crearRegistro(
      { [RUTA_M1]: () => Promise.resolve(muestra()) },
      { registrarErrores: false },
    );
    const r = await registro.cargarModulo(1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.modulo).toEqual(validar(muestra()).modulo);
    expect(r.entrada.numero).toBe(1);
    expect(r.modulo.secciones).toHaveLength(4);
  });

  it('no vuelve a cargar un módulo ya cargado (una petición por módulo)', async () => {
    const cargador = vi.fn(() => Promise.resolve(muestra()));
    const registro = crearRegistro({ [RUTA_M1]: cargador }, { registrarErrores: false });
    const [a, b] = await Promise.all([registro.cargarModulo(1), registro.cargarModulo(1)]);
    const c = await registro.cargarModulo(1);
    expect(cargador).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a).toBe(c);
    registro.limpiarCache();
    await registro.cargarModulo(1);
    expect(cargador).toHaveBeenCalledTimes(2);
  });

  it('un contenido inválido devuelve errores legibles con ruta e ids, y no se recuerda (se puede reintentar)', async () => {
    const roto = muestra();
    fijar(
      roto,
      ['secciones', 3, 'bloques', 2, 'actividad', 'config', 'preguntas', 0, 'correctas'],
      ['qr_p1_z'],
    );
    const cargador = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(roto)
      .mockResolvedValueOnce(muestra());
    const registro = crearRegistro({ [RUTA_M1]: cargador }, { registrarErrores: false });

    const primero = await registro.cargarModulo(1);
    expect(primero.ok).toBe(false);
    if (primero.ok) return;
    expect(primero.motivo).toBe('contenido_invalido');
    expect(primero.mensaje).toMatch(/no es válido/);
    expect(primero.errores).toEqual([
      'secciones[3]{repaso}.bloques[2]{m1_quiz_repaso}.actividad.config.preguntas[0]{qr_p1}.correctas[0]: La opción correcta "qr_p1_z" no existe en "opciones".',
    ]);

    // Corregido el archivo (recarga en caliente), el segundo intento funciona.
    const segundo = await registro.cargarModulo(1);
    expect(segundo.ok).toBe(true);
    expect(cargador).toHaveBeenCalledTimes(2);
  });

  it('en desarrollo escribe los errores en la consola; con registrarErrores=false, no', async () => {
    const roto = muestra();
    fijar(roto, ['titulo'], 'Otro título');
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await crearRegistro(
      { [RUTA_M1]: () => Promise.resolve(roto) },
      { registrarErrores: false },
    ).cargarModulo(1);
    expect(consola).not.toHaveBeenCalled();

    await crearRegistro(
      { [RUTA_M1]: () => Promise.resolve(roto) },
      { registrarErrores: true },
    ).cargarModulo(1);
    expect(consola).toHaveBeenCalledTimes(1);
    expect(String(consola.mock.calls[0]?.[0])).toContain(
      'm1_conociendo_el_hueso/content.json no es válido',
    );
    expect(String(consola.mock.calls[0]?.[0])).toContain(
      'titulo: El título del módulo 1 debe ser "Conociendo el hueso"',
    );
  });

  it('un fallo de carga (red, importación) es "error_de_carga" y se puede reintentar', async () => {
    const cargador = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce(muestra());
    const registro = crearRegistro({ [RUTA_M1]: cargador }, { registrarErrores: false });
    const fallo = await registro.cargarModulo(1);
    expect(fallo).toMatchObject({ ok: false, motivo: 'error_de_carga' });
    if (!fallo.ok) {
      expect(fallo.mensaje).toMatch(/conexión/);
      expect(fallo.errores).toEqual(['Failed to fetch dynamically imported module']);
    }
    expect((await registro.cargarModulo(1)).ok).toBe(true);
  });

  it('un JSON que no es un objeto no rompe nada', async () => {
    for (const basura of [null, 'texto', 42, [], undefined]) {
      const registro = crearRegistro(
        { [RUTA_M1]: () => Promise.resolve(basura) },
        { registrarErrores: false },
      );
      const r = await registro.cargarModulo(1);
      expect(r).toMatchObject({ ok: false, motivo: 'contenido_invalido' });
    }
  });

  it('el contenido debe ser del módulo de su carpeta', async () => {
    const carpeta2 = '../modules/m2_descubriendo_sus_celulas/content.json';
    // Contenido del módulo 1 dentro de la carpeta del módulo 2.
    const registro = crearRegistro(
      { [carpeta2]: () => Promise.resolve(muestra()) },
      { registrarErrores: false },
    );
    const r = await registro.cargarModulo(2);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('contenido_invalido');
    expect(r.errores.length).toBeGreaterThan(0);
  });
});

describe('descubrimiento de carpetas', () => {
  const vacio = () => Promise.resolve(null);

  it('ordena por número aunque el glob los entregue desordenados', () => {
    const registro = crearRegistro(
      {
        '../modules/m3_construyendo_hueso/content.json': vacio,
        '../modules/m1_conociendo_el_hueso/content.json': vacio,
        '../modules/m2_descubriendo_sus_celulas/content.json': vacio,
      },
      { registrarErrores: false },
    );
    expect(registro.listarModulos().map((m) => m.numero)).toEqual([1, 2, 3]);
  });

  it('reconoce los seis módulos oficiales con el slug de src/data/modulos.ts', () => {
    const cargadores = Object.fromEntries(
      MODULOS.map((m) => [`../modules/m${m.numero}_${m.slug}/content.json`, vacio]),
    );
    const registro = crearRegistro(cargadores, { registrarErrores: false });
    expect(registro.listarModulos().map((m) => m.slug)).toEqual(MODULOS.map((m) => m.slug));
    expect(registro.rutasNoReconocidas()).toEqual([]);
  });

  it('las carpetas con nombre equivocado no se listan y se reportan', () => {
    const registro = crearRegistro(
      {
        '../modules/m1_hueso/content.json': vacio, // slug que no es el oficial
        '../modules/m7_extra/content.json': vacio, // módulo inexistente
        '../modules/modulo1/content.json': vacio, // sin el formato m{n}_{slug}
        '../modules/m2_Descubriendo/content.json': vacio, // mayúsculas
        '../modules/m4_transformando_la_matriz/content.json': vacio, // correcta
      },
      { registrarErrores: false },
    );
    expect(registro.listarModulos().map((m) => m.numero)).toEqual([4]);
    expect(registro.rutasNoReconocidas().sort()).toEqual([
      '../modules/m1_hueso/content.json',
      '../modules/m2_Descubriendo/content.json',
      '../modules/m7_extra/content.json',
      '../modules/modulo1/content.json',
    ]);
    expect(registro.hayContenido(1)).toBe(false);
  });

  it('con dos rutas para el mismo módulo se queda con la primera (por orden alfabético) y reporta la otra', () => {
    const registro = crearRegistro(
      {
        '../modules/m1_conociendo_el_hueso/content.json': vacio,
        './modules/m1_conociendo_el_hueso/content.json': vacio,
      },
      { registrarErrores: false },
    );
    expect(registro.listarModulos()).toHaveLength(1);
    expect(registro.rutasNoReconocidas()).toEqual([
      './modules/m1_conociendo_el_hueso/content.json',
    ]);
  });
});

describe('registro real (import.meta.glob de src/modules)', () => {
  it('funciona con cualquier número de módulos, hoy y mañana', () => {
    const modulos = listarModulos();
    expect(modulos.length).toBeLessThanOrEqual(6);
    const numeros = modulos.map((m) => m.numero);
    expect([...numeros].sort((a, b) => a - b)).toEqual(numeros);
    expect(new Set(numeros).size).toBe(numeros.length);
    for (const m of modulos) {
      expect(MODULOS.find((o) => o.numero === m.numero)?.slug).toBe(m.slug);
      expect(m.carpeta).toBe(`m${m.numero}_${m.slug}`);
      expect(hayContenido(m.numero)).toBe(true);
    }
    expect(rutasNoReconocidas()).toEqual([]);
  });

  it('un número inválido da "numero_invalido" sin lanzar', async () => {
    expect(await cargarModulo(99)).toMatchObject({ ok: false, motivo: 'numero_invalido' });
  });

  it('un módulo oficial sin contenido da "sin_contenido"; con contenido, se carga y valida', async () => {
    for (const { numero } of MODULOS) {
      const r = await cargarModulo(numero);
      if (hayContenido(numero)) {
        expect(r.ok, JSON.stringify(r)).toBe(true);
      } else {
        expect(r).toMatchObject({ ok: false, motivo: 'sin_contenido' });
      }
    }
  });
});
