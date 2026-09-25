/**
 * Tipos de las respuestas de la API. Reflejan docs/api-contract.md, que es la fuente
 * de verdad: cualquier cambio aquí exige cambiarlo allí y en services/api.
 */
import type { TipoActividad } from '@/content/schema';
import type { TipoIdentificacion } from '@/lib/identificacion';

export type Nivel = 'pregrado' | 'posgrado';
export type Rol = 'estudiante' | 'docente';

export interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
  tipo_identificacion: TipoIdentificacion;
  numero_identificacion: string;
  nivel: Nivel;
  rol: Rol;
  /** ISO 8601 en UTC con sufijo Z. */
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  /** Segundos hasta que expira el token. */
  expires_in: number;
  user: Usuario;
}

export interface LoginPayload {
  tipo_identificacion: TipoIdentificacion;
  numero_identificacion: string;
}

export interface RegistroPayload extends LoginPayload {
  nombre: string;
  apellido: string;
}

export interface ModuloProgress {
  /** 1 a 6. */
  modulo: number;
  seccion_actual: string | null;
  completado: boolean;
  tiempo_total_seg: number;
  updated_at: string | null;
}

export interface ProgresoResponse {
  /** Siempre 6 elementos (módulos 1 a 6). */
  modulos: ModuloProgress[];
  puntaje_total: number;
  /** Códigos de los logros obtenidos. */
  logros: string[];
}

export interface Logro {
  codigo: string;
  nombre: string;
  descripcion: string;
  obtenido: boolean;
  obtenido_en: string | null;
}

export interface LogrosResponse {
  logros: Logro[];
}

/* -------------------------------------------------------------------------------------------
 * Actividades y progreso por módulo (docs/api-contract.md, "Actividades y puntaje")
 * ----------------------------------------------------------------------------------------- */

/** Fila de `GET /api/activities/results`: una por `activity_id` del usuario autenticado. */
export interface ResultadoActividadFila {
  activity_id: string;
  modulo: number;
  tipo: TipoActividad;
  /** Mayor puntaje entre los intentos completados (0 si ninguno). */
  mejor_puntaje: number;
  /** Mayor número de intento reportado. */
  intentos: number;
  completada: boolean;
  ultimo_intento_en: string | null;
  /** Aún no lo devuelve el servidor (docs/content-schema.md, sección 14): opcional. */
  mejor_precision?: number | null;
}

export interface ResultadosResponse {
  resultados: ResultadoActividadFila[];
}

/** Respuesta de `POST /api/activities/{id}/result`. */
export interface RespuestaResultadoActividad {
  resultado: {
    activity_id: string;
    modulo: number;
    tipo: TipoActividad;
    puntaje: number;
    intentos: number;
    completada: boolean;
    created_at: string;
  };
  puntaje_total: number;
  logros_nuevos: string[];
}

/** Cuerpo de `PUT /api/progress/{modulo}`: todos los campos son opcionales. */
export interface CuerpoProgresoModulo {
  seccion_actual?: string;
  /** 0 a 3600; se suma a `tiempo_total_seg`. */
  tiempo_delta_seg?: number;
  completado?: boolean;
}

/** Respuesta de `PUT /api/progress/{modulo}`. */
export interface RespuestaProgresoModulo {
  modulo: ModuloProgress;
  logros_nuevos: string[];
}
