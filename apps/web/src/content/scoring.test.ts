import { describe, expect, it } from 'vitest';
import { BLOQUEO_SECUENCIAL } from '@/config';
import {
  UMBRAL_RETRO_CORRECTA,
  UMBRAL_RETRO_PARCIAL,
  bandaRetroalimentacion,
  calcularPuntaje,
  estadoDeSecciones,
  factorPorIntentos,
  intentosParaApi,
  limitarPrecision,
  moduloCompletado,
  moduloDesbloqueado,
  precisionPorConteo,
  precisionPregunta,
  precisionQuiz,
  progresoDeModulo,
  puntajeMaximoModulo,
  puntajeObtenidoModulo,
  seccionCompletada,
  seccionDesbloqueada,
  siguienteModulo,
  siguientePendiente,
  textoRetroalimentacion,
} from './scoring';
import type { RespuestaPregunta } from './scoring';
import { listarActividades } from './consultas';
import type { ModuloContenido, Pregunta, Seccion } from './schema';
import { muestra, validar } from './__fixtures__/utiles';

const modulo: ModuloContenido = validar(muestra()).modulo!;
const OBLIGATORIAS = [
  'm1_capas_hueso',
  'm1_celulas_funciones',
  'm1_animacion_remodelado',
  'm1_senales_remodelado',
  'm1_explora_mandibula',
  'm1_identifica_celulas',
  'm1_quiz_repaso',
];
const OPCIONALES = ['m1_explora_celulas', 'm1_video_docente'];

describe('factorPorIntentos', () => {
  it('con los valores por defecto: 1, 0,9, 0,8... y nunca baja de 0,4', () => {
    const esperado = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.4, 0.4];
    esperado.forEach((valor, i) => expect(factorPorIntentos(i + 1)).toBeCloseTo(valor, 10));
  });

  it('intentos altos quedan en el piso', () => {
    expect(factorPorIntentos(100)).toBe(0.4);
    expect(factorPorIntentos(1_000_000_000)).toBe(0.4);
    expect(factorPorIntentos(Infinity)).toBe(0.4);
  });

  it('intentos menores que 1, no enteros o NaN se tratan como el primer intento', () => {
    for (const n of [0, -1, -100, NaN, -Infinity, 1.9, 0.5]) {
      expect(factorPorIntentos(n), String(n)).toBe(1);
    }
    expect(factorPorIntentos(2.9)).toBeCloseTo(0.9, 10); // floor(2.9) = 2
  });

  it('el piso y la penalización son configurables', () => {
    const p = { por_intento: 0.25, piso: 0.5 };
    expect(factorPorIntentos(1, p)).toBe(1);
    expect(factorPorIntentos(2, p)).toBe(0.75);
    expect(factorPorIntentos(3, p)).toBe(0.5);
    expect(factorPorIntentos(4, p)).toBe(0.5);
    expect(factorPorIntentos(2, { por_intento: 0.2 })).toBeCloseTo(0.8, 10); // piso por defecto
    expect(factorPorIntentos(50, { piso: 0.7 })).toBe(0.7); // por_intento por defecto
  });

  it('sin penalización (por_intento 0 o piso 1) el factor es siempre 1, también con Infinity', () => {
    expect(factorPorIntentos(50, { por_intento: 0 })).toBe(1);
    expect(factorPorIntentos(Infinity, { por_intento: 0 })).toBe(1);
    expect(factorPorIntentos(50, { piso: 1 })).toBe(1);
  });

  it('nunca es negativo, ni con piso 0 y penalización máxima', () => {
    const p = { por_intento: 0.5, piso: 0 };
    expect(factorPorIntentos(2, p)).toBe(0.5);
    expect(factorPorIntentos(3, p)).toBe(0);
    expect(factorPorIntentos(10, p)).toBe(0);
    expect(factorPorIntentos(Infinity, p)).toBe(0);
  });

  it('valores de configuración fuera de rango se acotan', () => {
    expect(factorPorIntentos(3, { por_intento: -1 })).toBe(1);
    expect(factorPorIntentos(3, { por_intento: 5, piso: 0.3 })).toBe(0.3);
    expect(factorPorIntentos(3, { piso: -2, por_intento: 0.1 })).toBeCloseTo(0.8, 10);
    expect(factorPorIntentos(3, { piso: 9, por_intento: 0.1 })).toBe(1);
  });
});

describe('calcularPuntaje', () => {
  const actividad = { puntaje_max: 100 };

  it('puntaje_max x precisión x factor', () => {
    expect(calcularPuntaje(actividad, { precision: 1, intentos: 1 })).toBe(100);
    expect(calcularPuntaje(actividad, { precision: 0.5, intentos: 1 })).toBe(50);
    expect(calcularPuntaje(actividad, { precision: 1, intentos: 2 })).toBe(90);
    expect(calcularPuntaje(actividad, { precision: 0.8, intentos: 3 })).toBe(64);
    expect(calcularPuntaje({ puntaje_max: 30 }, { precision: 1, intentos: 1 })).toBe(30);
  });

  it('es un entero y el medio punto sube', () => {
    expect(calcularPuntaje({ puntaje_max: 50 }, { precision: 0.5, intentos: 2 })).toBe(23); // 22,5
    expect(calcularPuntaje({ puntaje_max: 10 }, { precision: 0.35, intentos: 1 })).toBe(4); // 3,5
    expect(calcularPuntaje({ puntaje_max: 30 }, { precision: 2 / 3, intentos: 1 })).toBe(20);
  });

  it('no arrastra el ruido de coma flotante (14,499999... es 14,5 y sube a 15)', () => {
    expect(100 * 0.145).not.toBe(14.5); // el ruido existe
    expect(calcularPuntaje(actividad, { precision: 0.145, intentos: 1 })).toBe(15);
    expect(calcularPuntaje(actividad, { precision: 0.7, intentos: 2 })).toBe(63); // 63,00000000000001
  });

  it('con intentos altos el puntaje se queda en el piso: nunca llega a 0 salvo que el piso sea 0', () => {
    expect(calcularPuntaje(actividad, { precision: 1, intentos: 7 })).toBe(40);
    expect(calcularPuntaje(actividad, { precision: 1, intentos: 500 })).toBe(40);
    expect(
      calcularPuntaje(
        { puntaje_max: 100, penalizacion: { por_intento: 0.5, piso: 0 } },
        { precision: 1, intentos: 9 },
      ),
    ).toBe(0);
    expect(
      calcularPuntaje(
        { puntaje_max: 100, penalizacion: { por_intento: 0.1, piso: 0.75 } },
        { precision: 1, intentos: 30 },
      ),
    ).toBe(75);
  });

  it('parciales: precisión combinada con reintentos', () => {
    expect(calcularPuntaje(actividad, { precision: 0.6, intentos: 3 })).toBe(48); // 100 x 0,6 x 0,8
    expect(calcularPuntaje(actividad, { precision: 0.25, intentos: 1 })).toBe(25);
    expect(calcularPuntaje(actividad, { precision: 0, intentos: 1 })).toBe(0);
  });

  it('nunca es negativo ni supera el máximo, aunque la entrada sea absurda', () => {
    expect(calcularPuntaje(actividad, { precision: -1, intentos: 1 })).toBe(0);
    expect(calcularPuntaje(actividad, { precision: NaN, intentos: 1 })).toBe(0);
    expect(calcularPuntaje(actividad, { precision: 7, intentos: 1 })).toBe(100);
    expect(calcularPuntaje(actividad, { precision: Infinity, intentos: 1 })).toBe(100);
    expect(calcularPuntaje(actividad, { precision: 1, intentos: NaN })).toBe(100);
    expect(calcularPuntaje(actividad, { precision: 1, intentos: -3 })).toBe(100);
    expect(calcularPuntaje({ puntaje_max: -5 }, { precision: 1, intentos: 1 })).toBe(0);
    expect(calcularPuntaje({ puntaje_max: NaN }, { precision: 1, intentos: 1 })).toBe(0);
    expect(calcularPuntaje({ puntaje_max: 5000 }, { precision: 1, intentos: 1 })).toBe(1000);
  });

  it('propiedades: 0 <= puntaje <= max, creciente con la precisión y decreciente con los intentos', () => {
    // Generador determinista (LCG) para que la prueba sea reproducible.
    let semilla = 12345;
    const aleatorio = () => {
      semilla = (semilla * 1664525 + 1013904223) % 4294967296;
      return semilla / 4294967296;
    };
    for (let i = 0; i < 3000; i++) {
      const max = 1 + Math.floor(aleatorio() * 1000);
      const penalizacion = { por_intento: aleatorio() * 0.5, piso: aleatorio() };
      const precision = aleatorio();
      const intentos = 1 + Math.floor(aleatorio() * 120);
      const p = calcularPuntaje({ puntaje_max: max, penalizacion }, { precision, intentos });
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(max);
      const masPrecision = calcularPuntaje(
        { puntaje_max: max, penalizacion },
        { precision: Math.min(1, precision + 0.1), intentos },
      );
      expect(masPrecision).toBeGreaterThanOrEqual(p);
      const masIntentos = calcularPuntaje(
        { puntaje_max: max, penalizacion },
        { precision, intentos: intentos + 1 },
      );
      expect(masIntentos).toBeLessThanOrEqual(p);
    }
  });

  it('usa la penalización de la actividad del módulo', () => {
    const quiz = listarActividades(modulo).find(
      (u) => u.actividad.id === 'm1_senales_remodelado',
    )!.actividad;
    // por_intento 0,15 y piso 0,4 (por defecto): intento 2 => 0,85; 50 x 0,85 = 42,5 => 43.
    expect(calcularPuntaje(quiz, { precision: 1, intentos: 2 })).toBe(43);
    expect(calcularPuntaje(quiz, { precision: 1, intentos: 1 })).toBe(50);
  });
});

describe('intentosParaApi y limitarPrecision', () => {
  it('intentos: entero entre 1 y 100', () => {
    expect(intentosParaApi(NaN)).toBe(1);
    expect(intentosParaApi(0)).toBe(1);
    expect(intentosParaApi(-4)).toBe(1);
    expect(intentosParaApi(1.9)).toBe(1);
    expect(intentosParaApi(2)).toBe(2);
    expect(intentosParaApi(100)).toBe(100);
    expect(intentosParaApi(250)).toBe(100);
    expect(intentosParaApi(Infinity)).toBe(100);
  });

  it('precisión: entre 0 y 1', () => {
    expect(limitarPrecision(-0.2)).toBe(0);
    expect(limitarPrecision(0.4)).toBe(0.4);
    expect(limitarPrecision(3)).toBe(1);
    expect(limitarPrecision(NaN)).toBe(0);
  });
});

describe('precisionPorConteo', () => {
  it('aciertos / (aciertos + fallos)', () => {
    expect(precisionPorConteo(4, 0)).toBe(1);
    expect(precisionPorConteo(3, 1)).toBe(0.75);
    expect(precisionPorConteo(2, 6)).toBe(0.25);
    expect(precisionPorConteo(0, 5)).toBe(0);
  });

  it('sin acciones vale 0 y los valores raros no rompen', () => {
    expect(precisionPorConteo(0, 0)).toBe(0);
    expect(precisionPorConteo(-3, 2)).toBe(0);
    expect(precisionPorConteo(NaN, 2)).toBe(0);
    expect(precisionPorConteo(3, NaN)).toBe(1);
  });
});

describe('retroalimentación por banda', () => {
  it('correcta desde 0,8, parcial desde 0,5 e incorrecta por debajo', () => {
    expect(UMBRAL_RETRO_CORRECTA).toBe(0.8);
    expect(UMBRAL_RETRO_PARCIAL).toBe(0.5);
    expect(bandaRetroalimentacion(1)).toBe('correcta');
    expect(bandaRetroalimentacion(0.8)).toBe('correcta');
    expect(bandaRetroalimentacion(0.79)).toBe('parcial');
    expect(bandaRetroalimentacion(0.5)).toBe('parcial');
    expect(bandaRetroalimentacion(0.49)).toBe('incorrecta');
    expect(bandaRetroalimentacion(0)).toBe('incorrecta');
    expect(bandaRetroalimentacion(NaN)).toBe('incorrecta');
    expect(bandaRetroalimentacion(9)).toBe('correcta');
  });

  it('usa el mensaje de la banda y, si falta, el más cercano', () => {
    const completa = { retroalimentacion: { correcta: 'C', parcial: 'P', incorrecta: 'I' } };
    expect(textoRetroalimentacion(completa, 1)).toBe('C');
    expect(textoRetroalimentacion(completa, 0.6)).toBe('P');
    expect(textoRetroalimentacion(completa, 0.1)).toBe('I');
    const sinParcial = { retroalimentacion: { correcta: 'C', incorrecta: 'I' } };
    expect(textoRetroalimentacion(sinParcial, 0.6)).toBe('I');
    const sinIncorrecta = { retroalimentacion: { correcta: 'C', parcial: 'P' } };
    expect(textoRetroalimentacion(sinIncorrecta, 0.1)).toBe('P');
    const soloCorrecta = { retroalimentacion: { correcta: 'C' } };
    expect(textoRetroalimentacion(soloCorrecta, 0.6)).toBe('C');
    expect(textoRetroalimentacion(soloCorrecta, 0.1)).toBe('C');
  });
});

describe('precisión del quiz', () => {
  const quiz = listarActividades(modulo).find(
    (u) => u.actividad.id === 'm1_quiz_repaso',
  )!.actividad;
  if (quiz.tipo !== 'quiz') throw new Error('la muestra debe traer el quiz');
  const [p1, p2, p3, p4, p5] = quiz.config.preguntas as [
    Pregunta,
    Pregunta,
    Pregunta,
    Pregunta,
    Pregunta,
  ];
  const multiple = (...seleccion: string[]): RespuestaPregunta => ({
    formato: 'opcion_multiple',
    seleccion,
  });
  const orden = (...ids: string[]): RespuestaPregunta => ({ formato: 'ordenar', orden: ids });

  it('opción con una correcta: acierto 1, cualquier otra cosa 0', () => {
    expect(precisionPregunta(p1, multiple('qr_p1_b'))).toBe(1);
    expect(precisionPregunta(p1, multiple('qr_p1_a'))).toBe(0);
    expect(precisionPregunta(p1, multiple('qr_p1_a', 'qr_p1_b'))).toBe(0); // marcar de más no suma
    expect(precisionPregunta(p1, multiple())).toBe(0);
    expect(precisionPregunta(p1, multiple('otra'))).toBe(0); // id desconocido: se ignora
    expect(precisionPregunta(p1, multiple('qr_p1_b', 'qr_p1_b'))).toBe(1); // repetido
    expect(precisionPregunta(p1, multiple('qr_p1_b', 'otra'))).toBe(1);
  });

  it('varias correctas: (correctas marcadas - incorrectas marcadas) / total de correctas, sin bajar de 0', () => {
    // p2: correctas a y b; incorrectas c y d.
    expect(precisionPregunta(p2, multiple('qr_p2_a', 'qr_p2_b'))).toBe(1);
    expect(precisionPregunta(p2, multiple('qr_p2_a'))).toBeCloseTo(1 / 2, 10);
    expect(precisionPregunta(p2, multiple('qr_p2_a', 'qr_p2_b', 'qr_p2_c'))).toBeCloseTo(1 / 2, 10);
    // Marcarlo todo no puntúa: el esquema exige tantas incorrectas como correctas.
    expect(precisionPregunta(p2, multiple('qr_p2_a', 'qr_p2_b', 'qr_p2_c', 'qr_p2_d'))).toBe(0);
    expect(precisionPregunta(p2, multiple('qr_p2_d'))).toBe(0);
    expect(precisionPregunta(p2, multiple())).toBe(0);
  });

  it('verdadero o falso', () => {
    expect(precisionPregunta(p3, { formato: 'verdadero_falso', valor: false })).toBe(1);
    expect(precisionPregunta(p3, { formato: 'verdadero_falso', valor: true })).toBe(0);
  });

  it('ordenar: fracción de pasos que quedaron en su posición', () => {
    const correcto = ['qr_p4_1', 'qr_p4_2', 'qr_p4_3', 'qr_p4_4'];
    expect(precisionPregunta(p4, orden(...correcto))).toBe(1);
    expect(precisionPregunta(p4, orden('qr_p4_2', 'qr_p4_1', 'qr_p4_3', 'qr_p4_4'))).toBe(0.5);
    expect(precisionPregunta(p4, orden(...[...correcto].reverse()))).toBe(0);
    expect(precisionPregunta(p4, orden('qr_p4_1'))).toBe(0.25); // respuesta incompleta
    expect(precisionPregunta(p4, orden())).toBe(0);
    expect(precisionPregunta(p4, orden(...correcto, 'sobra'))).toBe(1);
  });

  it('una respuesta ausente o de otro formato vale 0', () => {
    expect(precisionPregunta(p1, undefined)).toBe(0);
    expect(precisionPregunta(p1, { formato: 'verdadero_falso', valor: true })).toBe(0);
    expect(precisionPregunta(p3, multiple('qr_p1_b'))).toBe(0);
    expect(precisionPregunta(p4, multiple('qr_p4_1'))).toBe(0);
  });

  it('precisionQuiz promedia y cuenta las no respondidas como 0', () => {
    const todasBien = {
      qr_p1: multiple('qr_p1_b'),
      qr_p2: multiple('qr_p2_a', 'qr_p2_b'),
      qr_p3: { formato: 'verdadero_falso', valor: false } as RespuestaPregunta,
      qr_p4: orden('qr_p4_1', 'qr_p4_2', 'qr_p4_3', 'qr_p4_4'),
      qr_p5: multiple('qr_p5_c'),
    };
    const preguntas = quiz.config.preguntas;
    expect(precisionQuiz(preguntas, todasBien)).toBe(1);
    expect(precisionQuiz(preguntas, {})).toBe(0);
    expect(
      precisionQuiz(preguntas, { qr_p1: todasBien.qr_p1, qr_p5: todasBien.qr_p5 }),
    ).toBeCloseTo(2 / 5, 10);
    expect(
      precisionQuiz(preguntas, {
        ...todasBien,
        qr_p3: { formato: 'verdadero_falso', valor: true },
      }),
    ).toBeCloseTo(4 / 5, 10);
    expect(precisionQuiz([], {})).toBe(0);
    expect(precisionPregunta(p5, multiple('qr_p5_c'))).toBe(1);
  });

  it('del quiz al puntaje: 3 de 5 a la primera y a la segunda', () => {
    const respuestas = {
      qr_p1: multiple('qr_p1_b'),
      qr_p2: multiple('qr_p2_a', 'qr_p2_b'),
      qr_p3: { formato: 'verdadero_falso', valor: false } as RespuestaPregunta,
    };
    const precision = precisionQuiz(quiz.config.preguntas, respuestas); // 0,6
    expect(calcularPuntaje(quiz, { precision, intentos: 1 })).toBe(30); // 50 x 0,6
    expect(calcularPuntaje(quiz, { precision, intentos: 2 })).toBe(27); // 50 x 0,6 x 0,9
  });
});

describe('puntaje del módulo', () => {
  it('puntajeMaximoModulo suma los puntaje_max (todas o solo las obligatorias)', () => {
    expect(puntajeMaximoModulo(modulo)).toBe(280);
    expect(puntajeMaximoModulo(modulo, { soloObligatorias: true })).toBe(240);
    expect(puntajeMaximoModulo({ secciones: [] })).toBe(0);
  });

  it('puntajeObtenidoModulo usa el mejor puntaje por actividad, con tope en su máximo', () => {
    expect(puntajeObtenidoModulo(modulo, {})).toBe(0);
    expect(puntajeObtenidoModulo(modulo, { m1_capas_hueso: 30, m1_quiz_repaso: 30 })).toBe(60);
    expect(puntajeObtenidoModulo(modulo, { m1_quiz_repaso: 999 })).toBe(50); // tope: puntaje_max
    expect(puntajeObtenidoModulo(modulo, { m1_quiz_repaso: -20, otra_actividad: 500 })).toBe(0);
  });
});

describe('completitud', () => {
  const secciones = modulo.secciones;

  it('una sección se completa con todas sus actividades OBLIGATORIAS', () => {
    expect(seccionCompletada(secciones[0]!, [])).toBe(false);
    expect(seccionCompletada(secciones[0]!, ['m1_capas_hueso'])).toBe(true);
    // Sección 1: relación y animación son obligatorias.
    expect(seccionCompletada(secciones[1]!, ['m1_celulas_funciones'])).toBe(false);
    expect(
      seccionCompletada(secciones[1]!, ['m1_celulas_funciones', 'm1_animacion_remodelado']),
    ).toBe(true);
  });

  it('las actividades opcionales no bloquean y las desconocidas se ignoran', () => {
    // Sección 2: arrastre y mandíbula son obligatorias; las células 3D no.
    expect(
      seccionCompletada(secciones[2]!, ['m1_senales_remodelado', 'm1_explora_mandibula']),
    ).toBe(true);
    expect(seccionCompletada(secciones[2]!, ['m1_explora_celulas', 'm1_senales_remodelado'])).toBe(
      false,
    );
    expect(seccionCompletada(secciones[0]!, ['m1_capas_hueso', 'no_existe'])).toBe(true);
  });

  it('acepta un Set o una lista', () => {
    expect(seccionCompletada(secciones[0]!, new Set(['m1_capas_hueso']))).toBe(true);
    expect(seccionCompletada(secciones[0]!, new Set())).toBe(false);
  });

  it('una sección sin actividades obligatorias está completada', () => {
    const soloLectura: Seccion = {
      id: 'lectura',
      titulo: 'Solo lectura',
      bloques: [
        {
          id: 't_lectura',
          tipo: 'texto',
          markdown: 'Un bloque de texto que no exige ninguna actividad.',
        },
      ],
    };
    expect(seccionCompletada(soloLectura, [])).toBe(true);
    expect(moduloCompletado({ secciones: [soloLectura] }, [])).toBe(true);
  });

  it('el módulo se completa cuando lo están todas sus secciones', () => {
    expect(moduloCompletado(modulo, [])).toBe(false);
    expect(moduloCompletado(modulo, OBLIGATORIAS)).toBe(true);
    expect(moduloCompletado(modulo, [...OBLIGATORIAS, ...OPCIONALES])).toBe(true);
    for (const falta of OBLIGATORIAS) {
      expect(
        moduloCompletado(
          modulo,
          OBLIGATORIAS.filter((id) => id !== falta),
        ),
        falta,
      ).toBe(false);
    }
    expect(moduloCompletado(modulo, OPCIONALES)).toBe(false);
  });

  it('progresoDeModulo cuenta obligatorias, actividades y puntaje máximo', () => {
    expect(progresoDeModulo(modulo, [])).toEqual({
      obligatoriasTotal: 7,
      obligatoriasCompletadas: 0,
      actividadesTotal: 9,
      actividadesCompletadas: 0,
      fraccion: 0,
      puntajeMaximo: 280,
    });
    const medio = progresoDeModulo(modulo, [
      'm1_capas_hueso',
      'm1_quiz_repaso',
      'm1_video_docente',
    ]);
    expect(medio.obligatoriasCompletadas).toBe(2);
    expect(medio.actividadesCompletadas).toBe(3);
    expect(medio.fraccion).toBeCloseTo(2 / 7, 10);
    expect(progresoDeModulo(modulo, OBLIGATORIAS).fraccion).toBe(1);
    expect(progresoDeModulo({ secciones: [] }, []).fraccion).toBe(1);
  });
});

describe('siguiente pieza pendiente', () => {
  it('es la primera actividad obligatoria sin completar, en el orden del módulo', () => {
    expect(siguientePendiente(modulo, [])?.actividad.id).toBe('m1_capas_hueso');
    expect(siguientePendiente(modulo, ['m1_capas_hueso'])?.actividad.id).toBe(
      'm1_celulas_funciones',
    );
    expect(
      siguientePendiente(modulo, ['m1_capas_hueso', 'm1_animacion_remodelado'])?.actividad.id,
    ).toBe('m1_celulas_funciones');
    const pendiente = siguientePendiente(modulo, ['m1_capas_hueso', 'm1_celulas_funciones']);
    expect(pendiente?.actividad.id).toBe('m1_animacion_remodelado');
    expect(pendiente?.seccion.id).toBe('funciones');
    expect(pendiente?.indiceSeccion).toBe(1);
  });

  it('no hay pendiente cuando todo lo obligatorio está hecho', () => {
    expect(siguientePendiente(modulo, OBLIGATORIAS)).toBeNull();
    expect(siguientePendiente(modulo, [...OBLIGATORIAS, ...OPCIONALES])).toBeNull();
  });

  it('puede incluir las opcionales', () => {
    const conOpcionales = { incluirOpcionales: true };
    expect(siguientePendiente(modulo, OBLIGATORIAS, conOpcionales)?.actividad.id).toBe(
      'm1_explora_celulas',
    );
    expect(
      siguientePendiente(modulo, [...OBLIGATORIAS, 'm1_explora_celulas'], conOpcionales)?.actividad
        .id,
    ).toBe('m1_video_docente');
    expect(siguientePendiente(modulo, [...OBLIGATORIAS, ...OPCIONALES], conOpcionales)).toBeNull();
  });
});

describe('bloqueo de módulos', () => {
  const libre = { bloqueoSecuencial: false };
  const secuencial = { bloqueoSecuencial: true };

  it('sin bloqueo secuencial todos los módulos de 1 a 6 están abiertos', () => {
    for (let n = 1; n <= 6; n++) expect(moduloDesbloqueado(n, [], libre)).toBe(true);
  });

  it('un número que no es de 1 a 6 nunca está desbloqueado', () => {
    for (const n of [0, 7, -1, 1.5, NaN, Infinity]) {
      expect(moduloDesbloqueado(n, [1, 2, 3, 4, 5, 6], libre), String(n)).toBe(false);
      expect(moduloDesbloqueado(n, [1, 2, 3, 4, 5, 6], secuencial), String(n)).toBe(false);
    }
  });

  it('con bloqueo secuencial el 1 está abierto y cada módulo exige el anterior completado', () => {
    expect(moduloDesbloqueado(1, [], secuencial)).toBe(true);
    expect(moduloDesbloqueado(2, [], secuencial)).toBe(false);
    expect(moduloDesbloqueado(2, [1], secuencial)).toBe(true);
    expect(moduloDesbloqueado(3, [1], secuencial)).toBe(false);
    expect(moduloDesbloqueado(3, [1, 2], secuencial)).toBe(true);
    expect(moduloDesbloqueado(6, [1, 2, 3, 4], secuencial)).toBe(false);
    expect(moduloDesbloqueado(6, [1, 2, 3, 4, 5], secuencial)).toBe(true);
  });

  it('un módulo ya completado no se vuelve a cerrar (el backend no exige orden)', () => {
    expect(moduloDesbloqueado(3, [3], secuencial)).toBe(true);
    expect(moduloDesbloqueado(4, [1, 3], secuencial)).toBe(true); // 3 está completado
    expect(moduloDesbloqueado(2, [1, 3], secuencial)).toBe(true);
    expect(moduloDesbloqueado(5, [1, 3], secuencial)).toBe(false);
  });

  it('por defecto respeta BLOQUEO_SECUENCIAL de src/config.ts', () => {
    // Con el valor actual (false) todo está abierto; con true, solo el 1. Vale para ambos.
    expect(moduloDesbloqueado(1, [])).toBe(true);
    expect(moduloDesbloqueado(6, [])).toBe(!BLOQUEO_SECUENCIAL);
    expect(moduloDesbloqueado(6, [5])).toBe(true);
  });

  it('siguienteModulo: el menor no completado y abierto', () => {
    expect(siguienteModulo([], libre)).toBe(1);
    expect(siguienteModulo([1], libre)).toBe(2);
    expect(siguienteModulo([1, 3], libre)).toBe(2);
    expect(siguienteModulo([1, 2, 3, 4, 5], libre)).toBe(6);
    expect(siguienteModulo([1, 2, 3, 4, 5, 6], libre)).toBeNull();
    expect(siguienteModulo([2], secuencial)).toBe(1);
    expect(siguienteModulo([1, 2], secuencial)).toBe(3);
    expect(siguienteModulo([1, 2, 3, 4, 5, 6], secuencial)).toBeNull();
  });
});

describe('bloqueo de secciones', () => {
  const libre = { bloqueoSecuencial: false };
  const secuencial = { bloqueoSecuencial: true };
  const s0 = ['m1_capas_hueso'];
  const s1 = ['m1_celulas_funciones', 'm1_animacion_remodelado'];
  const s2 = ['m1_senales_remodelado', 'm1_explora_mandibula'];

  it('con bloqueo: completada, actual y bloqueadas', () => {
    expect(estadoDeSecciones(modulo, [], secuencial)).toEqual([
      'actual',
      'bloqueada',
      'bloqueada',
      'bloqueada',
    ]);
    expect(estadoDeSecciones(modulo, s0, secuencial)).toEqual([
      'completada',
      'actual',
      'bloqueada',
      'bloqueada',
    ]);
    expect(estadoDeSecciones(modulo, [...s0, ...s1], secuencial)).toEqual([
      'completada',
      'completada',
      'actual',
      'bloqueada',
    ]);
    expect(estadoDeSecciones(modulo, OBLIGATORIAS, secuencial)).toEqual([
      'completada',
      'completada',
      'completada',
      'completada',
    ]);
  });

  it('sin bloqueo: las siguientes quedan disponibles', () => {
    expect(estadoDeSecciones(modulo, [], libre)).toEqual([
      'actual',
      'disponible',
      'disponible',
      'disponible',
    ]);
    expect(estadoDeSecciones(modulo, s0, libre)).toEqual([
      'completada',
      'actual',
      'disponible',
      'disponible',
    ]);
  });

  it('una sección completada nunca se muestra bloqueada aunque una anterior no lo esté', () => {
    expect(estadoDeSecciones(modulo, s2, secuencial)).toEqual([
      'actual',
      'bloqueada',
      'completada',
      'bloqueada',
    ]);
  });

  it('las actividades a medias no completan una sección', () => {
    expect(estadoDeSecciones(modulo, ['m1_celulas_funciones'], secuencial)[1]).toBe('bloqueada');
    expect(estadoDeSecciones(modulo, [...s0, 'm1_celulas_funciones'], secuencial)[1]).toBe(
      'actual',
    );
  });

  it('seccionDesbloqueada: cierta salvo bloqueada, falsa fuera de rango', () => {
    expect(seccionDesbloqueada(modulo, 0, [], secuencial)).toBe(true);
    expect(seccionDesbloqueada(modulo, 1, [], secuencial)).toBe(false);
    expect(seccionDesbloqueada(modulo, 1, s0, secuencial)).toBe(true);
    expect(seccionDesbloqueada(modulo, 3, s0, secuencial)).toBe(false);
    expect(seccionDesbloqueada(modulo, 3, [], libre)).toBe(true);
    expect(seccionDesbloqueada(modulo, 9, [], libre)).toBe(false);
    expect(seccionDesbloqueada(modulo, -1, [], libre)).toBe(false);
  });

  it('por defecto respeta BLOQUEO_SECUENCIAL', () => {
    expect(seccionDesbloqueada(modulo, 3, [])).toBe(!BLOQUEO_SECUENCIAL);
  });
});
