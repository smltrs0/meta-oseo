/**
 * Constantes del esquema de contenido (docs/content-schema.md). Un solo lugar para los límites
 * que también conoce el backend (docs/api-contract.md) y para los patrones de identificadores.
 */

/** Todo id del contenido: snake_case en minúsculas, empieza por letra, hasta 64 caracteres. */
export const PATRON_ID = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Formato de `activity_id` que acepta la API (docs/api-contract.md, `POST /api/activities/{id}/result`).
 * Los ids de actividad del contenido son un subconjunto estricto de este patrón.
 */
export const PATRON_ACTIVITY_ID_API = /^[a-z0-9_-]{1,64}$/;

/** Longitud máxima de cualquier id (también la del contexto pedagógico: cadenas de hasta 64). */
export const MAX_LONGITUD_ID = 64;

/** Límites de la API para el resultado de una actividad (docs/api-contract.md). */
export const API_PUNTAJE_MAX = 1000;
export const API_INTENTOS_MAX = 100;
/** El `detalle` serializado (JSON compacto, UTF-8) no puede superar 4 KB. */
export const API_DETALLE_MAX_BYTES = 4 * 1024;

/**
 * Rango del puntaje total de un módulo (suma de `puntaje_max` de todas sus actividades). El
 * máximo es 1000 (y no 600) porque los guiones de los módulos densos suman hasta 810 y tienen de
 * 13 a 26 actividades; el peso comparable de los seis módulos en el certificado lo da el
 * porcentaje sobre el puntaje de cada módulo, no un tope duro.
 */
export const PUNTAJE_MODULO_MIN = 100;
export const PUNTAJE_MODULO_MAX = 1000;

/** Valores por defecto de la penalización por intentos (docs/content-schema.md, "Puntaje"). */
export const PENALIZACION_POR_INTENTO_DEFECTO = 0.1;
export const PISO_PENALIZACION_DEFECTO = 0.4;

/** Id de sección que el contexto pedagógico usa "antes de que la página fije la suya". */
export const ID_SECCION_RESERVADO = 'inicio';

/** Tamaño máximo de un SVG de contenido, en bytes (móvil: se inyecta inline en la página). */
export const SVG_MAX_BYTES = 200 * 1024;

/**
 * Geometría de referencia del arrastre molecular: el dibujo se muestra al ancho de la pantalla, y
 * 320 px es el teléfono más estrecho que se soporta. Sobre ella se comprueba que los receptores
 * quepan y no se solapen (docs/content-schema.md, 7.2).
 */
export const ANCHO_REFERENCIA_PX = 320;
/** Objetivo táctil de 44 px más 8 px de separación (regla R2 de activities/types.ts). */
export const SEPARACION_MIN_RECEPTORES_PX = 52;
/** Mitad del objetivo táctil: un receptor debe quedar al menos a esta distancia de cada borde. */
export const MARGEN_MIN_RECEPTOR_PX = 22;

/** Espera mínima entre dos eventos `progreso` de una actividad, en milisegundos. */
export const PROGRESO_INTERVALO_MIN_MS = 300;
