/**
 * MODO DESARROLLO SIN BACKEND.
 *
 * Solo se importa desde el guard del router dentro de un bloque
 * `if (import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true')`. Vite
 * reemplaza `import.meta.env.DEV` por `false` al compilar para producción, el bloque
 * desaparece y este módulo queda fuera del bundle (se comprueba con grep sobre dist/).
 */
import type { useAuthStore } from '@/stores/auth';
import type { Usuario } from '@/types/api';

export const USUARIO_DE_DESARROLLO: Usuario = {
  id: 0,
  nombre: 'Estudiante',
  apellido: 'de Desarrollo',
  tipo_identificacion: 'CC',
  numero_identificacion: '0000000000',
  nivel: 'pregrado',
  rol: 'estudiante',
  created_at: '2026-01-01T00:00:00Z',
};

/** Marca la sesión como iniciada con un usuario ficticio, sin token ni llamadas a /api/me. */
export function activarSesionDeDesarrollo(auth: ReturnType<typeof useAuthStore>): void {
  if (!auth.usuario) {
    auth.establecerUsuario(USUARIO_DE_DESARROLLO);
  }
}
