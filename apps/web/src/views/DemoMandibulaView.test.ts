import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DemoMandibulaView from './DemoMandibulaView.vue';

function montar() {
  // La escena real necesita WebGL; aquí solo importa el marco de la vista.
  return mount(DemoMandibulaView, { global: { stubs: { MandibulaScene: true } } });
}

describe('DemoMandibulaView', () => {
  it('tiene un único h1 que nombra la región de la página', () => {
    const wrapper = montar();
    const titulo = wrapper.get('h1');
    expect(titulo.text()).toBe('Demo de mandíbula 3D');
    const region = wrapper.get('section');
    expect(region.attributes('aria-labelledby')).toBe(titulo.attributes('id'));
    expect(wrapper.findAll('h1')).toHaveLength(1);
  });

  it('indica que es una demo de la Fase 1 y atribuye el modelo con su licencia', () => {
    const wrapper = montar();
    expect(wrapper.text()).toContain('Demo de la Fase 1');
    expect(wrapper.text()).toContain('modelo provisional');
    expect(wrapper.text()).toContain('Database Center for Life Science');
    expect(wrapper.text()).toContain('CC BY-SA 2.1');
    // La licencia exige señalar que se modificó el modelo.
    expect(wrapper.text()).toContain('reorientado, centrado y reescalado');
  });

  it('los enlaces de atribución apuntan a la fuente y a la licencia y abren de forma segura', () => {
    const enlaces = montar().findAll('a');
    expect(enlaces).toHaveLength(2);
    const [fuente, licencia] = enlaces;
    expect(fuente?.attributes('href')).toBe(
      'https://commons.wikimedia.org/wiki/File:BodyParts3D_FJ6399_Mandible.stl',
    );
    expect(licencia?.attributes('href')).toBe(
      'https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en',
    );
    for (const enlace of enlaces) {
      expect(enlace.attributes('target')).toBe('_blank');
      expect(enlace.attributes('rel')).toBe('noopener noreferrer');
    }
  });

  it('monta la escena en el espacio restante de la vista', () => {
    const wrapper = montar();
    expect(wrapper.find('mandibula-scene-stub').exists()).toBe(true);
  });
});
