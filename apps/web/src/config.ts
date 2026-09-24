/**
 * Constantes de configuración de la SPA. Un solo lugar para lo que otros módulos
 * (menú, HUD, stores) necesitan consultar.
 */

/**
 * Si es `true`, un módulo solo se abre cuando el anterior está completado.
 * El backend no exige orden en Fase 1 (docs/api-contract.md, "Progreso"), así que el
 * bloqueo es responsabilidad del frontend y se activa en F2-08, cuando existan las
 * actividades obligatorias. Hasta entonces todos los módulos están abiertos.
 */
export const BLOQUEO_SECUENCIAL = false;

/** Prefijo de la API. Vite lo proxifica a FastAPI en desarrollo; nginx en Docker. */
export const API_BASE = '/api';

/** Cantidad de módulos del OVA (briefing pedagógico). */
export const TOTAL_MODULOS = 6;

/** `ContextoPedagogico.interaccionesRecientes` guarda como máximo este número de eventos. */
export const MAX_INTERACCIONES_RECIENTES = 10;

/** El contrato valida las cadenas del contexto con un máximo de 64 caracteres. */
export const MAX_LONGITUD_CONTEXTO = 64;

/** Clave de localStorage para el JWT. */
export const CLAVE_TOKEN = 'ova.token';
