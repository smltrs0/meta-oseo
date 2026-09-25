/**
 * Reglas de acceso de la página de módulo, como funciones puras (sin stores ni router): las usan
 * el guard de ruta, la vista y las pruebas. La lógica de fondo es la de `@/content/scoring`
 * (`moduloDesbloqueado`, `estadoDeSecciones`); aquí solo se traduce a lo que la interfaz explica.
 */
import { esBloqueActividad } from '@/content/consultas';
import { textoPlanoDeMarkdown } from '@/content/markdown';
import { moduloDesbloqueado, siguienteModulo } from '@/content/scoring';
import type { Completadas, ResultadoConocido } from '@/content/scoring';
import type { Actividad, Seccion } from '@/content/schema';
import { moduloPorNumero } from '@/data/modulos';
import type { Modulo } from '@/data/modulos';

/* -------------------------------------------------------------------------------------------
 * Módulos
 * ----------------------------------------------------------------------------------------- */

export type DecisionModulo =
  | { permitido: true }
  | {
      permitido: false;
      /** Módulo que hay que completar antes (el anterior al pedido). */
      requerido: Modulo;
      /** A dónde llevar al estudiante: el primer módulo pendiente y desbloqueado. */
      destino: number;
    };

export interface OpcionesAcceso {
  bloqueoSecuencial: boolean;
  /**
   * `false` si aún no se conoce el progreso (la API falló o no hay sesión con token): no se
   * bloquea a nadie por un dato que falta.
   */
  progresoConocido: boolean;
}

/** ¿Puede el estudiante abrir el módulo `n`? */
export function decidirAccesoModulo(
  n: number,
  completados: readonly number[],
  opciones: OpcionesAcceso,
): DecisionModulo {
  if (!opciones.bloqueoSecuencial || !opciones.progresoConocido) return { permitido: true };
  if (moduloDesbloqueado(n, completados, { bloqueoSecuencial: true })) return { permitido: true };
  const requerido = moduloPorNumero(n - 1);
  if (!requerido) return { permitido: true };
  return {
    permitido: false,
    requerido,
    destino: siguienteModulo(completados, { bloqueoSecuencial: true }) ?? 1,
  };
}

/** Mensaje que explica por qué un módulo está bloqueado y qué falta. */
export function mensajeModuloBloqueado(n: number, requerido: Modulo): string {
  const pedido = moduloPorNumero(n);
  const nombre = pedido ? `el módulo ${n} («${pedido.titulo}»)` : `el módulo ${n}`;
  return `Todavía no puedes abrir ${nombre}. Antes completa el módulo ${requerido.numero} («${requerido.titulo}»): los módulos se estudian en orden.`;
}

/* -------------------------------------------------------------------------------------------
 * Secciones
 * ----------------------------------------------------------------------------------------- */

export interface PendienteDeSeccion {
  id: string;
  titulo: string;
  /** `sin_hacer`: no se ha completado. `precision`: se completó pero no llegó al mínimo. */
  motivo: 'sin_hacer' | 'precision';
  /** Porcentaje de acierto exigido (solo con motivo `precision`). */
  minimoPorcentaje?: number;
}

/** Actividades obligatorias de la sección que aún no están superadas, en orden. */
export function pendientesDeSeccion(
  seccion: Seccion,
  superadas: Completadas,
  conocidos: Readonly<Record<string, ResultadoConocido | undefined>>,
): PendienteDeSeccion[] {
  const hechas = superadas instanceof Set ? superadas : new Set(superadas as readonly string[]);
  const pendientes: PendienteDeSeccion[] = [];
  for (const bloque of seccion.bloques) {
    if (!esBloqueActividad(bloque)) continue;
    const a: Actividad = bloque.actividad;
    if (!a.obligatoria || hechas.has(a.id)) continue;
    const completada = conocidos[a.id]?.completada === true;
    pendientes.push({
      id: a.id,
      titulo: textoPlanoDeMarkdown(a.titulo),
      motivo: completada && a.aprobacion_min !== undefined ? 'precision' : 'sin_hacer',
      ...(completada && a.aprobacion_min !== undefined
        ? { minimoPorcentaje: Math.round(a.aprobacion_min * 100) }
        : {}),
    });
  }
  return pendientes;
}

/** Frase que explica qué falta para abrir lo que sigue (vacía si no falta nada). */
export function textoPendientes(pendientes: readonly PendienteDeSeccion[]): string {
  const primera = pendientes[0];
  if (!primera) return '';
  const resto = pendientes.length - 1;
  const ademas = resto > 0 ? ` y ${resto} más de esta sección` : '';
  if (primera.motivo === 'precision') {
    return `Para seguir, repite la actividad «${primera.titulo}»: necesitas al menos ${primera.minimoPorcentaje} % de acierto${ademas}.`;
  }
  return `Para seguir, completa la actividad obligatoria «${primera.titulo}»${ademas}.`;
}

/** Nombre de la actividad por id, para explicar el 409 `modulo_incompleto`. */
export function titulosDeActividades(
  secciones: readonly Seccion[],
  ids: readonly string[],
): string[] {
  const titulos = new Map<string, string>();
  for (const seccion of secciones) {
    for (const bloque of seccion.bloques) {
      if (esBloqueActividad(bloque)) {
        titulos.set(bloque.actividad.id, textoPlanoDeMarkdown(bloque.actividad.titulo));
      }
    }
  }
  return ids.map((id) => titulos.get(id) ?? id);
}

/* -------------------------------------------------------------------------------------------
 * Cabecera
 * ----------------------------------------------------------------------------------------- */

/** Texto de la duración estimada: `40 min` o `1 h 30 min`. */
export function textoDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}
