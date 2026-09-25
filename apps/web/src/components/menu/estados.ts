/**
 * Estado de cada módulo en el menú circular y utilidades de ruta compartidas con el HUD.
 * Funciones puras: no leen stores ni la configuración; quien las llama pasa los datos.
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { TOTAL_MODULOS } from '@/config';

export interface EstadoModulo {
  /** Es el módulo que el estudiante tiene abierto (ruta /modulo/:n). */
  activo: boolean;
  /** El backend lo marca como completado. */
  completado: boolean;
  /** No se puede abrir todavía (solo con bloqueo secuencial). */
  bloqueado: boolean;
}

export interface OpcionesEstado {
  /** Módulo de la ruta actual, o `null` si el estudiante está en otra pantalla. */
  moduloActual: number | null;
  /** Números de los módulos completados (store progreso). */
  completados: readonly number[];
  /** `BLOQUEO_SECUENCIAL` de src/config.ts. */
  bloqueoSecuencial: boolean;
}

/**
 * Estado de un módulo.
 *
 * Bloqueado solo si hay bloqueo secuencial, el módulo no es el primero y el anterior no está
 * completado. Un módulo activo o ya completado nunca se muestra bloqueado: el estudiante ya
 * está dentro (por ejemplo, entró por una URL directa) o ya lo terminó, y ocultarlo tras un
 * candado sería mentirle. El backend no exige orden (docs/api-contract.md), así que puede
 * haber módulos completados sin que el anterior lo esté.
 */
export function estadoDelModulo(numero: number, opciones: OpcionesEstado): EstadoModulo {
  const activo = opciones.moduloActual === numero;
  const completado = opciones.completados.includes(numero);
  const bloqueado =
    opciones.bloqueoSecuencial &&
    numero > 1 &&
    !opciones.completados.includes(numero - 1) &&
    !activo &&
    !completado;
  return { activo, completado, bloqueado };
}

/**
 * Número de módulo (1 a 6) de la ruta actual, o `null` si no es una ruta de módulo.
 * Es la fuente del "módulo actual" para el menú y el HUD: el store del contexto pedagógico
 * conserva el último módulo visitado y no distingue "inicio", así que no sirve para esto.
 */
export function moduloDeLaRuta(
  ruta: Pick<RouteLocationNormalizedLoaded, 'name' | 'params'>,
): number | null {
  if (ruta.name !== 'modulo') return null;
  const bruto = Array.isArray(ruta.params.n) ? ruta.params.n[0] : ruta.params.n;
  const n = Number(bruto);
  return Number.isInteger(n) && n >= 1 && n <= TOTAL_MODULOS ? n : null;
}
