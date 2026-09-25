/**
 * Pruebas de `ActividadQuiz`: la batería de conformidad del contrato de las actividades y los
 * casos propios del quiz (flujo, retroalimentación inmediata, intentos y penalización, estado
 * previo, teclado y toque, movimiento reducido, desmontaje limpio, extensión de IA y contenido
 * adversarial).
 */
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROGRESO_INTERVALO_MIN_MS } from '@/activities/types';
import type { PropsActividadQuiz, ProgresoActividad } from '@/activities/types';
import { listarActividades } from '@/content/consultas';
import { pruebasDeContratoActividad, problemasDeEmisiones } from '@/content/__fixtures__/contrato';
import type { EventosEmitidos } from '@/content/__fixtures__/contrato';
import { muestra, validar } from '@/content/__fixtures__/utiles';
import { calcularPuntaje } from '@/content/scoring';
import type { ActividadQuiz as TipoActividadQuiz, Pregunta } from '@/content/schema';
import ActividadQuiz from './ActividadQuiz.vue';
import { CLAVE_PREGUNTAS_IA, EVENTO_GLOSARIO } from './ia';
import type { ProveedorPreguntasIA } from './ia';
import { presentarQuiz } from './logica';
import {
  completarQuiz,
  entradaDeOpcion,
  moverPaso,
  preguntaVisible,
  pulsarPrincipal,
  resolverPregunta,
  responder,
} from './__fixtures__/conductor';

const modulo = validar(muestra()).modulo!;
const quiz = listarActividades(modulo).find((u) => u.actividad.tipo === 'quiz')!
  .actividad as TipoActividadQuiz;

/** Copia de la actividad de muestra con cambios en su `config` o en sus campos. */
function variante(
  cambios: Partial<Omit<TipoActividadQuiz, 'config'>> & {
    config?: Partial<TipoActividadQuiz['config']>;
  } = {},
): TipoActividadQuiz {
  const copia = structuredClone(quiz);
  const { config, ...resto } = cambios;
  return { ...copia, ...resto, config: { ...copia.config, ...config } } as TipoActividadQuiz;
}

let montados: VueWrapper[] = [];

interface Opciones {
  modo?: 'jugar' | 'revisar';
  estadoPrevio?: PropsActividadQuiz['estadoPrevio'];
  ia?: ProveedorPreguntasIA;
  conDocumento?: boolean;
}

function montar(actividad: TipoActividadQuiz = quiz, opciones: Opciones = {}) {
  const progresos: ProgresoActividad[] = [];
  const wrapper = mount(ActividadQuiz, {
    attachTo: opciones.conDocumento ? document.body : undefined,
    props: {
      actividad,
      modulo: 1,
      modo: opciones.modo,
      estadoPrevio: opciones.estadoPrevio,
      onProgreso: (p: ProgresoActividad) => progresos.push(p),
    } as never,
    global: opciones.ia ? { provide: { [CLAVE_PREGUNTAS_IA as symbol]: opciones.ia } } : undefined,
  });
  montados.push(wrapper);
  return { wrapper, progresos };
}

afterEach(() => {
  for (const w of montados) {
    try {
      w.unmount();
    } catch {
      // ya desmontado por la prueba
    }
  }
  montados = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const completada = (w: VueWrapper) =>
  w.emitted('completada')?.map((a) => a[0]) as
    | {
        puntaje: number;
        intentos: number;
        precision: number;
        detalle: { preguntas: Record<string, number> };
      }[]
    | undefined;
const interacciones = (w: VueWrapper) => w.emitted('interaccion')?.map((a) => a[0]) ?? [];
const texto = (w: VueWrapper) => w.text().replace(/\s+/g, ' ');

/* -------------------------------------------------------------------------------------------
 * 1. Batería de conformidad del contrato
 * ----------------------------------------------------------------------------------------- */

pruebasDeContratoActividad<'quiz'>({
  nombre: 'ActividadQuiz',
  actividad: quiz,
  montar: (props) =>
    mount(ActividadQuiz, {
      props: props as never,
      attachTo: document.body,
    }) as unknown as VueWrapper,
  completar: async (wrapper) => {
    await completarQuiz(wrapper, quiz, true);
  },
  precisionEsperada: 1,
});

/* -------------------------------------------------------------------------------------------
 * 2. Presentación inicial y secreto de las respuestas
 * ----------------------------------------------------------------------------------------- */

describe('ActividadQuiz: presentación', () => {
  it('muestra título, instrucciones, la primera pregunta y el avance en 0', () => {
    const { wrapper } = montar();
    expect(wrapper.find('h3').text()).toBe('Quiz de repaso');
    expect(texto(wrapper)).toContain('Responde las cinco preguntas.');
    expect(preguntaVisible(wrapper, quiz).id).toBe('qr_p1');
    expect(texto(wrapper)).toContain('Pregunta 1 de 5');
    expect(texto(wrapper)).toContain('0 de 5 respondidas');
    const barra = wrapper.find('[role="progressbar"]');
    expect(barra.attributes('aria-valuenow')).toBe('0');
    expect(barra.attributes('aria-valuemax')).toBe('5');
    expect(barra.attributes('aria-label')).toBeTruthy();
  });

  it('la sección se nombra con su título y hay una sola región aria-live, presente desde el inicio', () => {
    const { wrapper } = montar();
    const seccion = wrapper.find('section');
    const idTitulo = seccion.attributes('aria-labelledby')!;
    expect(wrapper.find(`#${idTitulo}`).text()).toBe('Quiz de repaso');
    const vivas = wrapper.findAll('[aria-live]');
    expect(vivas).toHaveLength(1);
    expect(vivas[0]!.attributes('aria-live')).toBe('polite');
    expect(vivas[0]!.text()).toBe('');
  });

  it('nada carga el foco al montar (R6: nada roba el foco)', () => {
    const { wrapper } = montar(quiz, { conDocumento: true });
    expect(wrapper.element.contains(document.activeElement)).toBe(false);
  });

  it('una opción múltiple con una sola correcta usa radios; con varias, casillas', async () => {
    const { wrapper } = montar();
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(3);
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0);
    expect(texto(wrapper)).toContain('Elige una opción.');
    await resolverPregunta(wrapper, quiz, true);
    expect(preguntaVisible(wrapper, quiz).id).toBe('qr_p2');
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(4);
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(0);
    expect(texto(wrapper)).toContain('Marca todas las opciones correctas.');
  });

  it('los radios de una pregunta comparten grupo y todas las entradas tienen nombre accesible', () => {
    const { wrapper } = montar();
    const radios = wrapper.findAll('input[type="radio"]');
    expect(new Set(radios.map((r) => r.attributes('name'))).size).toBe(1);
    for (const r of radios) {
      const id = r.attributes('id')!;
      expect(wrapper.find(`label[for="${id}"]`).text().length).toBeGreaterThan(0);
    }
    expect(wrapper.find('fieldset').attributes('aria-labelledby')).toBeTruthy();
  });

  it('cada objetivo interactivo mide al menos 44 px (clase min-h-11) y hay 8 px entre opciones', () => {
    const { wrapper } = montar();
    for (const etiqueta of wrapper.findAll('label'))
      expect(etiqueta.classes()).toContain('min-h-11');
    expect(wrapper.find('button[data-principal]').classes()).toContain('min-h-11');
    expect(wrapper.find('fieldset').classes()).toContain('gap-2');
  });
});

describe('ActividadQuiz: no filtra la respuesta antes de responder', () => {
  const ids = /qr_p\d_[a-z0-9]+/;

  it('el DOM no trae explicaciones, ids de opciones, marcas ni clases de acierto', () => {
    const { wrapper } = montar();
    const html = wrapper.html();
    for (const p of quiz.config.preguntas) {
      expect(html).not.toContain(p.explicacion.slice(0, 25));
    }
    expect(html).not.toContain('Tu respuesta');
    expect(html).not.toContain('Era la correcta');
    expect(html).not.toMatch(ids);
    expect(html).not.toMatch(/success|destructive|correct[ao]|data-correct/i);
    expect(wrapper.findAll('input:checked')).toHaveLength(0);
    // La explicación propia de una opción tampoco está oculta en el DOM.
    expect(html).not.toContain('mantiene la matriz');
  });

  it('en la pregunta de ordenar, ni los ids de los pasos ni el orden correcto están en el DOM', async () => {
    const { wrapper } = montar();
    await resolverPregunta(wrapper, quiz, true);
    await resolverPregunta(wrapper, quiz, true);
    await resolverPregunta(wrapper, quiz, true);
    expect(preguntaVisible(wrapper, quiz).id).toBe('qr_p4');
    const html = wrapper.html();
    expect(html).not.toMatch(ids);
    expect(html).not.toContain('Primero se activa la superficie');
    const mostrados = wrapper
      .findAll('ol[data-ordenar] > li')
      .map((f) => f.find('.texto-linea').text());
    expect(mostrados).not.toEqual(['Activación', 'Reabsorción', 'Inversión', 'Formación']);
    expect([...mostrados].sort()).toEqual(['Activación', 'Formación', 'Inversión', 'Reabsorción']);
  });

  it('en 40 montajes con azar distinto, el orden inicial de los pasos nunca es el correcto', async () => {
    const correcto = ['Activación', 'Reabsorción', 'Inversión', 'Formación'];
    const soloOrdenar = variante({
      config: { preguntas: quiz.config.preguntas.filter((p) => p.formato === 'ordenar') },
    });
    for (let i = 0; i < 40; i++) {
      vi.spyOn(Math, 'random').mockReturnValue((i * 0.0251 + 0.003) % 1);
      const { wrapper } = montar(soloOrdenar);
      const orden = wrapper
        .findAll('ol[data-ordenar] > li')
        .map((f) => f.find('.texto-linea').text());
      expect(orden, `montaje ${i}`).not.toEqual(correcto);
      wrapper.unmount();
      montados = montados.filter((w) => w !== wrapper);
      vi.restoreAllMocks();
    }
  });

  it('las opciones se barajan pero quedan estables durante la ejecución (re-render, avanzar y volver)', async () => {
    const { wrapper } = montar();
    const antes = wrapper.findAll('label').map((l) => l.text());
    await wrapper.setProps({ modulo: 1 } as never);
    await entradaDeOpcion(wrapper, 'Osteoblasto').setValue(true);
    const despues = wrapper.findAll('label').map((l) => l.text());
    expect(despues).toEqual(antes);
  });

  it('con barajar_opciones en false conserva el orden del contenido', () => {
    const { wrapper } = montar(variante({ config: { barajar_opciones: false } }));
    expect(wrapper.findAll('label').map((l) => l.text())).toEqual([
      'Osteoclasto',
      'Osteoblasto',
      'Osteocito',
    ]);
  });

  it('con barajar_preguntas en true todas se muestran una vez cada una, en algún orden', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.61);
    const actividad = variante({ config: { barajar_preguntas: true } });
    const { wrapper } = montar(actividad);
    const vistas: string[] = [];
    for (let i = 0; i < 5; i++) {
      vistas.push(preguntaVisible(wrapper, actividad).id);
      await resolverPregunta(wrapper, actividad, true);
    }
    expect([...vistas].sort()).toEqual(['qr_p1', 'qr_p2', 'qr_p3', 'qr_p4', 'qr_p5']);
    expect(completada(wrapper)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------------------------
 * 3. Retroalimentación inmediata
 * ----------------------------------------------------------------------------------------- */

describe('ActividadQuiz: retroalimentación inmediata tras cada pregunta', () => {
  it('sin elegir nada, "Comprobar" no hace nada y avisa con texto (aria-disabled)', async () => {
    const { wrapper } = montar();
    const boton = wrapper.find('button[data-principal]');
    expect(boton.attributes('aria-disabled')).toBe('true');
    expect(texto(wrapper)).toContain('Elige una respuesta para poder comprobarla.');
    await boton.trigger('click');
    expect(interacciones(wrapper)).toEqual([]);
    expect(wrapper.find('[data-retroalimentacion]').exists()).toBe(false);
  });

  it('acierto: veredicto, marcas con texto, explicación y entradas bloqueadas', async () => {
    const { wrapper } = montar();
    await responder(wrapper, quiz, true);
    await pulsarPrincipal(wrapper);
    const retro = wrapper.find('[data-retroalimentacion]');
    expect(retro.text()).toContain('¡Correcto!');
    expect(retro.text()).toContain('sintetiza el osteoide');
    expect(retro.find('svg').exists()).toBe(true); // icono
    expect(texto(wrapper)).toContain('Tu respuesta: correcta');
    for (const entrada of wrapper.findAll('input')) {
      expect(entrada.attributes('disabled')).toBeDefined();
    }
    expect(wrapper.find('button[data-principal]').text()).toBe('Siguiente pregunta');
    expect(texto(wrapper)).toContain('1 de 5 respondidas');
  });

  it('fallo: dice cuál era la correcta, sin depender del color, y muestra la explicación de la opción', async () => {
    const { wrapper } = montar();
    await entradaDeOpcion(wrapper, 'Osteocito').setValue(true);
    await pulsarPrincipal(wrapper);
    const t = texto(wrapper);
    expect(t).toContain('Incorrecto');
    expect(t).toContain('Tu respuesta: incorrecta');
    expect(t).toContain('Era la correcta');
    expect(t).toContain('El osteocito mantiene la matriz, pero ya no la forma.');
    expect(interacciones(wrapper)).toEqual([
      { accion: 'responde_pregunta', objeto: 'qr_p1', resultado: 'incorrecta' },
    ]);
  });

  it('respuesta parcial en opción múltiple: "Parcialmente correcto" y el detalle de aciertos', async () => {
    const { wrapper } = montar();
    await resolverPregunta(wrapper, quiz, true);
    // Marca una correcta y una incorrecta: (1 - 1) / 2 = 0 → incorrecto. Marca solo una correcta: 1 / 2.
    await entradaDeOpcion(wrapper, 'Sostén y protección mecánica').setValue(true);
    await pulsarPrincipal(wrapper);
    const t = texto(wrapper);
    expect(t).toContain('Parcialmente correcto');
    expect(t).toContain('Marcaste 1 de 2 correctas.');
    expect(t).toContain('Era correcta'); // la que faltó
    // Una parcial no cuenta como acierto para el mentor.
    expect(interacciones(wrapper).at(-1)).toEqual({
      accion: 'responde_pregunta',
      objeto: 'qr_p2',
      resultado: 'incorrecta',
    });
  });

  it('opción múltiple con aciertos y errores: el detalle cuenta las incorrectas marcadas', async () => {
    const { wrapper } = montar();
    await resolverPregunta(wrapper, quiz, true);
    for (const o of ['Sostén y protección mecánica', 'Producir bilis', 'Fabricar insulina']) {
      await entradaDeOpcion(wrapper, o).setValue(true);
    }
    await pulsarPrincipal(wrapper);
    expect(texto(wrapper)).toContain('Marcaste 1 de 2 correctas y 2 incorrectas.');
    expect(texto(wrapper)).toContain('Incorrecto'); // (1 - 2) / 2 se acota a 0
  });

  it('verdadero/falso: dos radios fijos "Verdadero" y "Falso" en ese orden', async () => {
    const { wrapper } = montar();
    await resolverPregunta(wrapper, quiz, true);
    await resolverPregunta(wrapper, quiz, true);
    expect(preguntaVisible(wrapper, quiz).id).toBe('qr_p3');
    expect(wrapper.findAll('label').map((l) => l.text())).toEqual(['Verdadero', 'Falso']);
    await entradaDeOpcion(wrapper, 'Verdadero').setValue(true);
    await pulsarPrincipal(wrapper);
    expect(texto(wrapper)).toContain('Incorrecto');
    expect(texto(wrapper)).toContain('el hueso se remodela toda la vida');
  });

  it('ordenar: marca cada paso ("En su lugar"/"Fuera de lugar"), da el detalle y el orden correcto', async () => {
    const { wrapper } = montar();
    for (let i = 0; i < 3; i++) await resolverPregunta(wrapper, quiz, true);
    await responder(wrapper, quiz, true);
    await moverPaso(wrapper, 'Formación', 2); // deja 3 de 4 en su lugar tras el reordenamiento
    await moverPaso(wrapper, 'Inversión', 3);
    await pulsarPrincipal(wrapper);
    const t = texto(wrapper);
    expect(t).toContain('Parcialmente correcto');
    expect(t).toContain('2 de 4 pasos en su lugar.');
    expect(t).toContain('En su lugar');
    expect(t).toContain('Fuera de lugar');
    expect(t).toContain('Orden correcto:');
    const orden = wrapper.findAll('[data-retroalimentacion] ol > li').map((l) => l.text());
    expect(orden).toEqual(['Activación', 'Reabsorción', 'Inversión', 'Formación']);
    // Ya no se puede reordenar.
    expect(wrapper.findAll('[data-accion]')).toHaveLength(0);
  });

  it('el foco se queda en el botón principal tras comprobar y pasa al enunciado al avanzar', async () => {
    const { wrapper } = montar(quiz, { conDocumento: true });
    await responder(wrapper, quiz, true);
    const boton = wrapper.find('button[data-principal]').element as HTMLButtonElement;
    boton.focus();
    await boton.click();
    await flushPromises();
    expect(document.activeElement).toBe(boton);
    expect(wrapper.find('button[data-principal]').element).toBe(boton); // el mismo elemento
    await boton.click();
    await flushPromises();
    const encabezado = wrapper.find('h4[tabindex="-1"]').element;
    expect(document.activeElement).toBe(encabezado);
    expect(encabezado.textContent).toContain('Pregunta 2 de 5');
  });

  it('el anuncio para lectores de pantalla lleva el veredicto y la explicación, una sola vez por respuesta', async () => {
    const { wrapper } = montar();
    const viva = wrapper.find('[aria-live]');
    await responder(wrapper, quiz, true);
    await pulsarPrincipal(wrapper);
    expect(viva.text()).toContain('¡Correcto!');
    expect(viva.text()).toContain('Explicación:');
    expect(viva.text()).toContain('El osteoblasto sintetiza el osteoide'); // sin marcas Markdown
    expect(viva.text()).not.toContain('](');
    expect(viva.text()).not.toContain('glosario:');
  });

  it('un doble clic en "Comprobar" cuenta una sola vez', async () => {
    const { wrapper } = montar();
    await responder(wrapper, quiz, true);
    const boton = wrapper.find('button[data-principal]');
    await boton.trigger('click');
    // El botón ya es "Siguiente": un segundo clic inmediato avanza, no vuelve a comprobar.
    expect(interacciones(wrapper)).toHaveLength(1);
  });

  it('el enlace del glosario no navega: lanza ova:glosario con el id y la actividad', async () => {
    const { wrapper } = montar(quiz, { conDocumento: true });
    const recibidos: { id: string; actividadId: string }[] = [];
    document.body.addEventListener(EVENTO_GLOSARIO, (e) =>
      recibidos.push((e as CustomEvent).detail),
    );
    await responder(wrapper, quiz, true);
    await pulsarPrincipal(wrapper);
    const enlace = wrapper.find('a[data-glosario="osteoblasto"]');
    expect(enlace.exists()).toBe(true);
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true });
    enlace.element.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
    expect(recibidos).toEqual([{ id: 'osteoblasto', actividadId: 'm1_quiz_repaso' }]);
  });
});

/* -------------------------------------------------------------------------------------------
 * 4. Resultado, intentos y penalización
 * ----------------------------------------------------------------------------------------- */

describe('ActividadQuiz: resumen y resultado', () => {
  it('todas correctas: 100 %, 50 puntos, mensaje "correcta" y el foco pasa al encabezado del resultado', async () => {
    const { wrapper } = montar(quiz, { conDocumento: true });
    await completarQuiz(wrapper, quiz, true);
    const r = completada(wrapper)!;
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({
      puntaje: 50,
      intentos: 1,
      precision: 1,
      detalle: { preguntas: { qr_p1: 1, qr_p2: 1, qr_p3: 1, qr_p4: 1, qr_p5: 1 } },
    });
    const t = texto(wrapper);
    expect(t).toContain('Resultado del quiz');
    expect(t).toContain('100 %');
    expect(t).toContain('¡Excelente repaso!');
    expect(t).toContain('Alcanzaste el mínimo de 60 % de acierto para seguir.');
    expect(document.activeElement).toBe(wrapper.find('h4[tabindex="-1"]').element);
    expect(wrapper.find('[aria-live]').text()).toContain('Terminaste el quiz');
  });

  it('mezcla de aciertos: precisión, puntaje y detalle salen de la fórmula común', async () => {
    const { wrapper } = montar();
    await completarQuiz(wrapper, quiz, [true, false, true, false, true]);
    const [r] = completada(wrapper)!;
    expect(r!.precision).toBeCloseTo(0.6, 10);
    expect(r!.puntaje).toBe(30);
    expect(r!.puntaje).toBe(calcularPuntaje(quiz, { precision: r!.precision, intentos: 1 }));
    expect(r!.detalle.preguntas).toEqual({ qr_p1: 1, qr_p2: 0, qr_p3: 1, qr_p4: 0, qr_p5: 1 });
    expect(texto(wrapper)).toContain('Vas bien; revisa las explicaciones');
    expect(problemasDeEmisiones(wrapper.emitted() as EventosEmitidos, quiz)).toEqual([]);
  });

  it('el desglose lista cada pregunta con texto e icono, no solo color', async () => {
    const { wrapper } = montar();
    await completarQuiz(wrapper, quiz, [true, false, true, true, false]);
    const filas = wrapper.findAll('[data-desglose] > li');
    expect(filas).toHaveLength(5);
    expect(filas[0]!.text()).toContain('Correcta.');
    expect(filas[1]!.text()).toContain('Incorrecta.');
    for (const f of filas) expect(f.find('svg').exists()).toBe(true);
  });

  it('con aprobacion_min y precisión por debajo: dice cuánto necesita y ofrece repetir', async () => {
    const { wrapper } = montar();
    await completarQuiz(wrapper, quiz, false);
    const [r] = completada(wrapper)!;
    expect(r!.precision).toBe(0);
    expect(r!.puntaje).toBe(0);
    expect(texto(wrapper)).toContain('Necesitas 60 % de acierto para seguir; inténtalo de nuevo.');
    expect(texto(wrapper)).toContain('Te recomiendo repasar');
    expect(wrapper.find('[data-accion="repetir"]').exists()).toBe(true);
  });

  it('sin aprobacion_min no habla de mínimos', async () => {
    const { wrapper } = montar(variante({ aprobacion_min: undefined }));
    await completarQuiz(wrapper, quiz, false);
    expect(wrapper.find('[data-aprobacion]').exists()).toBe(false);
  });

  it('si ya lo aprobó antes (precisión guardada), lo dice aunque este intento no llegue', async () => {
    const { wrapper } = montar(quiz, {
      estadoPrevio: { servidor: { puntaje: 40, intentos: 1, completada: true, precision: 0.8 } },
    });
    await completarQuiz(wrapper, quiz, false);
    expect(texto(wrapper)).toContain('Ya habías alcanzado el mínimo de 60 %');
  });

  it('repetir: intento siguiente con penalización, "reinicia_actividad", nuevo emisor y una completada por ejecución', async () => {
    const { wrapper } = montar();
    await completarQuiz(wrapper, quiz, true);
    await wrapper.find('[data-accion="repetir"]').trigger('click');
    await flushPromises();
    expect(interacciones(wrapper).at(-1)).toEqual({ accion: 'reinicia_actividad' });
    expect(texto(wrapper)).toContain('Intento 2');
    expect(texto(wrapper)).toContain('0 de 5 respondidas');
    expect(preguntaVisible(wrapper, quiz).id).toBe('qr_p1');
    await completarQuiz(wrapper, quiz, true);
    const r = completada(wrapper)!;
    expect(r).toHaveLength(2);
    expect(r[1]!.intentos).toBe(2);
    expect(r[1]!.puntaje).toBe(45); // 50 x 1 x 0,9
    expect(texto(wrapper)).toContain('el puntaje se ajusta a 90 %');
  });

  it('en el intento repetido el progreso vuelve a emitirse (el emisor se reabre) con intentos = 2', async () => {
    const { wrapper, progresos } = montar();
    await completarQuiz(wrapper, quiz, true);
    const antes = progresos.length;
    await wrapper.find('[data-accion="repetir"]').trigger('click');
    await resolverPregunta(wrapper, quiz, true);
    expect(progresos.length).toBe(antes + 1);
    expect(progresos.at(-1)!.intentos).toBe(2);
    expect(progresos.at(-1)!.avance).toBeCloseTo(0.2, 10);
  });

  it('la penalización respeta piso y por_intento propios de la actividad', async () => {
    const actividad = variante({ penalizacion: { por_intento: 0.5, piso: 0.25 } });
    const { wrapper } = montar(actividad, {
      estadoPrevio: { servidor: { puntaje: 1, intentos: 4, completada: true } },
    });
    await completarQuiz(wrapper, actividad, true);
    const [r] = completada(wrapper)!;
    expect(r!.intentos).toBe(5);
    expect(r!.puntaje).toBe(calcularPuntaje(actividad, { precision: 1, intentos: 5 }));
    expect(r!.puntaje).toBe(13); // 50 x 0,25 = 12,5 → 13
  });

  it('un doble clic en "Ver resultado" emite una sola completada', async () => {
    const { wrapper } = montar();
    for (let i = 0; i < 4; i++) await resolverPregunta(wrapper, quiz, true);
    await responder(wrapper, quiz, true);
    await pulsarPrincipal(wrapper);
    const boton = wrapper.find('button[data-principal]');
    expect(boton.text()).toBe('Ver resultado');
    await boton.trigger('click');
    await boton.trigger('click');
    await flushPromises();
    expect(completada(wrapper)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------------------------
 * 5. Estado previo: intentos, llegada tardía e instantánea
 * ----------------------------------------------------------------------------------------- */

describe('ActividadQuiz: estado previo', () => {
  const servidor = (intentos: number) => ({
    servidor: { puntaje: 10, intentos, completada: true },
  });

  it('con 2 intentos registrados, esta ejecución es la 3 y cobra su penalización', async () => {
    const { wrapper, progresos } = montar(quiz, { estadoPrevio: servidor(2) });
    await completarQuiz(wrapper, quiz, true);
    expect(completada(wrapper)![0]).toMatchObject({ intentos: 3, puntaje: 40 });
    expect(progresos.every((p) => p.intentos === 3)).toBe(true);
    expect(texto(wrapper)).toContain('el puntaje se ajusta a 80 %');
  });

  it('si el estado del servidor llega tarde, antes de tocar nada, recalcula los intentos', async () => {
    const { wrapper } = montar();
    await wrapper.setProps({ estadoPrevio: servidor(2) } as never);
    await completarQuiz(wrapper, quiz, true);
    expect(completada(wrapper)![0]).toMatchObject({ intentos: 3, puntaje: 40 });
  });

  it('un cambio posterior del estado previo, ya con una respuesta dada, NO reinicia el intento', async () => {
    const { wrapper } = montar();
    await resolverPregunta(wrapper, quiz, true);
    await wrapper.setProps({ estadoPrevio: servidor(5) } as never);
    expect(texto(wrapper)).toContain('1 de 5 respondidas'); // lo respondido sigue ahí
    for (let i = 0; i < 4; i++) await resolverPregunta(wrapper, quiz, true);
    expect(completada(wrapper)![0]).toMatchObject({ intentos: 1, puntaje: 50 });
  });

  it('elegir una opción (sin comprobar) ya cuenta como haber empezado', async () => {
    const { wrapper } = montar();
    await entradaDeOpcion(wrapper, 'Osteoblasto').setValue(true);
    await wrapper.setProps({ estadoPrevio: servidor(5) } as never);
    // La selección no se pierde por una respuesta tardía del servidor.
    expect((entradaDeOpcion(wrapper, 'Osteoblasto').element as HTMLInputElement).checked).toBe(
      true,
    );
    await pulsarPrincipal(wrapper);
    await pulsarPrincipal(wrapper);
    for (let i = 0; i < 4; i++) await resolverPregunta(wrapper, quiz, true);
    expect(completada(wrapper)![0]!.intentos).toBe(1);
  });

  it('un estado previo con instantánea que llega tarde también se restaura si no se ha tocado nada', async () => {
    const { wrapper } = montar();
    const instantanea = { v: 1, semilla: 5, r: [[1], [0, 1], null, null, null] };
    await wrapper.setProps({
      estadoPrevio: { progreso: { avance: 0.4, intentos: 1, instantanea } },
    } as never);
    expect(preguntaVisible(wrapper, quiz).id).toBe('qr_p3');
    expect(texto(wrapper)).toContain('2 de 5 respondidas');
  });

  it('reanuda un intento a medias: mismas respuestas, misma semilla, siguiente pregunta pendiente', async () => {
    const primera = montar();
    await resolverPregunta(primera.wrapper, quiz, true);
    await resolverPregunta(primera.wrapper, quiz, false);
    primera.wrapper.unmount(); // vacía el progreso pendiente
    const ultimo = primera.progresos.at(-1)!;
    expect(ultimo.avance).toBeCloseTo(0.4, 10);
    expect(problemasDeEmisiones({ progreso: primera.progresos.map((p) => [p]) }, quiz)).toEqual([]);

    const { wrapper } = montar(quiz, { estadoPrevio: { progreso: ultimo } });
    expect(preguntaVisible(wrapper, quiz).id).toBe('qr_p3');
    expect(texto(wrapper)).toContain('2 de 5 respondidas');
    for (let i = 0; i < 3; i++) await resolverPregunta(wrapper, quiz, true);
    const [r] = completada(wrapper)!;
    expect(r!.detalle.preguntas).toEqual({ qr_p1: 1, qr_p2: 0, qr_p3: 1, qr_p4: 1, qr_p5: 1 });
    expect(r!.precision).toBeCloseTo(0.8, 10);
    expect(r!.intentos).toBe(1);
  });

  it('la semilla guardada fija el orden de las opciones (sin depender del azar de esta sesión)', () => {
    const semilla = 777;
    const esperado = presentarQuiz(quiz.config.preguntas, semilla, {
      barajarPreguntas: false,
      barajarOpciones: true,
    })[0]!;
    const textosEsperados = esperado.ordenOpciones.map((i) => {
      const p = quiz.config.preguntas[0]!;
      return p.formato === 'opcion_multiple' ? p.opciones[i]!.texto : '';
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.123);
    const { wrapper } = montar(quiz, {
      estadoPrevio: {
        progreso: {
          avance: 0,
          intentos: 1,
          instantanea: { v: 1, semilla, r: [null, null, null, null, null] },
        },
      },
    });
    expect(wrapper.findAll('label').map((l) => l.text())).toEqual(textosEsperados);
  });

  it('si todo estaba respondido pero sin terminar, muestra la última con su retroalimentación y "Ver resultado"', () => {
    const instantanea = { v: 1, semilla: 9, r: [[1], [0, 1], false, [3, 1, 0, 2], [2]] };
    const { wrapper } = montar(quiz, {
      estadoPrevio: { progreso: { avance: 1, intentos: 1, instantanea } },
    });
    expect(preguntaVisible(wrapper, quiz).id).toBe('qr_p5');
    expect(wrapper.find('[data-retroalimentacion]').exists()).toBe(true);
    expect(wrapper.find('button[data-principal]').text()).toBe('Ver resultado');
    expect(completada(wrapper)).toBeUndefined();
  });

  it('una instantánea de un intento que el servidor ya cuenta como terminado se descarta (intentos = servidor + 1)', async () => {
    const instantanea = { v: 1, semilla: 9, r: [[1], [0, 1], null, null, null] };
    const { wrapper } = montar(quiz, {
      estadoPrevio: {
        progreso: { avance: 0.4, intentos: 1, instantanea },
        servidor: { puntaje: 20, intentos: 1, completada: true },
      },
    });
    expect(preguntaVisible(wrapper, quiz).id).toBe('qr_p1');
    expect(texto(wrapper)).toContain('0 de 5 respondidas');
    expect(texto(wrapper)).toContain('Intento 2');
  });

  it.each<[string, unknown]>([
    ['una lista en lugar de un objeto', []],
    ['de otra versión (menos preguntas)', { v: 1, semilla: 1, r: [null, null] }],
    ['con un índice fuera de rango', { v: 1, semilla: 1, r: [[99], null, null, null, null] }],
    ['con ids que ya no existen', { visitadas: ['fantasma'], respuestas: { qr_x: 1 } }],
    ['con semilla inválida', { v: 1, semilla: 'abc', r: [null, null, null, null, null] }],
    ['con respuesta de otro formato', { v: 1, semilla: 1, r: [true, null, null, null, null] }],
  ])('ignora una instantánea corrupta (%s) y empieza de cero', async (_n, instantanea) => {
    const { wrapper } = montar(quiz, {
      estadoPrevio: { progreso: { avance: 0.7, intentos: 1, instantanea: instantanea as never } },
    });
    expect(preguntaVisible(wrapper, quiz).id).toBe('qr_p1');
    expect(texto(wrapper)).toContain('0 de 5 respondidas');
    await completarQuiz(wrapper, quiz, true);
    expect(completada(wrapper)).toHaveLength(1);
  });

  it('cambiar de actividad en el mismo componente empieza de cero', async () => {
    const otra = variante({
      id: 'm1_quiz_otro',
      config: { preguntas: [quiz.config.preguntas[2]!] },
    });
    const { wrapper } = montar();
    await resolverPregunta(wrapper, quiz, true);
    await wrapper.setProps({ actividad: otra } as never);
    expect(preguntaVisible(wrapper, otra).id).toBe('qr_p3');
    expect(texto(wrapper)).toContain('0 de 1 respondidas');
  });
});

/* -------------------------------------------------------------------------------------------
 * 6. Orden de los eventos y limpieza
 * ----------------------------------------------------------------------------------------- */

describe('ActividadQuiz: progreso, temporizadores y desmontaje', () => {
  it('agrupa el progreso (no más de una emisión por intervalo) y lo emite al final del intervalo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { wrapper, progresos } = montar();
    await resolverPregunta(wrapper, quiz, true);
    await resolverPregunta(wrapper, quiz, true);
    await resolverPregunta(wrapper, quiz, true);
    expect(progresos).toHaveLength(1); // solo la primera salió enseguida
    await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS);
    expect(progresos).toHaveLength(2);
    expect(progresos.at(-1)!.avance).toBeCloseTo(0.6, 10); // el último valor del grupo
    wrapper.unmount();
    montados = [];
  });

  it('nunca emite progreso después de completada: ni al pasar el intervalo, ni con el último progreso pendiente', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { wrapper, progresos } = montar();
    for (let i = 0; i < 4; i++) await resolverPregunta(wrapper, quiz, true); // hay un progreso pendiente
    await responder(wrapper, quiz, true);
    await pulsarPrincipal(wrapper);
    await pulsarPrincipal(wrapper); // completada
    const antes = progresos.length;
    expect(completada(wrapper)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS * 10);
    expect(progresos).toHaveLength(antes);
    expect(vi.getTimerCount()).toBe(0);
    wrapper.unmount();
    expect(progresos).toHaveLength(antes);
  });

  it('desmontar a medias emite el último progreso pendiente y no deja temporizadores', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { wrapper, progresos } = montar();
    await resolverPregunta(wrapper, quiz, true);
    await resolverPregunta(wrapper, quiz, true);
    expect(vi.getTimerCount()).toBe(1);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(progresos).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS * 5);
    expect(progresos).toHaveLength(2);
  });

  it('el instantáneo emitido siempre respeta el contrato (forma y tamaño), también con 20 preguntas de 7 pasos', async () => {
    const preguntas: Pregunta[] = Array.from({ length: 20 }, (_, i) => ({
      id: `${'q'.repeat(58)}${String(i).padStart(2, '0')}`,
      formato: 'ordenar',
      enunciado: `Ordena la secuencia número ${i}`,
      pasos: Array.from({ length: 7 }, (_, k) => ({
        id: `${'p'.repeat(58)}${String(k).padStart(2, '0')}`,
        texto: `Paso ${k}`,
      })),
      explicacion: 'Explicación suficiente de la pregunta.',
    }));
    const grande = variante({ id: 'm1_quiz_enorme', config: { preguntas } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { wrapper, progresos } = montar(grande);
    await completarQuiz(wrapper, grande, false);
    expect(completada(wrapper)).toHaveLength(1);
    const eventos = wrapper.emitted() as EventosEmitidos;
    expect(
      problemasDeEmisiones({ ...eventos, progreso: progresos.map((p) => [p]) }, grande),
    ).toEqual([]);
    expect(Object.keys(completada(wrapper)![0]!.detalle.preguntas)).toHaveLength(20);
  });
});

/* -------------------------------------------------------------------------------------------
 * 7. Modo revisar
 * ----------------------------------------------------------------------------------------- */

describe('ActividadQuiz: modo revisar', () => {
  it('muestra todas las preguntas con las respuestas correctas y sus explicaciones, sin controles', () => {
    const { wrapper } = montar(quiz, { modo: 'revisar' });
    const articulos = wrapper.findAll('article');
    expect(articulos).toHaveLength(5);
    expect(wrapper.findAll('button')).toHaveLength(0);
    for (const entrada of wrapper.findAll('input')) {
      expect(entrada.attributes('disabled')).toBeDefined();
    }
    const marcadas = wrapper
      .findAll('input:checked')
      .map((e) => e.element.closest('label')!.textContent);
    expect(marcadas.join('|')).toContain('Osteoblasto');
    expect(marcadas.join('|')).toContain('Sostén y protección mecánica');
    expect(marcadas.join('|')).toContain('Reservorio de calcio y fósforo');
    expect(marcadas.join('|')).toContain('Falso');
    expect(marcadas.join('|')).toContain('Cerca del 99 %');
    expect(marcadas).toHaveLength(5);
    expect(texto(wrapper)).toContain('Respuesta correcta');
    for (const p of quiz.config.preguntas) {
      expect(texto(wrapper)).toContain(
        p.explicacion.replace(/\[|\]\(glosario:\w+\)/g, '').slice(0, 20),
      );
    }
    // El orden de los pasos es el correcto y no hay marcas de "fuera de lugar".
    const pasos = articulos[3]!.findAll('ol > li').map((l) => l.find('.texto-linea').text());
    expect(pasos).toEqual(['Activación', 'Reabsorción', 'Inversión', 'Formación']);
    expect(texto(wrapper)).not.toContain('Fuera de lugar');
    expect(texto(wrapper)).not.toContain('Tu respuesta');
  });

  it('no emite nada: ni interacciones, ni progreso, ni completada, aunque se toque todo', async () => {
    const { wrapper } = montar(quiz, { modo: 'revisar' });
    for (const e of wrapper.findAll('input')) await e.trigger('change');
    for (const e of wrapper.findAll('label')) await e.trigger('click');
    await flushPromises();
    expect(wrapper.emitted()).not.toHaveProperty('completada');
    expect(wrapper.emitted()).not.toHaveProperty('interaccion');
    expect(wrapper.emitted()).not.toHaveProperty('progreso');
  });

  it('ignora un estado previo (la instantánea se borra al completar) y un proveedor de IA', () => {
    const ia = vi.fn();
    const instantanea = { v: 1, semilla: 1, r: [[0], null, null, null, null] };
    const { wrapper } = montar(quiz, {
      modo: 'revisar',
      ia,
      estadoPrevio: { progreso: { avance: 0.2, intentos: 1, instantanea } },
    });
    expect(wrapper.findAll('article')).toHaveLength(5);
    expect(wrapper.find('[data-accion="practicar"]').exists()).toBe(false);
    expect(ia).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------------------------
 * 8. Movimiento reducido, toque y teclado
 * ----------------------------------------------------------------------------------------- */

function simularMovimientoReducido(reducido: boolean) {
  const anadidos = vi.fn();
  const quitados = vi.fn();
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (consulta: string) =>
      ({
        matches: reducido && consulta.includes('prefers-reduced-motion'),
        media: consulta,
        onchange: null,
        addEventListener: anadidos,
        removeEventListener: quitados,
        addListener: anadidos,
        removeListener: quitados,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  return { anadidos, quitados };
}

describe('ActividadQuiz: movimiento reducido (R3)', () => {
  it('con prefers-reduced-motion: reduce no hay transiciones de movimiento ni giro', async () => {
    simularMovimientoReducido(true);
    const { wrapper } = montar(quiz);
    expect(wrapper.find('[role="progressbar"] > div').classes().join(' ')).not.toContain(
      'transition',
    );
    await completarQuiz(wrapper, quiz, true);
    expect(wrapper.html()).not.toContain('animate-spin');
    // Y en la lista de pasos:
    const w2 = montar(variante({ config: { preguntas: [quiz.config.preguntas[3]!] } })).wrapper;
    expect(w2.find('ol > li').classes()).not.toContain('transition-transform');
  });

  it('sin la preferencia, la barra sí anima su ancho y las filas su desplazamiento', () => {
    simularMovimientoReducido(false);
    const { wrapper } = montar(quiz);
    expect(wrapper.find('[role="progressbar"] > div').classes().join(' ')).toContain('transition');
    const w2 = montar(variante({ config: { preguntas: [quiz.config.preguntas[3]!] } })).wrapper;
    expect(w2.find('ol > li').classes()).toContain('transition-transform');
  });

  it('el oyente de la preferencia se retira al desmontar (sin fugas)', () => {
    const { anadidos, quitados } = simularMovimientoReducido(true);
    const { wrapper } = montar(quiz);
    expect(anadidos).toHaveBeenCalled();
    wrapper.unmount();
    montados = [];
    expect(quitados.mock.calls.length).toBe(anadidos.mock.calls.length);
  });
});

describe('ActividadQuiz: teclado y toque', () => {
  it('todo se maneja con controles nativos: botones, radios y casillas alcanzables con Tab', async () => {
    const { wrapper } = montar();
    const enfocables = wrapper.findAll('input, button');
    expect(enfocables.length).toBeGreaterThan(3);
    for (const e of enfocables) {
      expect(e.attributes('tabindex')).not.toBe('-1');
    }
    // Ningún elemento que actúe como botón es un <div> o <span> con clic.
    expect(wrapper.findAll('[role="button"]')).toHaveLength(0);
  });

  it('elegir con eventos de puntero táctiles (pointerdown/up + click) selecciona y comprueba', async () => {
    const { wrapper } = montar();
    const etiqueta = wrapper.findAll('label').find((l) => l.text().includes('Osteoblasto'))!;
    await etiqueta.trigger('pointerdown', { pointerType: 'touch', pointerId: 1 });
    await etiqueta.trigger('pointerup', { pointerType: 'touch', pointerId: 1 });
    await etiqueta.find('input').setValue(true); // el navegador traduce el toque en cambio de la entrada
    const boton = wrapper.find('button[data-principal]');
    await boton.trigger('pointerdown', { pointerType: 'touch', pointerId: 1 });
    await boton.trigger('pointerup', { pointerType: 'touch', pointerId: 1 });
    await boton.trigger('click');
    expect(interacciones(wrapper)).toEqual([
      { accion: 'responde_pregunta', objeto: 'qr_p1', resultado: 'correcta' },
    ]);
  });

  it('una pregunta de ordenar se resuelve con los botones (alternativa de teclado) y con arrastre táctil', async () => {
    const ordenar = variante({ config: { preguntas: [quiz.config.preguntas[3]!] } });
    // Botones:
    const a = montar(ordenar);
    await completarQuiz(a.wrapper, ordenar, true);
    expect(completada(a.wrapper)![0]!.precision).toBe(1);
    // Arrastre: se mockea la maquetación de las filas.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const i = Array.from(this.parentElement?.children ?? []).indexOf(this);
      return {
        top: i * 60,
        height: 52,
        bottom: i * 60 + 52,
        left: 0,
        right: 300,
        width: 300,
        x: 0,
        y: i * 60,
        toJSON: () => ({}),
      } as DOMRect;
    });
    const b = montar(ordenar);
    const nombresAntes = b.wrapper.findAll('ol > li').map((f) => f.find('.texto-linea').text());
    const asa = b.wrapper.findAll('[data-asa]')[0]!;
    await asa.trigger('pointerdown', {
      clientY: 26,
      pointerId: 3,
      pointerType: 'touch',
      button: 0,
    });
    await asa.trigger('pointermove', { clientY: 26 + 130, pointerId: 3, pointerType: 'touch' });
    await asa.trigger('pointerup', { clientY: 26 + 130, pointerId: 3, pointerType: 'touch' });
    const nombresDespues = b.wrapper.findAll('ol > li').map((f) => f.find('.texto-linea').text());
    expect(nombresDespues).toEqual([
      nombresAntes[1],
      nombresAntes[2],
      nombresAntes[0],
      nombresAntes[3],
    ]);
    await pulsarPrincipal(b.wrapper);
    expect(interacciones(b.wrapper)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------------------------
 * 9. Estados de error y contenido hostil
 * ----------------------------------------------------------------------------------------- */

describe('ActividadQuiz: estado de error y contenido adversarial', () => {
  it('sin preguntas: mensaje claro en español (role alert), nada se emite y no se rompe', async () => {
    const vacia = variante({ config: { preguntas: [] } });
    const { wrapper } = montar(vacia);
    const alerta = wrapper.find('[role="alert"]');
    expect(alerta.exists()).toBe(true);
    expect(alerta.text()).toContain('No pudimos cargar esta actividad');
    expect(wrapper.find('[aria-live]').exists()).toBe(true);
    expect(wrapper.findAll('button')).toHaveLength(0);
    await wrapper.trigger('click');
    expect(wrapper.emitted('completada')).toBeUndefined();
    expect(wrapper.emitted('progreso')).toBeUndefined();
  });

  it('config ausente, preguntas que no son lista o todas inservibles: mismo estado de error', () => {
    for (const config of [undefined, { preguntas: 'x' }, { preguntas: [null, 3, {}] }]) {
      const rota = { ...quiz, config } as unknown as TipoActividadQuiz;
      const { wrapper } = montar(rota);
      expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    }
  });

  it('descarta las preguntas malas y juega con las buenas', async () => {
    const mezcla = variante({
      config: {
        preguntas: [
          { ...quiz.config.preguntas[2]! },
          {
            id: 'mala',
            formato: 'opcion_multiple',
            enunciado: 'x',
            opciones: [],
            correctas: [],
            explicacion: 'e',
          } as never,
          { ...quiz.config.preguntas[2]! }, // id repetido
        ],
      },
    });
    const { wrapper } = montar(mezcla);
    expect(texto(wrapper)).toContain('0 de 1 respondidas');
    await resolverPregunta(wrapper, mezcla, true); // solo hay una pregunta utilizable
    expect(completada(wrapper)![0]).toMatchObject({ precision: 1, puntaje: 50 });
    expect(Object.keys(completada(wrapper)![0]!.detalle.preguntas)).toEqual(['qr_p3']);
  });

  it('una sola opción (correcta): se puede responder y acierta', async () => {
    const una = variante({
      config: {
        preguntas: [
          {
            id: 'unica',
            formato: 'opcion_multiple',
            enunciado: 'Pregunta con una única opción posible',
            opciones: [{ id: 'solo', texto: 'La única' }],
            correctas: ['solo'],
            explicacion: 'Es la única opción disponible.',
          },
        ],
      },
    });
    const { wrapper } = montar(una);
    await completarQuiz(wrapper, una, true);
    expect(completada(wrapper)![0]).toMatchObject({ precision: 1, puntaje: 50 });
  });

  it('un solo paso a ordenar: no se puede mover, pero se puede comprobar', async () => {
    const uno = variante({
      config: {
        preguntas: [
          {
            id: 'uno',
            formato: 'ordenar',
            enunciado: 'Ordena esta secuencia de un solo paso',
            pasos: [{ id: 's1', texto: 'Único' }],
            explicacion: 'No hay nada más que ordenar.',
          },
        ],
      },
    });
    const { wrapper } = montar(uno);
    for (const b of wrapper.findAll('[data-accion]'))
      expect(b.attributes('disabled')).toBeDefined();
    await pulsarPrincipal(wrapper);
    await pulsarPrincipal(wrapper);
    expect(completada(wrapper)![0]!.precision).toBe(1);
  });

  it('dos pasos: el orden inicial es siempre el invertido', () => {
    const dos = variante({
      config: {
        preguntas: [
          {
            id: 'dos',
            formato: 'ordenar',
            enunciado: 'Ordena esta secuencia de dos pasos',
            pasos: [
              { id: 'a1', texto: 'Primero' },
              { id: 'a2', texto: 'Segundo' },
            ],
            explicacion: 'Primero va antes que segundo.',
          },
        ],
      },
    });
    for (let i = 0; i < 10; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(i / 10);
      const { wrapper } = montar(dos);
      expect(wrapper.findAll('ol > li').map((f) => f.find('.texto-linea').text())).toEqual([
        'Segundo',
        'Primero',
      ]);
      vi.restoreAllMocks();
    }
  });

  it('textos largos y Unicode se muestran sin romper, y el anuncio y el desglose los conservan', async () => {
    const largo = 'Ünïcödé 骨 🦴 عظم '.repeat(25).trim(); // ~400 caracteres
    const explicacion = `${'Explicación larga con ñ y acentos. '.repeat(16)}`.trim(); // ~570
    const raro = variante({
      config: {
        preguntas: [
          {
            id: 'raro',
            formato: 'opcion_multiple',
            enunciado: largo.slice(0, 400),
            opciones: [
              { id: 'o1', texto: 'Ca²⁺ → HPO₄²⁻' },
              { id: 'o2', texto: 'é combinante' },
              { id: 'o3', texto: 'x'.repeat(200) },
            ],
            correctas: ['o1'],
            explicacion: explicacion.slice(0, 600),
          },
        ],
      },
    });
    const { wrapper } = montar(raro);
    expect(wrapper.text()).toContain('Ca²⁺ → HPO₄²⁻');
    await entradaDeOpcion(wrapper, 'Ca²⁺').setValue(true);
    await pulsarPrincipal(wrapper);
    expect(wrapper.find('[aria-live]').text()).toContain('Explicación larga');
    await pulsarPrincipal(wrapper);
    expect(completada(wrapper)![0]!.precision).toBe(1);
    expect(wrapper.find('[data-desglose]').text()).toContain('骨');
  });

  it('ids raros pero válidos (64 caracteres, guiones bajos y números) viajan intactos al detalle y a las interacciones', async () => {
    const idLargo = `m1_${'a1_'.repeat(20)}zz`.slice(0, 64);
    const idOpcion = '0_9_z-y';
    const especial = variante({
      config: {
        preguntas: [
          {
            id: idLargo,
            formato: 'verdadero_falso',
            enunciado: 'El id de esta pregunta mide 64 caracteres',
            correcta: true,
            explicacion: 'Sí: el contrato admite ids largos.',
          },
          {
            id: 'otra',
            formato: 'opcion_multiple',
            enunciado: 'Una opción con id especial',
            opciones: [
              { id: idOpcion, texto: 'Sí' },
              { id: 'b', texto: 'No' },
              { id: 'c', texto: 'Tal vez' },
            ],
            correctas: [idOpcion],
            explicacion: 'El id de la opción no importa al estudiante.',
          },
        ],
      },
    });
    const { wrapper } = montar(especial);
    await completarQuiz(wrapper, especial, true);
    expect(Object.keys(completada(wrapper)![0]!.detalle.preguntas)).toEqual([idLargo, 'otra']);
    expect(interacciones(wrapper)[0]).toEqual({
      accion: 'responde_pregunta',
      objeto: idLargo,
      resultado: 'correcta',
    });
    expect(problemasDeEmisiones(wrapper.emitted() as EventosEmitidos, especial)).toEqual([]);
  });

  it('20 preguntas de 6 opciones con ids de 64 caracteres: el detalle cabe en 4 KB y no hay problemas', async () => {
    const preguntas: Pregunta[] = Array.from({ length: 20 }, (_, i) => ({
      id: `${'q'.repeat(60)}${String(i).padStart(4, '0')}`.slice(0, 64),
      formato: 'opcion_multiple',
      enunciado: `Pregunta número ${i} del examen largo`,
      opciones: Array.from({ length: 6 }, (_, k) => ({ id: `o${k}`, texto: `Opción ${k}` })),
      correctas: ['o2'],
      explicacion: 'Explicación breve de la respuesta.',
    }));
    const larga = variante({ id: 'm1_quiz_largo', puntaje_max: 200, config: { preguntas } });
    const { wrapper } = montar(larga);
    await completarQuiz(wrapper, larga, true);
    expect(problemasDeEmisiones(wrapper.emitted() as EventosEmitidos, larga)).toEqual([]);
    expect(completada(wrapper)![0]).toMatchObject({ precision: 1, puntaje: 200 });
  });

  it('el HTML del contenido se muestra como texto: sin etiquetas vivas, atributos on* ni enlaces javascript:', async () => {
    const hostil = variante({
      instrucciones: '<img src=x onerror=alert(1)> Responde **con cuidado**',
      config: {
        preguntas: [
          {
            id: 'xss',
            formato: 'opcion_multiple',
            enunciado: '<script>alert(1)</script> ¿Cuál es segura? [clic](javascript:alert(2))',
            opciones: [
              {
                id: 'a',
                texto: '<b onclick="x()">negrita</b>',
                explicacion: '<iframe src=//evil></iframe> Sin efecto.',
              },
              { id: 'b', texto: '![img](https://evil/x.png)' },
              { id: 'c', texto: 'Segura' },
            ],
            correctas: ['c'],
            explicacion:
              '<a href="javascript:alert(3)" onmouseover="y()">enlace</a> [malo](javascript:alert(4)) y [bien](https://ejemplo.org/pagina)',
          },
        ],
      },
    });
    const { wrapper } = montar(hostil);
    await entradaDeOpcion(wrapper, 'Segura').setValue(true);
    await pulsarPrincipal(wrapper);
    const raiz = wrapper.element as HTMLElement;
    expect(raiz.querySelector('script, img, iframe, b')).toBeNull();
    expect(raiz.querySelectorAll('[onerror], [onclick], [onmouseover]')).toHaveLength(0);
    for (const a of Array.from(raiz.querySelectorAll('a'))) {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    }
    expect(wrapper.text()).toContain('alert(1)'); // se ve como texto, no se ejecuta
    expect(raiz.querySelector('a[href="https://ejemplo.org/pagina"]')?.getAttribute('rel')).toBe(
      'noopener noreferrer',
    );
  });
});

/* -------------------------------------------------------------------------------------------
 * 10. Punto de extensión: preguntas de refuerzo de IA
 * ----------------------------------------------------------------------------------------- */

describe('ActividadQuiz: práctica con preguntas de IA (punto de extensión)', () => {
  const preguntaIA = (id: string): unknown => ({
    id,
    formato: 'verdadero_falso',
    enunciado: `Pregunta de refuerzo ${id} generada por IA`,
    correcta: true,
    explicacion: 'Explicación generada, mostrada sin HTML: <b>x</b>.',
  });

  async function hastaElResumen(ia?: ProveedorPreguntasIA, actividad = quiz) {
    const montado = montar(actividad, { ia, conDocumento: true });
    await completarQuiz(montado.wrapper, actividad, true);
    return montado;
  }

  it('sin proveedor no se ofrece la práctica, aunque la actividad la pida', async () => {
    const { wrapper } = await hastaElResumen();
    expect(wrapper.find('[data-accion="practicar"]').exists()).toBe(false);
  });

  it('con proveedor pero sin preguntas_ia en la actividad tampoco', async () => {
    const ia = vi.fn();
    const sin = variante({ config: { preguntas_ia: undefined } });
    const { wrapper } = await hastaElResumen(ia, sin);
    expect(wrapper.find('[data-accion="practicar"]').exists()).toBe(false);
  });

  it('pide las preguntas con la petición esperada, muestra la carga y luego la práctica', async () => {
    let resolver!: (v: unknown[]) => void;
    const ia = vi.fn<ProveedorPreguntasIA>(
      () => new Promise<unknown[]>((r) => (resolver = r)) as Promise<readonly unknown[]>,
    );
    const { wrapper } = await hastaElResumen(ia);
    await wrapper.find('[data-accion="practicar"]').trigger('click');
    expect(ia).toHaveBeenCalledTimes(1);
    const [peticion, opciones] = ia.mock.calls[0]!;
    expect(peticion).toMatchObject({
      actividadId: 'm1_quiz_repaso',
      concepto: 'Repaso general del módulo 1',
      cantidad: 3,
      modulo: 1,
    });
    expect(peticion.enunciadosDelDocente).toHaveLength(5);
    expect(peticion.enunciadosDelDocente[0]).toBe('¿Qué célula forma la matriz ósea nueva?');
    expect(opciones.signal.aborted).toBe(false);
    // Carga
    expect(wrapper.find('[role="status"]').text()).toContain('Preparando preguntas de refuerzo');
    expect(wrapper.find('section').attributes('aria-busy')).toBe('true');
    resolver([preguntaIA('ia1'), preguntaIA('ia2')]);
    await flushPromises();
    expect(wrapper.find('[data-practica] article').exists()).toBe(true);
    expect(wrapper.find('[data-practica]').text()).toContain('no suma puntos');
    expect(wrapper.find('section').attributes('aria-busy')).toBeUndefined();
  });

  it('la práctica no puntúa ni emite: ni interacciones, ni progreso, ni otra completada', async () => {
    const ia: ProveedorPreguntasIA = async () => [preguntaIA('ia1'), preguntaIA('ia2')];
    const { wrapper, progresos } = await hastaElResumen(ia);
    const antes = {
      interacciones: interacciones(wrapper).length,
      progresos: progresos.length,
      completadas: completada(wrapper)!.length,
    };
    await wrapper.find('[data-accion="practicar"]').trigger('click');
    await flushPromises();
    // Pregunta 1 (verdadero/falso): elige y comprueba; luego la 2.
    await wrapper.find('[data-practica] input').setValue(true);
    await wrapper.find('[data-practica] button[data-principal]').trigger('click');
    expect(wrapper.find('[data-practica]').text()).toContain('¡Correcto!');
    expect(wrapper.find('[data-practica] b').exists()).toBe(false); // HTML de la IA, escapado
    await wrapper.find('[data-practica] button[data-principal]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-practica] input').setValue(true);
    await wrapper.find('[data-practica] button[data-principal]').trigger('click');
    await wrapper.find('[data-practica] button[data-principal]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-practica]').text()).toContain('Terminaste la práctica: 2 de 2');
    expect({
      interacciones: interacciones(wrapper).length,
      progresos: progresos.length,
      completadas: completada(wrapper)!.length,
    }).toEqual(antes);
  });

  it('recorta a `cantidad` y descarta lo inservible que devuelve el modelo', async () => {
    const ia: ProveedorPreguntasIA = async () => [
      null,
      { id: 'roto' },
      preguntaIA('ia1'),
      preguntaIA('ia2'),
      preguntaIA('ia3'),
      preguntaIA('ia4'),
      preguntaIA('ia5'),
    ];
    const { wrapper } = await hastaElResumen(ia);
    await wrapper.find('[data-accion="practicar"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-practica]').text()).toContain('Pregunta 1 de 3'); // cantidad = 3
  });

  it('si el proveedor falla: mensaje de error con reintentar, sin tocar el resultado', async () => {
    const ia = vi
      .fn<ProveedorPreguntasIA>()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce([preguntaIA('ia1')]);
    const { wrapper } = await hastaElResumen(ia);
    await wrapper.find('[data-accion="practicar"]').trigger('click');
    await flushPromises();
    const alerta = wrapper.find('[data-practica] [role="alert"]');
    expect(alerta.text()).toContain('No pudimos preparar las preguntas de refuerzo');
    expect(completada(wrapper)).toHaveLength(1);
    await alerta.findAll('button')[0]!.trigger('click'); // Reintentar
    await flushPromises();
    expect(ia).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-practica] article').exists()).toBe(true);
  });

  it('si devuelve solo basura, también es un error (no una práctica vacía)', async () => {
    const ia: ProveedorPreguntasIA = async () => [null, 3, { formato: 'abierta' }];
    const { wrapper } = await hastaElResumen(ia);
    await wrapper.find('[data-accion="practicar"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-practica] [role="alert"]').exists()).toBe(true);
  });

  it('cancelar durante la carga aborta la petición y deja una respuesta tardía sin efecto', async () => {
    let resolver!: (v: unknown[]) => void;
    let senal!: AbortSignal;
    const ia: ProveedorPreguntasIA = (_p, { signal }) => {
      senal = signal;
      return new Promise((r) => (resolver = r as never));
    };
    const { wrapper } = await hastaElResumen(ia);
    await wrapper.find('[data-accion="practicar"]').trigger('click');
    await wrapper.find('[data-practica] [role="status"] button').trigger('click'); // Cancelar
    expect(senal.aborted).toBe(true);
    resolver([preguntaIA('ia1')]);
    await flushPromises();
    expect(wrapper.find('[data-practica]').exists()).toBe(false);
    expect(wrapper.find('[data-accion="practicar"]').exists()).toBe(true);
  });

  it('desmontar durante la carga aborta la petición', async () => {
    let senal!: AbortSignal;
    const ia: ProveedorPreguntasIA = (_p, { signal }) => {
      senal = signal;
      return new Promise(() => undefined);
    };
    const { wrapper } = await hastaElResumen(ia);
    await wrapper.find('[data-accion="practicar"]').trigger('click');
    expect(senal.aborted).toBe(false);
    wrapper.unmount();
    expect(senal.aborted).toBe(true);
  });

  it('repetir el quiz cierra la práctica y aborta lo pendiente', async () => {
    let senal!: AbortSignal;
    const ia: ProveedorPreguntasIA = (_p, { signal }) => {
      senal = signal;
      return new Promise(() => undefined);
    };
    const { wrapper } = await hastaElResumen(ia);
    await wrapper.find('[data-accion="practicar"]').trigger('click');
    await wrapper.find('[data-accion="repetir"]').trigger('click');
    expect(senal.aborted).toBe(true);
    expect(wrapper.find('[data-practica]').exists()).toBe(false);
  });
});

/* -------------------------------------------------------------------------------------------
 * 11. Comprobación de que las pruebas no son vacuas (control negativo)
 * ----------------------------------------------------------------------------------------- */

describe('control negativo del verificador de emisiones', () => {
  it('problemasDeEmisiones detecta un resultado mal formado de este componente', () => {
    const problemas = problemasDeEmisiones(
      { completada: [[{ puntaje: 51, intentos: 0, precision: 2, detalle: {} }]] },
      quiz,
    );
    expect(problemas.length).toBeGreaterThanOrEqual(3);
  });
});
