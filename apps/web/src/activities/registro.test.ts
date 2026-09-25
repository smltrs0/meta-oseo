/* eslint-disable vue/one-component-per-file -- los componentes de prueba son mínimos */
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, it } from 'vitest';
import ActividadReserva from '@/components/modulo/ActividadReserva.vue';
import { TIPOS_ACTIVIDAD } from '@/content/schema';
import {
  componenteDeActividad,
  crearRegistroActividades,
  hayComponenteDeActividad,
  tipoDeRuta,
  tiposConComponente,
} from './registro';

const Falso = defineComponent({ render: () => h('p', { 'data-testid': 'falso' }, 'quiz falso') });

/** Deja que el componente asíncrono resuelva su carga. */
async function esperarCarga(): Promise<void> {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
}

describe('tipoDeRuta', () => {
  it('reconoce la convención carpeta/Actividad<Nombre>.vue', () => {
    expect(tipoDeRuta('./quiz/ActividadQuiz.vue')).toBe('quiz');
    expect(tipoDeRuta('./arrastre-molecular/ActividadArrastreMolecular.vue')).toBe(
      'arrastre-molecular',
    );
    expect(tipoDeRuta('./relacion-columnas/ActividadRelacionColumnas.vue')).toBe(
      'relacion-columnas',
    );
    expect(tipoDeRuta('./exploracion-3d/ActividadExploracion3d.vue')).toBe('exploracion-3d');
    expect(tipoDeRuta('./video-texto/ActividadVideoTexto.vue')).toBe('video-texto');
    expect(tipoDeRuta('./multicapa/ActividadMulticapa.vue')).toBe('multicapa');
  });

  it('acepta los nombres del contrato en inglés y el nombre del archivo si la carpeta no basta', () => {
    expect(tipoDeRuta('./layers/ActividadLayers.vue')).toBe('multicapa');
    expect(tipoDeRuta('./scene3d/ActividadScene3d.vue')).toBe('exploracion-3d');
    expect(tipoDeRuta('./otra/ActividadQuiz.vue')).toBe('quiz');
  });

  it('ignora lo que no sigue la convención', () => {
    expect(tipoDeRuta('./quiz/PreguntaQuiz.vue')).toBeNull();
    expect(tipoDeRuta('./quiz/ActividadQuiz.test.ts')).toBeNull();
    expect(tipoDeRuta('./desconocido/ActividadDesconocido.vue')).toBeNull();
    expect(tipoDeRuta('ActividadQuiz.vue')).toBeNull();
  });
});

describe('crearRegistroActividades', () => {
  const registro = crearRegistroActividades({
    './quiz/ActividadQuiz.vue': () => Promise.resolve({ default: Falso }),
  });

  it('informa qué tipos tienen componente, en el orden del contrato', () => {
    expect(registro.hayComponente('quiz')).toBe(true);
    expect(registro.hayComponente('multicapa')).toBe(false);
    expect(registro.tiposDisponibles()).toEqual(['quiz']);
  });

  it('usa la reserva "Esta actividad aún no está disponible" si falta el componente', () => {
    const componente = registro.componenteDe('multicapa');
    expect(componente).toBe(ActividadReserva);
    const wrapper = mount(componente, { props: { actividad: { titulo: 'Capas' } } });
    expect(wrapper.text()).toContain('Esta actividad aún no está disponible');
    expect(wrapper.text()).toContain('Capas');
  });

  it('carga el componente de forma perezosa y devuelve siempre el mismo objeto por tipo', async () => {
    const a = registro.componenteDe('quiz');
    expect(registro.componenteDe('quiz')).toBe(a);
    const wrapper = mount({ render: () => h(a) });
    await esperarCarga();
    expect(wrapper.find('[data-testid="falso"]').exists()).toBe(true);
  });

  it('si la descarga falla muestra la reserva con el mensaje de error', async () => {
    const roto = crearRegistroActividades({
      './quiz/ActividadQuiz.vue': () => Promise.reject(new Error('sin red')),
    });
    const wrapper = mount({ render: () => h(roto.componenteDe('quiz')) });
    await esperarCarga();
    expect(wrapper.text()).toContain('No pudimos cargar esta actividad');
  });

  it('con dos archivos del mismo tipo gana el primero por orden alfabético', async () => {
    const A = defineComponent({ render: () => h('p', 'A') });
    const B = defineComponent({ render: () => h('p', 'B') });
    const r = crearRegistroActividades({
      './quiz/ActividadQuizB.vue': () => Promise.resolve({ default: B }),
      './quiz/ActividadQuizA.vue': () => Promise.resolve({ default: A }),
    });
    const wrapper = mount({ render: () => h(r.componenteDe('quiz')) });
    await esperarCarga();
    expect(wrapper.text()).toBe('A');
  });
});

describe('registro real (import.meta.glob)', () => {
  it('siempre da un componente para cada tipo (real o de reserva) y es coherente', () => {
    for (const tipo of TIPOS_ACTIVIDAD) {
      expect(componenteDeActividad(tipo)).toBeTruthy();
      expect(hayComponenteDeActividad(tipo)).toBe(tiposConComponente().includes(tipo));
    }
  });
});
