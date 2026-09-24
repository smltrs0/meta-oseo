/**
 * Tipos de las respuestas de la API. Reflejan docs/api-contract.md, que es la fuente
 * de verdad: cualquier cambio aquí exige cambiarlo allí y en services/api.
 */
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
