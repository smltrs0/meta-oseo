/**
 * Ayudas para las pruebas del menú circular y del HUD. No forman parte de la aplicación:
 * nadie las importa fuera de `*.test.ts`, así que no llegan al build.
 */
import { defineComponent, h } from 'vue';
import { vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { Router } from 'vue-router';

const Vacio = defineComponent({ render: () => h('div') });

/**
 * Router mínimo con las rutas que usan el menú y el HUD (mismos nombres y metadatos que
 * `src/router`), sin guardas ni vistas reales para que las pruebas no dependan de la sesión.
 */
export async function crearRouterDePrueba(inicial = '/'): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'inicio', component: Vacio, meta: { titulo: 'Inicio' } },
      { path: '/modulo/:n([1-6])', name: 'modulo', component: Vacio, meta: { titulo: 'Módulo' } },
      {
        path: '/demo-mandibula',
        name: 'demo_mandibula',
        component: Vacio,
        meta: { titulo: 'Demo de mandíbula 3D' },
      },
    ],
  });
  await router.push(inicial);
  await router.isReady();
  return router;
}

/** Simula la preferencia del sistema `prefers-reduced-motion` (se restaura sola tras la prueba). */
export function simularMovimientoReducido(reducir: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (consulta: string) =>
      ({
        matches: reducir && consulta.includes('prefers-reduced-motion'),
        media: consulta,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

/** Cambia el tamaño de la ventana simulada (happy-dom) y dispara el evento `resize`. */
export function fijarViewport(ancho: number, alto: number): void {
  const ventana = window as unknown as {
    happyDOM: { setViewport(v: { width: number; height: number }): void };
  };
  ventana.happyDOM.setViewport({ width: ancho, height: alto });
}

/** Da el foco a un elemento envuelto por Vue Test Utils. */
export function enfocar(envoltorio: { element: Element }): void {
  (envoltorio.element as HTMLElement).focus();
}
