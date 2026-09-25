/**
 * Pruebas de la fase de ajuste tras la revisión del esquema: cada bloque corresponde a un hallazgo
 * aceptado (docs/content-schema.md, sección "Decisiones de diseño") y comprueba el comportamiento
 * nuevo con datos concretos.
 */
import { describe, expect, it } from 'vitest';
import { intentoInicial } from '@/activities/types';
import { advertenciasDeModulo, advertenciasEntreModulos } from './auditoria';
import { visibleParaNivel } from './consultas';
import { campoParecido } from './errores';
import { ConfigMulticapaSchema } from './schema';
import {
  actividadSuperada,
  calcularPuntaje,
  ejecucionSinErrores,
  idsSuperadas,
  moduloCompletado,
  seccionCompletada,
} from './scoring';
import { problemasMarkdownBloque, problemasMarkdownLinea, problemasTextoPlano } from './texto';
import {
  agregarA,
  fijar,
  leer,
  muestra,
  rutaActividad,
  rutaBloque,
  validar,
  validarCon,
} from './__fixtures__/utiles';
import type { ResultadoValidacion } from './__fixtures__/utiles';

function esperarError(resultado: ResultadoValidacion, ...fragmentos: string[]): void {
  expect(resultado.ok, 'debía fallar').toBe(false);
  expect(
    resultado.issues.some((i) => fragmentos.every((f) => i.includes(f))),
    `se esperaba un error con ${JSON.stringify(fragmentos)}; hay:\n${resultado.issues.join('\n')}`,
  ).toBe(true);
}

function conActividad(id: string, cambio: (actividad: Record<string, unknown>) => void) {
  return validarCon((d) => cambio(leer(d, rutaActividad(d, id)) as Record<string, unknown>));
}

function conConfig(id: string, cambio: (config: Record<string, unknown>) => void) {
  return conActividad(id, (a) => cambio(a.config as Record<string, unknown>));
}

describe('hallazgo: tope de 600 puntos por módulo', () => {
  it('un módulo de 810 puntos (M5 del guion) es válido; más de 1000, no', () => {
    const conTotal = (total: number) => (d: Record<string, unknown>) => {
      const ids = ['m1_capas_hueso', 'm1_quiz_repaso'];
      void ids;
      const modulo = validar(muestra()).modulo!;
      const todas = modulo.secciones.flatMap((s) =>
        s.bloques.flatMap((b) => (b.tipo === 'actividad' ? [b.actividad.id] : [])),
      );
      todas.forEach((id, i) => {
        const base = Math.floor(total / todas.length);
        const extra = i < total - base * todas.length ? 1 : 0;
        fijar(d, [...rutaActividad(d, id), 'puntaje_max'], base + extra);
      });
    };
    expect(validarCon(conTotal(810)).ok).toBe(true);
    esperarError(validarCon(conTotal(1200)), 'suman 1200 puntos', 'entre 100 y 1000');
  });
});

describe('hallazgo: 3D por ancla', () => {
  const ID = 'm1_explora_mandibula';

  it('un nodo con ancla no necesita estar en el catálogo (zona funcional sobre una malla única)', () => {
    const r = conConfig(ID, (c) => {
      (c.nodos as Record<string, unknown>[]).push({
        id: 'zona_compresion_canino',
        etiqueta: 'Zona de compresión del canino',
        descripcion: 'Lado hacia el que se mueve el diente: el hueso se reabsorbe por presión.',
        ancla: { x: 0.5, y: 0.6, z: 0.95 },
      });
    });
    expect(r.ok, r.errores.join('\n')).toBe(true);
  });

  it('sin ancla, el id tiene que ser un nodo del catálogo y el error propone el ancla', () => {
    const r = conConfig(ID, (c) => {
      (c.nodos as Record<string, unknown>[]).push({
        id: 'cuerpo_molares',
        etiqueta: 'Cuerpo de los molares',
        descripcion: 'Zona posterior del cuerpo, donde se apoyan los molares.',
      });
    });
    esperarError(r, '"cuerpo_molares" no es un nodo del modelo "mandibula"', '"ancla"');
    // El catálogo es lo que F0-08 separa: la escotadura es una muesca, no una pieza.
    esperarError(
      conConfig(ID, (c) => {
        (c.nodos as Record<string, unknown>[])[1]!.id = 'escotadura_mandibular';
      }),
      '"escotadura_mandibular" no es un nodo',
    );
  });

  it('el ancla va de 0 a 1 en cada eje y no existe en el modelo de células', () => {
    esperarError(
      conConfig(ID, (c) => {
        (c.nodos as Record<string, unknown>[])[3]!.ancla = { x: 1.2, y: 0.5, z: 0.5 };
      }),
      'ancla.x',
    );
    esperarError(
      conConfig('m1_explora_celulas', (c) => {
        (c.nodos as Record<string, unknown>[])[0]!.ancla = { x: 0.5, y: 0.5, z: 0.5 };
      }),
      'no admite "ancla"',
    );
  });
});

describe('hallazgo: receptores compartidos y separación en píxeles', () => {
  it('Wnt y esclerostina en el mismo receptor validan (el cambio del validador)', () => {
    const r = conConfig('m1_senales_remodelado', (c) => {
      const moleculas = c.moleculas as Record<string, unknown>[];
      moleculas[2] = {
        id: 'mol_esclerostina',
        etiqueta: 'Esclerostina',
        descripcion: 'Antagonista que compite por el mismo correceptor.',
      };
      c.distractores = [];
      (c.pares as Record<string, unknown>[]).push({
        id: 'par_esclerostina',
        molecula: 'mol_esclerostina',
        receptor: 'rec_rank',
        efecto: {
          titulo: 'El receptor se bloquea',
          descripcion: 'La vía se frena y baja la formación de hueso.',
          animacion: 'inhibicion',
        },
      });
    });
    expect(r.ok, r.errores.join('\n')).toBe(true);
  });
});

describe('hallazgo: cifras de geometría que cita la guía (viewBox 800x600, 320 px de ancho)', () => {
  const ID = 'm1_senales_remodelado';
  const conPosiciones = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    conConfig(ID, (c) => {
      const receptores = c.receptores as { posicion: { x: number; y: number } }[];
      receptores[0]!.posicion = a;
      receptores[1]!.posicion = b;
    });

  it('márgenes: x de 7 a 93 e y de 10 a 90', () => {
    const conA = (x: number, y: number) => conPosiciones({ x, y }, { x: 70, y: 55 });
    expect(conA(7, 55).ok).toBe(true);
    expect(conA(93, 55).ok).toBe(true);
    expect(conA(10, 10).ok).toBe(true);
    expect(conA(10, 90).ok).toBe(true);
    esperarError(conA(6, 55), 'a menos de 22 px de un borde', '"x" debe estar entre 7 y 93');
    esperarError(conA(10, 9), '"y" entre 10 y 90');
    esperarError(conA(94, 55), 'a menos de 22 px de un borde');
  });

  it('separación: 17 puntos en horizontal o 22 en vertical', () => {
    expect(conPosiciones({ x: 40, y: 50 }, { x: 57, y: 50 }).ok).toBe(true);
    esperarError(
      conPosiciones({ x: 40, y: 50 }, { x: 56, y: 50 }),
      'deben separarse al menos 52 px',
    );
    expect(conPosiciones({ x: 50, y: 30 }, { x: 50, y: 52 }).ok).toBe(true);
    esperarError(
      conPosiciones({ x: 50, y: 30 }, { x: 50, y: 51 }),
      'deben separarse al menos 52 px',
    );
  });
});

describe('hallazgo: límites de longitud y tamaño', () => {
  it('instrucciones hasta 400 caracteres', () => {
    const texto = (n: number) => 'a'.repeat(n);
    expect(conActividad('m1_quiz_repaso', (a) => (a.instrucciones = texto(400))).ok).toBe(true);
    esperarError(
      conActividad('m1_quiz_repaso', (a) => (a.instrucciones = texto(401))),
      'instrucciones',
      'Máximo 400',
    );
  });

  it('una multicapa admite hasta 15 capas; 16 no', () => {
    const capas = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `capa_${i}`,
        etiqueta: `Capa ${i}`,
        descripcion: 'Estructura de la red lacuno-canalicular del osteocito.',
      }));
    const config = (n: number) => ({
      svg: '/images/m3/osteocito.svg',
      viewBox: '0 0 800 600',
      alt: 'Osteocito con su red lacuno-canalicular.',
      modo: 'explorar',
      capas: capas(n),
      requeridas: ['capa_0'],
    });
    expect(ConfigMulticapaSchema.safeParse(config(15)).success).toBe(true);
    expect(ConfigMulticapaSchema.safeParse(config(16)).success).toBe(false);
  });

  it('el efecto admite 450 caracteres y la explicación de una pregunta, 600', () => {
    expect(
      conConfig('m1_senales_remodelado', (c) => {
        const pares = c.pares as { efecto: { descripcion: string } }[];
        pares[0]!.efecto.descripcion = 'e'.repeat(450);
      }).ok,
    ).toBe(true);
    esperarError(
      conConfig('m1_senales_remodelado', (c) => {
        const pares = c.pares as { efecto: { descripcion: string } }[];
        pares[0]!.efecto.descripcion = 'e'.repeat(451);
      }),
      'descripcion',
      'Máximo 450',
    );
    const preguntas = (c: Record<string, unknown>) => c.preguntas as { explicacion: string }[];
    expect(
      conConfig('m1_quiz_repaso', (c) => (preguntas(c)[0]!.explicacion = 'x'.repeat(600))).ok,
    ).toBe(true);
    esperarError(
      conConfig('m1_quiz_repaso', (c) => (preguntas(c)[0]!.explicacion = 'x'.repeat(601))),
      'explicacion',
      'Máximo 600',
    );
  });
});

describe('hallazgo: marcas [verificar] y pendientes de revisión', () => {
  it.each([
    ['plano', (t: string) => problemasTextoPlano(t)],
    ['línea', (t: string) => problemasMarkdownLinea(t)],
    ['bloque', (t: string) => problemasMarkdownBloque(t, { titulos: true })],
  ])('la marca "[verificar]" se rechaza en texto %s', (_nombre, revisar) => {
    for (const texto of [
      'Dura unas 3 semanas [verificar].',
      'Dura 3 semanas [Verificar: fuente].',
    ]) {
      const problemas = revisar(texto);
      expect(
        problemas.some((p) => p.includes('estado_revision.pendientes')),
        texto,
      ).toBe(true);
    }
    expect(revisar('Dura unas 3 semanas.')).toEqual([]);
    // Un enlace cuyo destino contiene la palabra no es la marca (en texto plano no hay enlaces).
    if (_nombre !== 'plano') {
      expect(revisar('Un [enlace](https://ejemplo.org/verificar) normal.')).toEqual([]);
    }
  });

  it('la marca en un campo del módulo es un error con la ruta y el id', () => {
    const r = validarCon((d) =>
      fijar(
        d,
        [...rutaBloque(d, 't_funciones'), 'markdown'],
        'El ciclo dura unas 3 semanas [verificar] en total.',
      ),
    );
    esperarError(r, 'markdown', '[verificar]');
    expect(r.errores.some((l) => l.includes('{t_funciones}'))).toBe(true);
  });

  it('los pendientes apuntan a elementos que existen (bloque, actividad, glosario, referencia...)', () => {
    const existentes = validarCon((d) =>
      fijar(
        d,
        ['estado_revision', 'pendientes'],
        [
          { id: 'c_calcio', nota: 'Confirmar la cifra del 99 % de calcio.' },
          { id: 'm1_quiz_repaso', nota: 'Revisar dificultad de las preguntas.' },
          { id: 'osteoblasto', nota: 'Comparar la definición con la del módulo 2.' },
          { id: 'ref_junqueira', nota: 'Confirmar la edición citada.' },
          { id: 'c_calcio', nota: 'Segunda duda sobre el mismo bloque.' },
        ],
      ),
    );
    expect(existentes.ok, existentes.errores.join('\n')).toBe(true);
    const r = validarCon((d) =>
      fijar(
        d,
        ['estado_revision', 'pendientes'],
        [{ id: 'c_no_existe', nota: 'Duda sin destino.' }],
      ),
    );
    esperarError(r, 'pendientes.0.id', '"c_no_existe"');
  });

  it('los pendientes son opcionales (por defecto, ninguno) y admiten hasta 250', () => {
    const modulo = validar(
      (() => {
        const d = muestra();
        delete (leer(d, ['estado_revision']) as Record<string, unknown>).pendientes;
        return d;
      })(),
    ).modulo!;
    expect(modulo.estado_revision.pendientes).toEqual([]);
    esperarError(
      validarCon((d) =>
        fijar(
          d,
          ['estado_revision', 'pendientes'],
          Array.from({ length: 251 }, () => ({
            id: 'c_calcio',
            nota: 'Duda repetida sobre lo mismo.',
          })),
        ),
      ),
      'pendientes',
      'Too big',
    );
  });
});

describe('hallazgo: nivel (posgrado) y dificultad de las preguntas', () => {
  it('un bloque de lectura puede ser de posgrado; el valor "pregrado" no existe', () => {
    esperarError(
      validarCon((d) => fijar(d, [...rutaBloque(d, 'c_calcio'), 'nivel'], 'pregrado')),
      'nivel',
    );
    const modulo = validar(muestra()).modulo!;
    const callout = modulo.secciones
      .flatMap((s) => s.bloques)
      .find((b) => b.tipo === 'callout' && b.nivel);
    expect(callout?.tipo === 'callout' && callout.nivel).toBe('posgrado');
  });

  it('visibleParaNivel: sin nivel, para todos; de posgrado, solo para posgrado; las actividades siempre', () => {
    const modulo = validar(muestra()).modulo!;
    const bloques = modulo.secciones.flatMap((s) => s.bloques);
    const deposgrado = bloques.find((b) => b.tipo === 'callout' && b.nivel === 'posgrado')!;
    const normal = bloques.find((b) => b.tipo === 'texto')!;
    const actividad = bloques.find((b) => b.tipo === 'actividad')!;
    expect(visibleParaNivel(deposgrado, 'pregrado')).toBe(false);
    expect(visibleParaNivel(deposgrado, 'posgrado')).toBe(true);
    expect(visibleParaNivel(normal, 'pregrado')).toBe(true);
    expect(visibleParaNivel(actividad, 'pregrado')).toBe(true);
  });

  it('la dificultad de una pregunta es un entero de 1 a 3', () => {
    const preguntas = (c: Record<string, unknown>) => c.preguntas as Record<string, unknown>[];
    for (const valida of [1, 2, 3]) {
      expect(
        conConfig('m1_quiz_repaso', (c) => (preguntas(c)[0]!.dificultad = valida)).ok,
        String(valida),
      ).toBe(true);
    }
    for (const invalida of [0, 4, 1.5, 'alta']) {
      esperarError(
        conConfig('m1_quiz_repaso', (c) => (preguntas(c)[0]!.dificultad = invalida)),
        'dificultad',
      );
    }
    // Los tres formatos la admiten.
    expect(
      conConfig('m1_quiz_repaso', (c) => {
        for (const p of preguntas(c)) p.dificultad = 3;
      }).ok,
    ).toBe(true);
  });
});

describe('hallazgo: unicidad por actividad y mentor', () => {
  it('los ids de opción se pueden repetir en dos quizzes: el mentor no los recibe sueltos', () => {
    const r = validarCon((d) => {
      const original = leer(d, rutaActividad(d, 'm1_quiz_repaso')) as {
        config: { preguntas: { id: string }[] };
      };
      const copia = structuredClone(original) as unknown as typeof original & { id: string };
      copia.id = 'm1_quiz_segundo';
      copia.config.preguntas.forEach((p, i) => (p.id = `segundo_p${i + 1}`));
      agregarA(d, ['secciones', 3, 'bloques'], { tipo: 'actividad', actividad: copia });
    });
    expect(r.ok, r.errores.join('\n')).toBe(true);
  });
});

describe('hallazgo: tablas', () => {
  it('admiten hasta 6 columnas y un encabezado para la columna de criterios', () => {
    const tabla = (n: number) => (d: Record<string, unknown>) => {
      const ruta = rutaBloque(d, 'tb_compacto_esponjoso');
      fijar(
        d,
        [...ruta, 'columnas'],
        Array.from({ length: n }, (_, i) => `Fase ${i + 1}`),
      );
      const filas = leer(d, [...ruta, 'filas']) as { celdas: string[] }[];
      for (const fila of filas) fila.celdas = Array.from({ length: n }, (_, i) => `Dato ${i + 1}`);
    };
    expect(validarCon(tabla(5)).ok).toBe(true);
    expect(validarCon(tabla(6)).ok).toBe(true);
    esperarError(validarCon(tabla(7)), 'columnas', 'Too big');
    const modulo = validar(muestra()).modulo!;
    const t = modulo.secciones.flatMap((s) => s.bloques).find((b) => b.tipo === 'tabla');
    expect(t?.tipo === 'tabla' && t.encabezado_criterio).toBe('Criterio');
  });
});

describe('hallazgo: multicapa con varias consignas por capa', () => {
  it('pistas_extra (hasta 2) necesita la pista principal', () => {
    const conPistas = conConfig('m1_identifica_celulas', () => undefined);
    expect(conPistas.ok, conPistas.errores.join('\n')).toBe(true);
    esperarError(
      conConfig('m1_identifica_celulas', (c) => {
        const capa = (c.capas as Record<string, unknown>[])[2]!;
        capa.pistas_extra = ['Una más.  ......', 'Otra más.  ......', 'Y otra más.  .....'];
      }),
      'pistas_extra',
      'Too big',
    );
    esperarError(
      conConfig('m1_identifica_celulas', (c) => {
        const capa = (c.capas as Record<string, unknown>[])[2]!;
        delete capa.pista;
      }),
      'pistas_extra',
      'necesita también "pista"',
    );
  });
});

describe('hallazgo: cada sección debe exigir algo', () => {
  it('una sección sin actividades obligatorias es un error', () => {
    const r = validarCon((d) => {
      // La sección 0 tiene una sola obligatoria (m1_capas_hueso): se vuelve opcional.
      fijar(d, [...rutaActividad(d, 'm1_capas_hueso'), 'obligatoria'], false);
    });
    esperarError(r, 'secciones.0', 'no tiene ninguna actividad obligatoria');
    expect(r.errores.some((l) => l.includes('{tejido_dinamico}'))).toBe(true);
  });
});

describe('hallazgo: quiz con varias correctas', () => {
  const preguntaDe = (c: Record<string, unknown>) => (c.preguntas as Record<string, unknown>[])[1]!;

  it('exige tantas incorrectas como correctas para que marcar todo no puntúe', () => {
    esperarError(
      conConfig('m1_quiz_repaso', (c) => {
        const p = preguntaDe(c);
        p.opciones = [
          { id: 'qr_p2_a', texto: 'Sostén y protección mecánica' },
          { id: 'qr_p2_b', texto: 'Reservorio de calcio y fósforo' },
          { id: 'qr_p2_c', texto: 'Alojar la médula ósea' },
          { id: 'qr_p2_d', texto: 'Producir bilis' },
        ];
        p.correctas = ['qr_p2_a', 'qr_p2_b', 'qr_p2_c'];
      }),
      'opciones',
      'hacen falta al menos 3 incorrectas',
    );
    // Con una sola correcta basta con una incorrecta.
    expect(conConfig('m1_quiz_repaso', () => undefined).ok).toBe(true);
  });
});

describe('hallazgo: umbral de aprobación (aprobacion_min)', () => {
  it('es válido en una actividad obligatoria que puede fallar, sobre la precisión', () => {
    const r = conActividad('m1_quiz_repaso', (a) => (a.aprobacion_min = 0.7));
    expect(r.ok, r.errores.join('\n')).toBe(true);
  });

  it('se rechaza en actividades que no pueden fallar, en opcionales y fuera de 0,5 a 1', () => {
    esperarError(
      conActividad('m1_capas_hueso', (a) => (a.aprobacion_min = 0.7)),
      'aprobacion_min',
      'precisión es siempre 1',
    );
    esperarError(
      conActividad('m1_explora_mandibula', (a) => (a.aprobacion_min = 0.7)),
      'aprobacion_min',
    );
    esperarError(
      conActividad('m1_quiz_repaso', (a) => {
        a.aprobacion_min = 0.7;
        a.obligatoria = false;
      }),
      'aprobacion_min',
      'solo se usa en actividades obligatorias',
    );
    esperarError(
      conActividad('m1_quiz_repaso', (a) => (a.aprobacion_min = 0.3)),
      'aprobacion_min',
    );
    esperarError(
      conActividad('m1_quiz_repaso', (a) => (a.aprobacion_min = 1.2)),
      'aprobacion_min',
    );
  });

  it('actividadSuperada: completada y con la precisión mínima; sin dato de precisión no bloquea', () => {
    const exigente = { aprobacion_min: 0.7 };
    expect(actividadSuperada({}, { completada: true })).toBe(true);
    expect(actividadSuperada({}, { completada: false })).toBe(false);
    expect(actividadSuperada({}, undefined)).toBe(false);
    expect(actividadSuperada(exigente, { completada: true, mejorPrecision: 0.69 })).toBe(false);
    expect(actividadSuperada(exigente, { completada: true, mejorPrecision: 0.7 })).toBe(true);
    expect(actividadSuperada(exigente, { completada: true, mejorPrecision: 1 })).toBe(true);
    expect(actividadSuperada(exigente, { completada: false, mejorPrecision: 1 })).toBe(false);
    // Servidor que aún no devuelve la precisión: se acepta lo completado.
    expect(actividadSuperada(exigente, { completada: true })).toBe(true);
  });

  it('idsSuperadas alimenta la completitud de secciones y módulos', () => {
    const modulo = validar(
      (() => {
        const d = muestra();
        fijar(d, [...rutaActividad(d, 'm1_quiz_repaso'), 'aprobacion_min'], 0.7);
        return d;
      })(),
    ).modulo!;
    const todas: Record<string, { completada: boolean; mejorPrecision?: number }> = {};
    for (const s of modulo.secciones) {
      for (const b of s.bloques) {
        if (b.tipo === 'actividad') todas[b.actividad.id] = { completada: true, mejorPrecision: 1 };
      }
    }
    expect(moduloCompletado(modulo, idsSuperadas(modulo, todas))).toBe(true);
    // El quiz se completó con 60 % de precisión: no basta para el umbral de 70 %.
    todas.m1_quiz_repaso = { completada: true, mejorPrecision: 0.6 };
    const superadas = idsSuperadas(modulo, todas);
    expect(superadas.has('m1_quiz_repaso')).toBe(false);
    expect(moduloCompletado(modulo, superadas)).toBe(false);
    const repaso = modulo.secciones.find((s) =>
      s.bloques.some((b) => b.tipo === 'actividad' && b.actividad.id === 'm1_quiz_repaso'),
    )!;
    expect(seccionCompletada(repaso, superadas)).toBe(false);
    // Con 60 % y umbral de 70 %, ni siquiera el intento 7 (piso de penalización) lo arregla: la
    // precisión no depende de los intentos, así que se puede llegar repitiendo.
    expect(calcularPuntaje({ puntaje_max: 140 }, { precision: 1, intentos: 7 })).toBe(56);
    todas.m1_quiz_repaso = { completada: true, mejorPrecision: 1 };
    expect(idsSuperadas(modulo, todas).has('m1_quiz_repaso')).toBe(true);
  });

  it('ejecucionSinErrores decide con la precisión y el primer intento, no con el puntaje', () => {
    expect(ejecucionSinErrores({ precision: 1, intentos: 1 })).toBe(true);
    expect(ejecucionSinErrores({ precision: 1, intentos: 2 })).toBe(false);
    expect(ejecucionSinErrores({ precision: 0.975, intentos: 1 })).toBe(false);
    // Un quiz de 20 preguntas con media pregunta mal: 39,5 de 40 puntos de precisión...
    const precision = 19.5 / 20;
    expect(ejecucionSinErrores({ precision, intentos: 1 })).toBe(false);
    // ...pero con puntaje_max 10 el redondeo da el puntaje máximo igualmente.
    expect(calcularPuntaje({ puntaje_max: 10 }, { precision, intentos: 1 })).toBe(10);
  });
});

describe('hallazgo: intentoInicial con instantánea local vieja', () => {
  it('manda el servidor cuando registra más intentos que la instantánea', () => {
    expect(
      intentoInicial({
        servidor: { puntaje: 5, intentos: 3, completada: true },
        progreso: { avance: 0.1, intentos: 1, instantanea: {} },
      }),
    ).toBe(4);
  });
});

describe('hallazgo: reglas de texto de una línea', () => {
  it.each([
    '> 99 % del calcio corporal',
    '- 5 % respecto al basal',
    '+ 2 mm de desplazamiento',
    '≥ 99 %',
  ])('admite el valor clínico "%s"', (texto) => {
    expect(problemasMarkdownLinea(texto)).toEqual([]);
  });

  it('sigue rechazando listas y citas de verdad, y explica qué escribir', () => {
    expect(problemasMarkdownLinea('- una lista').length).toBeGreaterThan(0);
    expect(problemasMarkdownLinea('> una cita').join(' ')).toContain('escribe "≥" o "más de"');
    expect(problemasMarkdownLinea('1. Hematoma').join(' ')).toContain('quita el número');
    expect(problemasMarkdownLinea('2) Reabsorción').join(' ')).toContain('quita el número');
  });
});

describe('hallazgo: mensajes de error', () => {
  it('cita el valor equivocado si es corto y propone el campo parecido', () => {
    const r = validarCon((d) => {
      fijar(d, [...rutaBloque(d, 'c_calcio'), 'variante'], 'Clinico');
      const capa = (
        leer(d, [...rutaActividad(d, 'm1_capas_hueso'), 'config', 'capas']) as Record<
          string,
          unknown
        >[]
      )[0]!;
      capa.descripción = capa.descripcion;
      delete capa.descripcion;
    });
    expect(r.errores.some((l) => l.includes('variante: Valor no permitido (hay "Clinico")'))).toBe(
      true,
    );
    expect(
      r.errores.some((l) => l.includes('¿quisiste decir "descripcion" en lugar de "descripción"?')),
    ).toBe(true);
  });

  it('campoParecido: sin tildes, errata de una letra, y nada si no se parece', () => {
    expect(campoParecido('descripción')).toBe('descripcion');
    expect(campoParecido('Instrucciones')).toBe('instrucciones');
    expect(campoParecido('instruciones')).toBe('instrucciones');
    expect(campoParecido('puntaje_maxx')).toBe('puntaje_max');
    expect(campoParecido('zzz_campo_raro')).toBeUndefined();
    expect(campoParecido('id')).toBeUndefined();
    // Un campo que ya es válido no se "corrige" a sí mismo.
    expect(campoParecido('descripcion')).toBeUndefined();
  });
});

describe('advertencias de auditoría', () => {
  it('avisa de términos del glosario que nadie enlaza y de los pendientes para el docente', () => {
    const modulo = validar(muestra()).modulo!;
    const advertencias = advertenciasDeModulo(modulo);
    expect(advertencias.some((a) => a.includes('pendiente'))).toBe(true);
    const conHuerfano = structuredClone(modulo);
    conHuerfano.glosario.push({
      id: 'termino_sin_uso',
      termino: 'Término sin uso',
      definicion: 'Definido en el glosario pero nunca enlazado desde un texto.',
    });
    expect(advertenciasDeModulo(conHuerfano).some((a) => a.includes('"termino_sin_uso"'))).toBe(
      true,
    );
  });

  it('avisa si el mismo término del glosario se define distinto en dos módulos', () => {
    const uno = validar(muestra()).modulo!;
    const dos = structuredClone(uno);
    dos.numero = 2;
    expect(advertenciasEntreModulos([uno, dos])).toEqual([]);
    const termino = dos.glosario.find((t) => t.id === 'osteoblasto')!;
    termino.definicion = 'Otra definición del osteoblasto, redactada por otro agente.';
    expect(advertenciasEntreModulos([uno, dos])).toEqual([
      'El término "osteoblasto" tiene definiciones distintas en los módulos 1 y 2.',
    ]);
  });
});
