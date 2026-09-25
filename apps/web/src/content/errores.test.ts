import { describe, expect, it } from 'vitest';
import { describirRuta, formatearErrores } from './errores';
import { ModuloContenidoSchema } from './schema';
import {
  agregarA,
  fijar,
  muestra,
  rutaActividad,
  validar,
  validarCon,
} from './__fixtures__/utiles';

describe('describirRuta', () => {
  const datos = muestra();

  it('pone el id de cada elemento de lista, y el de la actividad en los bloques', () => {
    const ruta = [
      ...rutaActividad(datos, 'm1_quiz_repaso'),
      'config',
      'preguntas',
      1,
      'correctas',
      0,
    ];
    expect(describirRuta(ruta, datos)).toBe(
      'secciones[3]{repaso}.bloques[2]{m1_quiz_repaso}.actividad.config.preguntas[1]{qr_p2}.correctas[0]',
    );
  });

  it('funciona con rutas cortas, vacías o que no existen', () => {
    expect(describirRuta([], datos)).toBe('(raíz del módulo)');
    expect(describirRuta(['titulo'], datos)).toBe('titulo');
    expect(describirRuta(['secciones', 99, 'id'], datos)).toBe('secciones[99].id');
    expect(describirRuta(['x', 'y'], null)).toBe('x.y');
  });
});

describe('formatearErrores', () => {
  function lineas(datos: unknown): string[] {
    const r = ModuloContenidoSchema.safeParse(datos);
    if (r.success) throw new Error('Se esperaba un error');
    return formatearErrores(r.error, datos);
  }

  it('describe dónde está el error con la ruta y los ids', () => {
    const datos = muestra();
    fijar(
      datos,
      [...rutaActividad(datos, 'm1_quiz_repaso'), 'config', 'preguntas', 0, 'correctas'],
      ['qr_p1_z'],
    );
    expect(lineas(datos)).toEqual([
      'secciones[3]{repaso}.bloques[2]{m1_quiz_repaso}.actividad.config.preguntas[0]{qr_p1}.correctas[0]: La opción correcta "qr_p1_z" no existe en "opciones".',
    ]);
  });

  it('traduce "campo faltante" y "tipo equivocado"', () => {
    const datos = muestra();
    delete (datos as Record<string, unknown>).subtitulo;
    fijar(datos, ['duracion_estimada_min'], 'cuarenta');
    fijar(datos, ['glosario'], 'no es una lista');
    const salida = lineas(datos);
    expect(salida).toContain('subtitulo: Falta este campo obligatorio.');
    expect(salida).toContain('duracion_estimada_min: Se esperaba un número y hay "cuarenta".');
    expect(salida).toContain('glosario: Se esperaba una lista y hay "no es una lista".');
  });

  it('traduce límites de tamaño, valores no permitidos y campos desconocidos', () => {
    const datos = muestra();
    fijar(datos, ['duracion_estimada_min'], 1);
    fijar(datos, ['glosario'], []);
    fijar(datos, ['estado_revision', 'estado'], 'publicado');
    fijar(datos, ['inventado'], 1);
    const salida = lineas(datos);
    expect(salida).toContain('duracion_estimada_min: Debe ser mayor o igual que 5.');
    expect(salida).toContain('glosario: Debe tener al menos 3 elementos.');
    expect(salida.find((l) => l.startsWith('estado_revision.estado:'))).toContain(
      'Valor no permitido (hay "publicado"). Valores válidos: borrador, revisado_docente, aprobado.',
    );
    expect(salida.find((l) => l.startsWith('(raíz del módulo):'))).toContain(
      'Campo(s) desconocido(s): "inventado"',
    );
  });

  it('traduce el discriminador desconocido y los textos demasiado largos o cortos', () => {
    const datos = muestra();
    fijar(datos, ['secciones', 0, 'bloques', 0, 'tipo'], 'video');
    const salida = lineas(datos);
    const linea = salida.find((l) => l.includes('bloques[0]{t_tejido_vivo}.tipo'));
    expect(linea).toContain(
      'El valor de "tipo" no es válido (hay "video"); debe ser "texto" | "imagen"',
    );

    const largo = muestra();
    fijar(largo, ['secciones', 0, 'titulo'], 'x'.repeat(101));
    expect(lineas(largo)).toContain('secciones[0]{tejido_dinamico}.titulo: Máximo 100 caracteres.');
  });

  it('conserva los mensajes ya escritos en español y no repite líneas', () => {
    const datos = muestra();
    agregarA(datos, ['glosario'], {
      id: 'periostio',
      termino: 'Periostio (repetido)',
      definicion: 'Una definición repetida del mismo término.',
    });
    const salida = lineas(datos);
    expect(salida).toEqual(['glosario: Id duplicado "periostio" en "glosario".']);
  });

  it('limita la cantidad de líneas y avisa de cuántas quedaron fuera', () => {
    const datos = muestra();
    for (let i = 0; i < 30; i++) agregarA(datos, ['objetivos'], 'corto');
    const r = ModuloContenidoSchema.safeParse(datos);
    if (r.success) throw new Error('debía fallar');
    const salida = formatearErrores(r.error, datos, 5);
    expect(salida).toHaveLength(6);
    expect(salida[5]).toMatch(/^\.\.\. y \d+ error\(es\) más\.$/);
  });

  it('con una entrada que no es un objeto no lanza y explica el problema', () => {
    for (const basura of [null, 'texto', 42, [], true]) {
      const r = validar(basura);
      expect(r.ok).toBe(false);
      expect(r.errores).toHaveLength(1);
      expect(r.errores[0]).toContain('Se esperaba un objeto');
    }
    expect(validar(undefined).errores).toEqual(['(raíz del módulo): El contenido está vacío.']);
  });

  it('cada línea sale de una ruta que existe o falta: validarCon muestra la ruta legible', () => {
    const r = validarCon((d) => fijar(d, ['secciones', 1, 'bloques', 0, 'markdown'], 'corto'));
    expect(r.errores[0]).toContain(
      'secciones[1]{funciones}.bloques[0]{t_funciones}.markdown: Mínimo 20 caracteres.',
    );
  });
});
