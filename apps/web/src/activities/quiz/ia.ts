/**
 * PUNTO DE EXTENSIÓN: preguntas de refuerzo generadas por IA (F4-03).
 *
 * El contrato de la actividad NO cambia (mismas props y mismos eventos). El anfitrión (la página del
 * módulo) o el mentor de IA proporciona una función con `provide(CLAVE_PREGUNTAS_IA, generar)` y el
 * quiz, cuando la actividad declara `config.preguntas_ia: { cantidad }` y ya terminó la parte
 * puntuable, ofrece "Practicar con preguntas de refuerzo".
 *
 * Reglas de la práctica (docs/content-schema.md 7.4 y cabecera de `activities/types.ts`):
 *  - NO puntúa y NO emite `progreso`, `interaccion` ni `completada`: el servidor no puede validar
 *    lo que el docente no escribió. La ejecución puntuable ya se emitió antes.
 *  - Las preguntas que devuelve el proveedor son datos NO confiables: se depuran con
 *    `depurarPreguntas` (forma mínima válida) y se recortan a `cantidad`; sus textos se muestran
 *    siempre con `renderizarLinea`, nunca como HTML.
 *  - Mientras se generan, el quiz muestra un estado de carga; si falla o devuelve algo inutilizable,
 *    un mensaje de error con "Reintentar". Nada de eso bloquea la actividad ya completada.
 *  - La petición se cancela con `signal` si el estudiante cierra la práctica o se desmonta el quiz.
 *
 * Ejemplo (en el anfitrión):
 *
 *     provide(CLAVE_PREGUNTAS_IA, async (peticion, { signal }) => {
 *       const r = await apiFetch('/ai/quiz', { method: 'POST', body: peticion, signal });
 *       return r.preguntas; // cualquier `unknown[]`: el quiz lo valida
 *     });
 */
import type { InjectionKey } from 'vue';
import type { Pregunta } from '@/content/schema';

export interface PeticionPreguntasIA {
  /** Id de la actividad (`actividad.id`). */
  actividadId: string;
  /** Tema de la generación: el `concepto` de la actividad. */
  concepto: string;
  /** Cuántas preguntas pedir (`config.preguntas_ia.cantidad`, de 1 a 5). */
  cantidad: number;
  /** Enunciados en texto plano de las preguntas del docente, para no repetirlas. */
  enunciadosDelDocente: readonly string[];
  /** Módulo (1 a 6) al que pertenece la actividad. */
  modulo: number;
}

export interface OpcionesGeneracionIA {
  /** Se aborta al cerrar la práctica o al desmontar el quiz: el proveedor debe respetarla. */
  signal: AbortSignal;
}

/**
 * Devuelve preguntas con la forma de `Pregunta` (`@/content/schema`). El tipo es `unknown[]` a
 * propósito: lo que llega de un modelo se valida, no se confía.
 */
export type ProveedorPreguntasIA = (
  peticion: PeticionPreguntasIA,
  opciones: OpcionesGeneracionIA,
) => Promise<readonly unknown[]>;

export const CLAVE_PREGUNTAS_IA: InjectionKey<ProveedorPreguntasIA> =
  Symbol('ova:quiz:preguntas-ia');

export type { Pregunta };

/**
 * Evento DOM que el quiz lanza (con `bubbles` y `composed`) sobre el enlace del glosario que el
 * estudiante activó: `detail = { id, actividadId }`. El anfitrión lo escucha en un ancestro para
 * abrir la definición (`glosario` del módulo). El quiz cancela la navegación al ancla
 * `#glosario-{id}`, que no existe en la página.
 */
export const EVENTO_GLOSARIO = 'ova:glosario';

export interface DetalleEventoGlosario {
  id: string;
  actividadId: string;
}
