/**
 * Pruebas de CamaraExploracion sin WebGL: `@tresjs/core` (useTres, useLoop) se sustituye por dobles y
 * los controles de órbita por un componente con la misma forma (`instance.target`, `instance.update`).
 * Cada "fotograma" es una llamada al gancho que la cámara registra en el bucle. Se comprueba el pegamento
 * con three: transición suave entre vistas, movimiento reducido, cancelación al tomar el control, órdenes
 * repetidas, proyección de puntos y limpieza del gancho al desmontar.
 */
import { enableAutoUnmount, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CamaraExploracion from './CamaraExploracion.vue';
import type { PosicionPunto } from './proyeccion';
import { DURACION_TRANSICION_MS } from './vistas';
import type { EstadoCamara, OrdenCamara } from './vistas';

/** Estado del bucle falso; vive fuera de la fábrica de `vi.mock` (que se iza). */
const bucle = vi.hoisted(() => ({
  ganchos: [] as { fn: () => void; prioridad: number; off: () => void }[],
  invalidate: (() => {}) as () => void,
  camara: null as unknown,
  controles: null as unknown,
  /** `false` simula que los controles aún no existen (`instance` nula). */
  controlesDisponibles: true,
}));

vi.mock('@tresjs/core', async () => {
  const { PerspectiveCamera: Camara } = await import('three');
  const { shallowRef } = await import('vue');
  return {
    useTres: () => ({
      camera: shallowRef(bucle.camara ?? new Camara()),
      invalidate: () => bucle.invalidate(),
    }),
    useLoop: () => ({
      onBeforeRender: (fn: () => void, prioridad = 0) => {
        const gancho = { fn, prioridad, off: vi.fn() };
        bucle.ganchos.push(gancho);
        return { off: gancho.off };
      },
    }),
  };
});

vi.mock('@tresjs/cientos', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    // Misma forma que los controles reales: `instance.target` y `instance.update`.
    OrbitControls: defineComponent({
      name: 'OrbitControls',
      emits: ['start'],
      setup(_props, { expose }) {
        expose({
          get instance() {
            return bucle.controlesDisponibles ? bucle.controles : null;
          },
        });
        return () => h('div', { 'data-test': 'controles' });
      },
    }),
  };
});

const controlesFalsos = { target: new Vector3(), update: vi.fn() };

enableAutoUnmount(afterEach);

const LIMITES = { minima: 0.3, maxima: 10 };
let ahora = 1000;
let camara: PerspectiveCamera;
let invalidate: ReturnType<typeof vi.fn<() => void>>;

type PropsCamara = InstanceType<typeof CamaraExploracion>['$props'];

function montar(props: Partial<PropsCamara> = {}): VueWrapper {
  return mount(CamaraExploracion, {
    props: {
      orden: null,
      limites: LIMITES,
      reducirMovimiento: false,
      puntos: [],
      centro: [0, 0, 0],
      ancho: 400,
      alto: 300,
      ...props,
    },
  }) as unknown as VueWrapper;
}

/** Un fotograma del bucle de render. */
function fotograma(): void {
  for (const g of [...bucle.ganchos].sort((a, b) => a.prioridad - b.prioridad)) g.fn();
}

function estado(): EstadoCamara {
  return {
    objetivo: [controlesFalsos.target.x, controlesFalsos.target.y, controlesFalsos.target.z],
    posicion: [camara.position.x, camara.position.y, camara.position.z],
  };
}

const HACIA: EstadoCamara = { objetivo: [0, 1, 0], posicion: [0, 1, 2] };
const ordenEstado = (id: number, hasta: EstadoCamara = HACIA): OrdenCamara => ({
  id,
  tipo: 'estado',
  estado: hasta,
});

beforeEach(() => {
  ahora = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => ahora);
  camara = new PerspectiveCamera(45, 4 / 3, 0.1, 50);
  camara.position.set(0, 0, 5);
  bucle.camara = camara;
  bucle.ganchos.length = 0;
  invalidate = vi.fn<() => void>();
  bucle.invalidate = invalidate;
  controlesFalsos.target.set(0, 0, 0);
  controlesFalsos.update.mockClear();
  bucle.controles = controlesFalsos;
  bucle.controlesDisponibles = true;
});

describe('transición a una vista o a un nodo', () => {
  it('registra un solo gancho de render, después de los controles (prioridad > 0)', () => {
    montar();
    expect(bucle.ganchos).toHaveLength(1);
    expect(bucle.ganchos[0]!.prioridad).toBeGreaterThan(0);
  });

  it('interpola con suavidad: al inicio no salta, a la mitad va a medio camino y al final llega', () => {
    montar({ orden: ordenEstado(1) });
    fotograma();
    expect(estado().posicion[2]).toBeCloseTo(5, 5); // t = 0: no hay salto
    ahora += DURACION_TRANSICION_MS / 2;
    fotograma();
    const medio = estado();
    expect(medio.posicion[2]).toBeLessThan(5);
    expect(medio.posicion[2]).toBeGreaterThan(2);
    expect(medio.objetivo[1]).toBeGreaterThan(0);
    expect(medio.objetivo[1]).toBeLessThan(1);
    ahora += DURACION_TRANSICION_MS;
    fotograma();
    expect(estado()).toEqual(HACIA);
    expect(controlesFalsos.update).toHaveBeenCalled();
  });

  it('pide otro fotograma mientras dura la transición y deja de pedirlos al terminar', () => {
    montar({ orden: ordenEstado(1) });
    invalidate.mockClear();
    fotograma();
    expect(invalidate).toHaveBeenCalled();
    ahora += DURACION_TRANSICION_MS * 2;
    fotograma(); // termina
    invalidate.mockClear();
    fotograma();
    fotograma();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('con movimiento reducido la vista cambia en un solo paso, sin fotogramas intermedios', () => {
    montar({ orden: ordenEstado(1), reducirMovimiento: true });
    fotograma();
    expect(estado()).toEqual(HACIA);
  });

  it('el zoom de los botones es media transición y respeta los límites', () => {
    montar({ orden: { id: 1, tipo: 'zoom', factor: 2 } });
    fotograma();
    ahora += DURACION_TRANSICION_MS; // más que la mitad
    fotograma();
    expect(estado().posicion[2]).toBeCloseTo(2.5, 5);
  });

  it('un zoom que pasaría del límite se acota a la distancia mínima', () => {
    montar({ orden: { id: 1, tipo: 'zoom', factor: 1000 } });
    fotograma();
    ahora += DURACION_TRANSICION_MS;
    fotograma();
    expect(estado().posicion[2]).toBeCloseTo(LIMITES.minima, 5);
  });

  it('una orden con el mismo id o anterior no se repite; una con id mayor sí', async () => {
    const w = montar({ orden: ordenEstado(2) });
    fotograma();
    ahora += DURACION_TRANSICION_MS * 2;
    fotograma();
    expect(estado()).toEqual(HACIA);
    camara.position.set(0, 0, 5);
    controlesFalsos.target.set(0, 0, 0);
    await w.setProps({ orden: ordenEstado(2) }); // mismo id
    fotograma();
    expect(estado().posicion[2]).toBe(5);
    await w.setProps({ orden: ordenEstado(1) }); // id anterior
    fotograma();
    expect(estado().posicion[2]).toBe(5);
    await w.setProps({ orden: ordenEstado(3) }); // nueva
    fotograma();
    ahora += DURACION_TRANSICION_MS * 2;
    fotograma();
    expect(estado()).toEqual(HACIA);
  });

  it('una orden que llega antes de que existan la cámara y los controles no se pierde', () => {
    bucle.camara = camara;
    montar({ orden: ordenEstado(1) });
    // Sin instancia de controles el gancho no hace nada, pero la orden queda pendiente.
    bucle.controlesDisponibles = false;
    fotograma();
    expect(estado().posicion[2]).toBe(5);
    bucle.controlesDisponibles = true;
    fotograma();
    ahora += DURACION_TRANSICION_MS * 2;
    fotograma();
    expect(estado()).toEqual(HACIA);
  });

  it('una orden nueva a mitad de transición parte desde donde está la cámara (sin salto)', async () => {
    const w = montar({ orden: ordenEstado(1) });
    fotograma();
    ahora += DURACION_TRANSICION_MS / 2;
    fotograma();
    const antes = estado().posicion[2];
    await w.setProps({ orden: ordenEstado(2, { objetivo: [0, 0, 0], posicion: [0, 0, 8] }) });
    fotograma(); // t = 0 de la nueva
    expect(estado().posicion[2]).toBeCloseTo(antes, 4);
  });
});

describe('el estudiante toma el control', () => {
  it('al girar o acercar (start) se cancela la transición y se avisa: la vista deja de ser "con nombre"', async () => {
    const w = montar({ orden: ordenEstado(1) });
    fotograma();
    ahora += DURACION_TRANSICION_MS / 2;
    fotograma();
    const enPleno = estado();
    w.findComponent({ name: 'OrbitControls' }).vm.$emit('start');
    expect(w.emitted('interrumpida')).toHaveLength(1);
    ahora += DURACION_TRANSICION_MS;
    fotograma();
    expect(estado()).toEqual(enPleno); // la cámara ya no la mueve la transición
  });

  it('una orden aún sin aplicar también se descarta al tomar el control', () => {
    const w = montar({ orden: ordenEstado(1) });
    w.findComponent({ name: 'OrbitControls' }).vm.$emit('start');
    fotograma();
    expect(estado().posicion[2]).toBe(5);
  });
});

describe('proyección de los puntos', () => {
  const puntos = [
    { id: 'centro', punto: [0, 0, 0] as const },
    { id: 'fuera', punto: [100, 0, 0] as const },
    { id: 'lado_lejano', punto: [0, 0, -1] as const },
  ];

  it('emite las posiciones en píxeles del lienzo, con en pantalla y detrás', () => {
    const w = montar({ puntos });
    fotograma();
    const [posiciones] = w.emitted('proyeccion')![0] as [PosicionPunto[]];
    const porId = Object.fromEntries(posiciones.map((p) => [p.id, p]));
    expect(porId.centro!.x).toBeCloseTo(200, 3);
    expect(porId.centro!.y).toBeCloseTo(150, 3);
    expect(porId.centro!.enPantalla).toBe(true);
    expect(porId.fuera!.enPantalla).toBe(false);
    expect(porId.lado_lejano!.detras).toBe(true);
    expect(porId.centro!.detras).toBe(false);
  });

  it('no vuelve a emitir mientras nada se mueve, y sí cuando la cámara cambia', () => {
    const w = montar({ puntos });
    fotograma();
    fotograma();
    fotograma();
    expect(w.emitted('proyeccion')).toHaveLength(1);
    camara.position.set(3, 0, 5);
    fotograma();
    expect(w.emitted('proyeccion')).toHaveLength(2);
  });

  it('reproyecta al cambiar el tamaño del lienzo o los puntos', async () => {
    const w = montar({ puntos });
    fotograma();
    await w.setProps({ ancho: 800 });
    fotograma();
    const ultimo = w.emitted('proyeccion')!.at(-1)![0] as PosicionPunto[];
    expect(ultimo.find((p) => p.id === 'centro')!.x).toBeCloseTo(400, 3);
    await w.setProps({ puntos: [puntos[0]!] });
    fotograma();
    expect((w.emitted('proyeccion')!.at(-1)![0] as PosicionPunto[]).map((p) => p.id)).toEqual([
      'centro',
    ]);
  });

  it('sin puntos no emite (o emite vacío una vez) y no falla', () => {
    const w = montar({ puntos: [] });
    expect(() => fotograma()).not.toThrow();
    for (const e of w.emitted('proyeccion') ?? []) expect(e[0]).toEqual([]);
  });
});

describe('desmontaje', () => {
  it('retira el gancho del bucle y no vuelve a tocar la cámara', () => {
    const w = montar({ orden: ordenEstado(1) });
    fotograma();
    w.unmount();
    expect(bucle.ganchos[0]!.off).toHaveBeenCalledTimes(1);
  });

  it('desmontar con una orden pendiente no deja nada corriendo', () => {
    const w = montar({ orden: ordenEstado(1) });
    w.unmount();
    expect(bucle.ganchos[0]!.off).toHaveBeenCalledTimes(1);
  });
});
