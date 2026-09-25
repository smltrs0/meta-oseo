/**
 * Guard de los módulos (F2-08): con el bloqueo secuencial activo, un módulo solo se abre cuando el
 * anterior está completado. En vez de un rebote mudo, el estudiante llega al primer módulo que sí
 * puede estudiar con `?bloqueado=n` y la página de módulo le explica qué le falta.
 *
 * Falla ABIERTO: si el progreso no se pudo cargar (API caída, modo de desarrollo sin backend) no se
 * bloquea a nadie por un dato que falta; la propia página vuelve a comprobarlo cuando lo conozca.
 * Las secciones de dentro del módulo las protege la página (ver `ModuloView.vue`).
 */
import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router';
import { decidirAccesoModulo } from '@/components/modulo/acceso';
import { BLOQUEO_SECUENCIAL } from '@/config';
import { useAuthStore } from '@/stores/auth';
import { useProgresoStore } from '@/stores/progreso';

export async function guardarModulo(to: RouteLocationNormalized): Promise<true | RouteLocationRaw> {
  if (to.name !== 'modulo' || !BLOQUEO_SECUENCIAL) return true;
  // Sin sesión decide guardarSesion (registrado antes que este guard).
  if (!useAuthStore().isAuthenticated) return true;

  const n = Number(to.params.n);
  const progreso = useProgresoStore();
  await progreso.load();

  const decision = decidirAccesoModulo(n, progreso.modulosCompletados, {
    bloqueoSecuencial: BLOQUEO_SECUENCIAL,
    progresoConocido: progreso.loaded,
  });
  if (decision.permitido) return true;
  return {
    name: 'modulo',
    params: { n: decision.destino },
    query: { bloqueado: String(n) },
    replace: true,
  };
}
