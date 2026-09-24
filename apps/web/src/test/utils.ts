/** Utilidades compartidas por las pruebas (no se incluyen en el build). */
import type { Usuario } from '@/types/api';

/** Respuesta JSON como la devolvería fetch. */
export function respuestaJson(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Error propio del contrato: `{"detail": {"code", "message"}}`. */
export function respuestaError(
  status: number,
  code: string,
  message = 'Mensaje del servidor',
): Response {
  return respuestaJson(status, { detail: { code, message } });
}

export function usuarioDePrueba(sobrescribir: Partial<Usuario> = {}): Usuario {
  return {
    id: 1,
    nombre: 'Ana',
    apellido: 'Pérez',
    tipo_identificacion: 'CC',
    numero_identificacion: '1023456789',
    nivel: 'pregrado',
    rol: 'estudiante',
    created_at: '2026-09-23T20:00:00Z',
    ...sobrescribir,
  };
}

export function tokenResponse(usuario: Usuario = usuarioDePrueba(), token = 'jwt-de-prueba') {
  return { access_token: token, token_type: 'bearer', expires_in: 604800, user: usuario };
}

/** Progreso con 6 módulos, como lo entrega GET /api/progress. */
export function progresoDePrueba(completados: number[] = [], puntaje = 0, logros: string[] = []) {
  return {
    modulos: Array.from({ length: 6 }, (_, i) => ({
      modulo: i + 1,
      seccion_actual: null,
      completado: completados.includes(i + 1),
      tiempo_total_seg: 0,
      updated_at: null,
    })),
    puntaje_total: puntaje,
    logros,
  };
}
