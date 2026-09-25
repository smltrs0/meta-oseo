/**
 * Pruebas de conformidad con el contrato de los componentes de actividad (activities/types.ts).
 *
 * Cada componente de `src/activities/` las ejecuta en su archivo de pruebas:
 *
 *     pruebasDeContratoActividad({
 *       nombre: 'ActivityQuiz',
 *       actividad: quizDeMuestra,
 *       montar: (props) => mount(ActivityQuiz, { props }),
 *       completar: async (wrapper) => { ...responde y pulsa "Terminar"... },
 *     });
 *
 * Comprueban lo que el contrato exige y se puede verificar sin navegador: qué eventos emite y
 * con qué forma, que el puntaje sale de la fórmula común, que reanuda los intentos (también si el
 * estado del servidor llega tarde), que `progreso` nunca llega después de `completada`, que ignora
 * una instantánea corrupta y que en modo `revisar` no emite. Los componentes deben usar
 * `crearEmisorProgreso` (`@/content/progreso`) para lo de `progreso`. Lo que exige un navegador real (tamaño
 * táctil, contraste, foco, `prefers-reduced-motion`) lo revisa F6-01 con las reglas R1 a R10.
 *
 * `problemasDeEmisiones` es una función pura, útil también para pruebas propias.
 */
import type { VueWrapper } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import {
  ACCIONES_INTERACCION,
  INSTANTANEA_MAX_BYTES,
  aPeticionResultadoApi,
  describirInteraccion,
} from '@/activities/types';
import type { InteraccionActividad, PropsActividad, ResultadoActividad } from '@/activities/types';
import { API_PUNTAJE_MAX, PROGRESO_INTERVALO_MIN_MS } from '@/content/constantes';
import { calcularPuntaje } from '@/content/scoring';
import type { ActividadDe, TipoActividad } from '@/content/schema';

export type EventosEmitidos = Readonly<Record<string, readonly (readonly unknown[])[] | undefined>>;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esEntero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor);
}

function bytesDe(valor: unknown): number {
  return new TextEncoder().encode(JSON.stringify(valor)).length;
}

/**
 * Problemas en lo que un componente emitió durante UNA ejecución (lista vacía si cumple).
 * `eventos` es `wrapper.emitted()`.
 */
export function problemasDeEmisiones(
  eventos: EventosEmitidos,
  actividad: Pick<ActividadDe<TipoActividad>, 'id' | 'tipo' | 'puntaje_max'>,
): string[] {
  const problemas: string[] = [];

  for (const [i, argumentos] of (eventos.progreso ?? []).entries()) {
    const p = argumentos[0];
    if (!esObjeto(p)) {
      problemas.push(`progreso #${i}: el payload debe ser un objeto.`);
      continue;
    }
    if (typeof p.avance !== 'number' || !(p.avance >= 0 && p.avance <= 1)) {
      problemas.push(`progreso #${i}: "avance" debe estar entre 0 y 1.`);
    }
    if (!esEntero(p.intentos) || p.intentos < 1) {
      problemas.push(`progreso #${i}: "intentos" debe ser un entero >= 1.`);
    }
    if (!esObjeto(p.instantanea)) {
      problemas.push(`progreso #${i}: "instantanea" debe ser un objeto serializable.`);
    } else if (bytesDe(p.instantanea) > INSTANTANEA_MAX_BYTES) {
      problemas.push(`progreso #${i}: la instantánea supera ${INSTANTANEA_MAX_BYTES} bytes.`);
    }
  }

  for (const [i, argumentos] of (eventos.interaccion ?? []).entries()) {
    const x = argumentos[0];
    if (!esObjeto(x)) {
      problemas.push(`interaccion #${i}: el payload debe ser un objeto.`);
      continue;
    }
    if (!(ACCIONES_INTERACCION as readonly unknown[]).includes(x.accion)) {
      problemas.push(
        `interaccion #${i}: la acción "${String(x.accion)}" no está en el vocabulario.`,
      );
      continue;
    }
    if (x.objeto !== undefined && typeof x.objeto !== 'string') {
      problemas.push(`interaccion #${i}: "objeto" debe ser el id (texto) del elemento.`);
    }
    if (x.resultado !== undefined && x.resultado !== 'correcta' && x.resultado !== 'incorrecta') {
      problemas.push(`interaccion #${i}: "resultado" debe ser "correcta" o "incorrecta".`);
    }
    const texto = describirInteraccion(x as unknown as InteraccionActividad);
    if ([...texto].length > 64)
      problemas.push(`interaccion #${i}: "${texto}" pasa de 64 caracteres.`);
  }

  const completadas = eventos.completada ?? [];
  if (completadas.length > 1) {
    problemas.push(
      `Se emitió "completada" ${completadas.length} veces; debe ser una por ejecución.`,
    );
  }
  for (const [i, argumentos] of completadas.entries()) {
    const r = argumentos[0];
    if (!esObjeto(r)) {
      problemas.push(`completada #${i}: el payload debe ser un ResultadoActividad.`);
      continue;
    }
    const tope = Math.min(API_PUNTAJE_MAX, actividad.puntaje_max);
    if (!esEntero(r.puntaje) || r.puntaje < 0 || r.puntaje > tope) {
      problemas.push(`completada #${i}: "puntaje" debe ser un entero entre 0 y ${tope}.`);
    }
    if (!esEntero(r.intentos) || r.intentos < 1) {
      problemas.push(`completada #${i}: "intentos" debe ser un entero >= 1.`);
    }
    if (typeof r.precision !== 'number' || !(r.precision >= 0 && r.precision <= 1)) {
      problemas.push(`completada #${i}: "precision" debe estar entre 0 y 1.`);
    }
    if (!esObjeto(r.detalle)) {
      problemas.push(`completada #${i}: "detalle" debe ser un objeto.`);
    } else {
      const peticion = aPeticionResultadoApi(actividad, 1, r as unknown as ResultadoActividad);
      if (peticion.cuerpo.detalle?.truncado === true) {
        problemas.push(`completada #${i}: el detalle supera 4 KB serializado y se descartaría.`);
      }
    }
  }
  return problemas;
}

export interface ConfigContrato<T extends TipoActividad> {
  /** Nombre del componente, para el título de las pruebas. */
  nombre: string;
  actividad: ActividadDe<T>;
  /** Monta el componente con esas props (`mount(Componente, { props })`). */
  montar: (props: PropsActividad<T>) => VueWrapper;
  /** Lleva el componente hasta completar la actividad desde el principio. */
  completar: (wrapper: VueWrapper) => Promise<void>;
  /**
   * Precisión que produce `completar` (el resultado debe cuadrar con `calcularPuntaje`). Por
   * defecto solo se comprueba que el puntaje sea coherente con la precisión que emite.
   */
  precisionEsperada?: number;
}

/** Registra las pruebas de conformidad para un componente de actividad. */
export function pruebasDeContratoActividad<T extends TipoActividad>(
  config: ConfigContrato<T>,
): void {
  const { nombre, actividad, montar, completar } = config;
  const propsBase = { modulo: 1 as const, actividad } as unknown as PropsActividad<T>;

  describe(`${nombre}: contrato de las actividades`, () => {
    it('al montarse no emite "completada" ni interacciones', async () => {
      const wrapper = montar(propsBase);
      await flushPromises();
      expect(wrapper.emitted('completada')).toBeUndefined();
      expect(wrapper.emitted('interaccion')).toBeUndefined();
      wrapper.unmount();
    });

    it('expone una región aria-live para anunciar resultados (R4)', async () => {
      const wrapper = montar(propsBase);
      await flushPromises();
      expect(wrapper.find('[aria-live]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('al completarla emite UN resultado válido y todo lo que emite cumple el contrato', async () => {
      const wrapper = montar(propsBase);
      await flushPromises();
      await completar(wrapper);
      await flushPromises();
      const eventos = wrapper.emitted() as EventosEmitidos;
      expect(eventos.completada, 'no emitió "completada"').toHaveLength(1);
      expect(problemasDeEmisiones(eventos, actividad)).toEqual([]);
      wrapper.unmount();
    });

    it('el puntaje sale de la fórmula común (calcularPuntaje) con su precisión y sus intentos', async () => {
      const wrapper = montar(propsBase);
      await flushPromises();
      await completar(wrapper);
      await flushPromises();
      const r = wrapper.emitted('completada')?.[0]?.[0] as {
        puntaje: number;
        intentos: number;
        precision: number;
      };
      expect(r.puntaje).toBe(
        calcularPuntaje(actividad, { precision: r.precision, intentos: r.intentos }),
      );
      if (config.precisionEsperada !== undefined) {
        expect(r.precision).toBeCloseTo(config.precisionEsperada, 6);
      }
      expect(r.intentos).toBe(1);
      wrapper.unmount();
    });

    it('sigue contando los intentos: con 2 registrados en el servidor, esta ejecución es la 3', async () => {
      const wrapper = montar({
        ...propsBase,
        estadoPrevio: { servidor: { puntaje: 10, intentos: 2, completada: true } },
      });
      await flushPromises();
      await completar(wrapper);
      await flushPromises();
      const r = wrapper.emitted('completada')?.[0]?.[0] as { intentos: number };
      expect(r.intentos).toBe(3);
      wrapper.unmount();
    });

    it('si el estado del servidor llega tarde (antes de la primera interacción), cuenta bien los intentos', async () => {
      const wrapper = montar(propsBase);
      await flushPromises();
      await wrapper.setProps({
        estadoPrevio: { servidor: { puntaje: 10, intentos: 2, completada: true } },
      } as never);
      await flushPromises();
      await completar(wrapper);
      await flushPromises();
      const r = wrapper.emitted('completada')?.[0]?.[0] as { intentos: number };
      expect(r.intentos).toBe(3);
      wrapper.unmount();
    });

    it('no emite "progreso" después de "completada", ni al pasar el intervalo del limitador ni al desmontar', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      try {
        // Un oyente propio sigue contando aunque el wrapper se desmonte.
        const alProgreso = vi.fn();
        const wrapper = montar({
          ...propsBase,
          onProgreso: alProgreso,
        } as unknown as PropsActividad<T>);
        await flushPromises();
        await completar(wrapper);
        await flushPromises();
        expect(wrapper.emitted('completada')).toHaveLength(1);
        const antes = alProgreso.mock.calls.length;
        await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS * 4);
        await flushPromises();
        expect(alProgreso.mock.calls.length, 'progreso tras completada').toBe(antes);
        wrapper.unmount();
        expect(alProgreso.mock.calls.length, 'progreso al desmontar').toBe(antes);
      } finally {
        vi.useRealTimers();
      }
    });

    it('ignora una instantánea corrupta o de otro contenido y sigue funcionando', async () => {
      const basura = {
        avance: 0.5,
        intentos: 1,
        instantanea: {
          id_que_no_existe: 'x',
          visitadas: ['fantasma'],
          orden: [9, 9, 9],
          respuestas: null,
        },
      };
      const wrapper = montar({ ...propsBase, estadoPrevio: { progreso: basura } });
      await flushPromises();
      await completar(wrapper);
      await flushPromises();
      expect(wrapper.emitted('completada')).toHaveLength(1);
      wrapper.unmount();
    });

    it('en modo "revisar" no emite ningún evento', async () => {
      const wrapper = montar({
        ...propsBase,
        modo: 'revisar',
        estadoPrevio: {
          servidor: { puntaje: actividad.puntaje_max, intentos: 1, completada: true },
        },
      });
      await flushPromises();
      for (const boton of wrapper.findAll('button')) await boton.trigger('click');
      await flushPromises();
      expect(wrapper.emitted('completada')).toBeUndefined();
      expect(wrapper.emitted('progreso')).toBeUndefined();
      wrapper.unmount();
    });

    it('se desmonta sin errores', async () => {
      const wrapper = montar(propsBase);
      await flushPromises();
      expect(() => wrapper.unmount()).not.toThrow();
    });
  });
}
