/**
 * Degradación cuando el fragmento del visor 3D no se puede descargar (red caída, despliegue a medias):
 * la actividad sigue completándose con la lista de partes y avisa en español, sin errores sin capturar.
 */
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { muestra, validar } from '@/content/__fixtures__/utiles';
import { listarActividades } from '@/content/consultas';
import type { ActividadExploracion3d } from '@/content/schema';
import Actividad from './ActividadExploracion3d.vue';

vi.mock('@/scenes/EscenaExploracion.vue', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

enableAutoUnmount(afterEach);

const mandibula = listarActividades(validar(muestra()).modulo!)
  .map((u) => u.actividad)
  .find(
    (a): a is ActividadExploracion3d =>
      a.tipo === 'exploracion-3d' && a.config.modelo === 'mandibula',
  )!;

describe('sin el fragmento del visor', () => {
  it('avisa, deja el fallo solo en la consola y la lista completa la actividad', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = mount(Actividad, {
      props: { modulo: 1, actividad: mandibula },
      attachTo: document.body,
    }) as unknown as VueWrapper;
    await flushPromises();

    const aviso = w.get('[data-testid="aviso-sin-3d"]');
    expect(aviso.text()).toContain('No se pudo cargar el visor 3D');
    expect(aviso.text()).toContain('lista de partes');
    expect(w.find('[data-testid="escena-exploracion"]').exists()).toBe(false);

    for (const id of mandibula.config.requeridos) {
      await w
        .findAll('[data-nodo]')
        .find((b) => b.attributes('data-nodo') === id)!
        .trigger('click');
    }
    expect(w.emitted('completada')).toHaveLength(1);
    // Vue deja constancia del fallo de descarga en la consola (una vez); no llega a error sin capturar.
    expect(error).toHaveBeenCalledTimes(1);
  });
});
