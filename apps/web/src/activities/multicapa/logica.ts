/**
 * Lógica pura de la actividad multicapa (sin Vue ni DOM): consignas del modo `identificar`,
 * veredicto de un toque, barajado estable, instantánea del intento y detalle del resultado.
 *
 * Reglas (docs/content-schema.md 7.1 y cabecera de `activities/types.ts`, "Casos límite"):
 *  - Las consignas se piden en el orden de `requeridas`: por cada capa, su `pista` y luego sus
 *    `pistas_extra`. Cada consigna es un toque más y cuenta para la precisión.
 *  - Un toque sobre una capa de `capas` que NO es la pedida cuenta un fallo, salvo que esa capa
 *    ya se haya acertado antes. Tocar fuera de toda capa no cuenta (no llega aquí).
 *  - La instantánea guarda lo mínimo (ids, no textos) y se valida contra la configuración: lo que
 *    no exista en el contenido actual se ignora.
 */
import type { DetalleMulticapa, JsonObjeto } from '@/activities/types';
import type { ConfigMulticapa } from '@/content/schema';

type Capa = ConfigMulticapa['capas'][number];

/** Techo de fallos por capa que se guarda: evita números absurdos en una instantánea manipulada. */
const MAX_ERRORES_POR_CAPA = 999;

export interface Consigna {
  /** Id de la capa que hay que tocar. */
  capa: string;
  /** Texto de la consigna (Markdown de una línea). */
  texto: string;
}

/**
 * Ids de `requeridas` que existen en `capas`, sin repetir y en el orden dado. La validación del
 * contenido ya lo garantiza; esto evita que un contenido roto deje la actividad sin salida.
 */
export function requeridasEfectivas(config: ConfigMulticapa): string[] {
  const existentes = new Set(config.capas.map((c) => c.id));
  const vistas = new Set<string>();
  const resultado: string[] = [];
  for (const id of config.requeridas) {
    if (existentes.has(id) && !vistas.has(id)) {
      vistas.add(id);
      resultado.push(id);
    }
  }
  return resultado;
}

/** Consignas del modo `identificar`: una por `pista` y por cada `pistas_extra`, en orden. */
export function construirConsignas(config: ConfigMulticapa): Consigna[] {
  const porId = new Map<string, Capa>();
  for (const capa of config.capas) if (!porId.has(capa.id)) porId.set(capa.id, capa);
  const consignas: Consigna[] = [];
  for (const id of requeridasEfectivas(config)) {
    const capa = porId.get(id);
    if (!capa) continue;
    const textos = [capa.pista, ...(capa.pistas_extra ?? [])].filter(
      (t): t is string => typeof t === 'string' && t.trim() !== '',
    );
    // Contenido sin `pista` (el esquema lo rechaza): se pide por el nombre, para no dejarla sin salida.
    if (textos.length === 0) textos.push(`Toca «${capa.etiqueta}» en el dibujo.`);
    for (const texto of textos) consignas.push({ capa: id, texto });
  }
  return consignas;
}

export type VeredictoToque = 'correcta' | 'incorrecta' | 'repetida';

/**
 * Veredicto de un toque sobre `tocada` (una capa de `capas`) cuando se pide `pedida`:
 *  - `correcta`: es la capa pedida.
 *  - `repetida`: no es la pedida pero ya se acertó antes; no cuenta como fallo.
 *  - `incorrecta`: cualquier otra capa; cuenta un fallo.
 */
export function veredictoDeToque(
  tocada: string,
  pedida: string,
  acertadas: ReadonlySet<string>,
): VeredictoToque {
  if (tocada === pedida) return 'correcta';
  return acertadas.has(tocada) ? 'repetida' : 'incorrecta';
}

/** Capas ya acertadas cuando se han resuelto las primeras `paso` consignas. */
export function capasAcertadas(consignas: readonly Consigna[], paso: number): Set<string> {
  return new Set(consignas.slice(0, Math.max(0, paso)).map((c) => c.capa));
}

/* -------------------------------------------------------------------------------------------
 * Barajado estable
 * ----------------------------------------------------------------------------------------- */

/** Semilla nueva para una ejecución. */
export function nuevaSemilla(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Barajado determinista (mulberry32 + Fisher-Yates): la misma semilla da el mismo orden. */
export function barajar<T>(lista: readonly T[], semilla: number): T[] {
  let estado = semilla >>> 0;
  const azar = (): number => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j] as T, copia[i] as T];
  }
  return copia;
}

/* -------------------------------------------------------------------------------------------
 * Instantánea del intento (ProgresoActividad.instantanea)
 * ----------------------------------------------------------------------------------------- */

export type EstadoIntento =
  | { modo: 'explorar'; visitadas: string[] }
  | {
      modo: 'identificar';
      /** Consignas ya resueltas (índice de la consigna actual). */
      paso: number;
      /** Fallos por id de la capa que se pedía. */
      erroresPorCapa: Record<string, number>;
      /** Solo si la instantánea traía una semilla válida. */
      semilla?: number;
    };

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Instantánea a guardar. Ids sin repetir; el tamaño queda muy por debajo de 8 KB. */
export function crearInstantanea(estado: EstadoIntento & { semilla?: number }): JsonObjeto {
  if (estado.modo === 'explorar') {
    return { modo: 'explorar', visitadas: [...estado.visitadas] };
  }
  return {
    modo: 'identificar',
    paso: estado.paso,
    ...(estado.semilla !== undefined ? { semilla: estado.semilla } : {}),
    errores_por_capa: { ...limpiarErrores(estado.erroresPorCapa) },
  };
}

function limpiarErrores(errores: Record<string, number>): Record<string, number> {
  const limpio: Record<string, number> = {};
  for (const [id, n] of Object.entries(errores)) {
    if (Number.isFinite(n) && n > 0) limpio[id] = Math.min(MAX_ERRORES_POR_CAPA, Math.floor(n));
  }
  return limpio;
}

/**
 * Lee una instantánea guardada y la valida contra la configuración actual. Devuelve `null` si no
 * sirve (otro modo, forma rara, o ya estaba resuelta por completo) y ese estado se ignora entero.
 * Lo que sí sirve se filtra: ids que ya no existen se descartan, los números se acotan.
 */
export function leerInstantanea(
  bruta: unknown,
  config: ConfigMulticapa,
  totalConsignas: number,
): EstadoIntento | null {
  if (!esObjeto(bruta) || bruta.modo !== config.modo) return null;
  const capas = new Set(config.capas.map((c) => c.id));

  if (config.modo === 'explorar') {
    if (!Array.isArray(bruta.visitadas)) return null;
    const vistas: string[] = [];
    for (const id of bruta.visitadas) {
      if (typeof id === 'string' && capas.has(id) && !vistas.includes(id)) vistas.push(id);
    }
    // Un intento con todo visto ya estaba completo: se deja la última por ver para poder cerrarlo.
    const requeridas = requeridasEfectivas(config);
    if (requeridas.length > 0 && requeridas.every((id) => vistas.includes(id))) {
      const ultimaRequerida = [...vistas].reverse().find((id) => requeridas.includes(id));
      return {
        modo: 'explorar',
        visitadas: vistas.filter((id) => id !== ultimaRequerida),
      };
    }
    return { modo: 'explorar', visitadas: vistas };
  }

  const { paso } = bruta;
  if (typeof paso !== 'number' || !Number.isInteger(paso) || paso < 0 || paso >= totalConsignas) {
    return null;
  }
  const pedidas = new Set(requeridasEfectivas(config));
  const erroresPorCapa: Record<string, number> = {};
  if (esObjeto(bruta.errores_por_capa)) {
    for (const [id, n] of Object.entries(bruta.errores_por_capa)) {
      if (pedidas.has(id) && typeof n === 'number' && Number.isFinite(n) && n > 0) {
        erroresPorCapa[id] = Math.min(MAX_ERRORES_POR_CAPA, Math.floor(n));
      }
    }
  }
  const semilla =
    typeof bruta.semilla === 'number' && Number.isInteger(bruta.semilla) && bruta.semilla >= 0
      ? bruta.semilla
      : undefined;
  return {
    modo: 'identificar',
    paso,
    erroresPorCapa,
    ...(semilla !== undefined ? { semilla } : {}),
  };
}

/* -------------------------------------------------------------------------------------------
 * Resultado
 * ----------------------------------------------------------------------------------------- */

/** Suma de fallos de todas las capas. */
export function totalErrores(errores: Record<string, number>): number {
  let total = 0;
  for (const n of Object.values(errores)) if (Number.isFinite(n) && n > 0) total += n;
  return total;
}

/** `detalle` del resultado (forma `DetalleMulticapa` de `activities/types.ts`). */
export function detalleDeExplorar(visitadas: readonly string[]): DetalleMulticapa {
  return { modo: 'explorar', visitadas: [...visitadas] };
}

export function detalleDeIdentificar(
  aciertos: number,
  erroresPorCapa: Record<string, number>,
): DetalleMulticapa {
  return {
    modo: 'identificar',
    aciertos,
    errores: totalErrores(erroresPorCapa),
    errores_por_capa: limpiarErrores(erroresPorCapa),
  };
}

/** Fallos acumulados de una capa (0 si no hay). */
export function erroresDe(errores: Record<string, number>, id: string): number {
  const n = Object.hasOwn(errores, id) ? errores[id] : 0;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}
