/**
 * Rutas de la SPA. Todas las vistas se cargan de forma perezosa: la pantalla de acceso no
 * arrastra el shell, ni el shell arrastra Three.js (solo /demo-mandibula lo carga).
 *
 * Nombres de ruta en snake_case español (regla del proyecto); las rutas visibles en URL
 * mantienen el formato acordado (/modulo/3, /demo-mandibula).
 */
import { watch } from 'vue';
import type { Router, RouteRecordRaw } from 'vue-router';
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { guardarSesion } from './guard';

declare module 'vue-router' {
  interface RouteMeta {
    /** Ruta accesible sin sesión. */
    publica?: boolean;
    /** Título de la pestaña y de la pantalla (sin el nombre de la aplicación). */
    titulo?: string;
  }
}

export const NOMBRE_APP = 'Metabolismo óseo · OVA';

export const rutas: RouteRecordRaw[] = [
  {
    path: '/acceso',
    name: 'acceso',
    component: () => import('@/views/AccesoView.vue'),
    meta: { publica: true, titulo: 'Ingresar' },
  },
  {
    // Layout de las rutas autenticadas: menú, HUD y mentor alrededor de <RouterView/>.
    path: '/',
    component: () => import('@/components/AppShell.vue'),
    children: [
      {
        path: '',
        name: 'inicio',
        component: () => import('@/views/HomeView.vue'),
        meta: { titulo: 'Inicio' },
      },
      {
        // El patrón ([1-6]) deja que /modulo/7 caiga en el 404 sin validar a mano.
        path: 'modulo/:n([1-6])',
        name: 'modulo',
        component: () => import('@/views/ModuloView.vue'),
        props: (route) => ({ n: Number(route.params.n) }),
        meta: { titulo: 'Módulo' },
      },
      {
        path: 'demo-mandibula',
        name: 'demo_mandibula',
        component: () => import('@/views/DemoMandibulaView.vue'),
        meta: { titulo: 'Demo de mandíbula 3D' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'no_encontrado',
    component: () => import('@/views/NoEncontradoView.vue'),
    meta: { publica: true, titulo: 'Página no encontrada' },
  },
];

export function crearRouter(history = createWebHistory()): Router {
  const router = createRouter({
    history,
    routes: rutas,
    scrollBehavior: (_to, _from, guardada) => guardada ?? { top: 0 },
  });
  router.beforeEach(guardarSesion);
  router.afterEach((to) => {
    const titulo = to.meta.titulo;
    document.title = titulo ? `${titulo} · ${NOMBRE_APP}` : NOMBRE_APP;
  });
  return router;
}

/**
 * Si la sesión se cierra (401 de la API, botón de salir), lleva a /acceso desde cualquier
 * ruta protegida. Requiere que Pinia ya esté instalada.
 */
export function vigilarSesion(router: Router): () => void {
  const auth = useAuthStore();
  return watch(
    () => auth.isAuthenticated,
    (autenticado) => {
      if (!autenticado && !router.currentRoute.value.meta.publica) {
        void router.replace({ name: 'acceso' });
      }
    },
  );
}

export const router = crearRouter();
