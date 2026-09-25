/**
 * Lógica pura de la actividad `relacion-columnas` (docs/content-schema.md, sección 7.3).
 *
 * Todo lo que no necesita el DOM vive aquí para probarlo sin montar el componente:
 *  - `analizarConfig`: valida por dentro la configuración (defensa en profundidad: el esquema ya la
 *    validó, pero un contenido a medio escribir no debe romper la página).
 *  - Barajado estable de la columna B (semilla derivada del id de la actividad y del intento).
 *  - `evaluarPar`: qué cuenta como acierto y como fallo.
 *  - Instantánea del intento a medias (`crearInstantanea` / `leerInstantanea`).
 *
 * Los ids se manejan siempre con `Map` o con índices, nunca como claves de un objeto: un id como
 * `constructor` o `to_string` no debe chocar con el prototipo.
 */
import type { DetalleRelacionColumnas, JsonObjeto } from '@/activities/types';
import type { ElementoColumna, ParColumnas } from '@/content/schema';

export type Columna = 'a' | 'b';

/* -------------------------------------------------------------------------------------------
 * Hash y azar determinista
 * ----------------------------------------------------------------------------------------- */

/** Hash FNV-1a de 32 bits (sin signo) de un texto, por unidades de código UTF-16. */
export function hashTexto(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Generador mulberry32: mismo `semilla`, misma secuencia. Devuelve números en [0, 1). */
export function crearAzar(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla de un intento: depende del id de la actividad y del número de intento, de nada más. */
export function derivarSemilla(idActividad: string, intento: number): number {
  const n = Number.isFinite(intento) ? Math.max(1, Math.floor(intento)) : 1;
  return hashTexto(`${idActividad}#${n}`);
}

/** Fisher-Yates sobre una copia, con el azar dado. */
function barajarCopia<T>(elementos: readonly T[], azar: () => number): T[] {
  const copia = [...elementos];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j] as T, copia[i] as T];
  }
  return copia;
}

/* -------------------------------------------------------------------------------------------
 * Análisis de la configuración
 * ----------------------------------------------------------------------------------------- */

export interface AnalisisValido {
  ok: true;
  tituloA: string;
  tituloB: string;
  a: readonly ElementoColumna[];
  b: readonly ElementoColumna[];
  pares: readonly ParColumnas[];
  /** Índice (en `pares`) del par de cada elemento de A, por id. */
  parDeA: ReadonlyMap<string, number>;
  /** Índice (en `pares`) del par de cada elemento de B con pareja, por id. Los distractores no están. */
  parDeB: ReadonlyMap<string, number>;
  /** Índices, dentro de `a`, de cada par (el elemento de A del par `i` es `a[indiceADePar[i]]`). */
  indiceADePar: readonly number[];
  /** Índices, dentro de `b`, de cada par. */
  indiceBDePar: readonly number[];
  barajar: boolean;
  /** Huella del emparejamiento correcto: cambia si cambia el contenido y invalida instantáneas viejas. */
  firma: number;
}

export interface AnalisisInvalido {
  ok: false;
  /** Motivo para mostrar al estudiante y al docente, en español. */
  motivo: string;
}

export type Analisis = AnalisisValido | AnalisisInvalido;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function leerColumna(
  bruto: unknown,
  nombre: string,
): { titulo: string; elementos: ElementoColumna[] } | string {
  if (!esObjeto(bruto)) return `Falta la ${nombre}.`;
  const titulo = typeof bruto.titulo === 'string' ? bruto.titulo : '';
  if (!Array.isArray(bruto.elementos) || bruto.elementos.length === 0) {
    return `La ${nombre} no tiene elementos.`;
  }
  const vistos = new Set<string>();
  const elementos: ElementoColumna[] = [];
  for (const e of bruto.elementos as unknown[]) {
    if (!esObjeto(e) || typeof e.id !== 'string' || e.id === '' || typeof e.texto !== 'string') {
      return `La ${nombre} tiene un elemento sin id o sin texto.`;
    }
    if (vistos.has(e.id)) return `La ${nombre} repite el elemento "${e.id}".`;
    vistos.add(e.id);
    elementos.push({ id: e.id, texto: e.texto });
  }
  return { titulo, elementos };
}

/**
 * Comprueba que la configuración se pueda jugar: columnas con elementos de id único, al menos un
 * par, pares que apuntan a elementos existentes, ningún elemento en dos pares y cada elemento de A
 * con su par (los de B sin par son los distractores).
 */
export function analizarConfig(config: unknown): Analisis {
  if (!esObjeto(config)) return { ok: false, motivo: 'La actividad no tiene configuración.' };
  const columnaA = leerColumna(config.columna_a, 'columna A');
  if (typeof columnaA === 'string') return { ok: false, motivo: columnaA };
  const columnaB = leerColumna(config.columna_b, 'columna B');
  if (typeof columnaB === 'string') return { ok: false, motivo: columnaB };
  if (!Array.isArray(config.pares) || config.pares.length === 0) {
    return { ok: false, motivo: 'La actividad no define ningún par.' };
  }

  const indiceA = new Map(columnaA.elementos.map((e, i) => [e.id, i]));
  const indiceB = new Map(columnaB.elementos.map((e, i) => [e.id, i]));
  const parDeA = new Map<string, number>();
  const parDeB = new Map<string, number>();
  const pares: ParColumnas[] = [];
  const indiceADePar: number[] = [];
  const indiceBDePar: number[] = [];
  const idsPar = new Set<string>();

  for (const p of config.pares as unknown[]) {
    if (
      !esObjeto(p) ||
      typeof p.id !== 'string' ||
      typeof p.a !== 'string' ||
      typeof p.b !== 'string' ||
      typeof p.explicacion !== 'string'
    ) {
      return { ok: false, motivo: 'Un par no tiene id, elementos o explicación.' };
    }
    if (idsPar.has(p.id)) return { ok: false, motivo: `El par "${p.id}" está repetido.` };
    idsPar.add(p.id);
    const ia = indiceA.get(p.a);
    const ib = indiceB.get(p.b);
    if (ia === undefined) {
      return { ok: false, motivo: `El par "${p.id}" usa un elemento que no está en la columna A.` };
    }
    if (ib === undefined) {
      return { ok: false, motivo: `El par "${p.id}" usa un elemento que no está en la columna B.` };
    }
    if (parDeA.has(p.a) || parDeB.has(p.b)) {
      return { ok: false, motivo: `El par "${p.id}" reutiliza un elemento que ya tiene pareja.` };
    }
    parDeA.set(p.a, pares.length);
    parDeB.set(p.b, pares.length);
    indiceADePar.push(ia);
    indiceBDePar.push(ib);
    pares.push({ id: p.id, a: p.a, b: p.b, explicacion: p.explicacion });
  }
  for (const e of columnaA.elementos) {
    if (!parDeA.has(e.id)) {
      return { ok: false, motivo: `El elemento "${e.id}" de la columna A no tiene pareja.` };
    }
  }

  return {
    ok: true,
    tituloA: columnaA.titulo,
    tituloB: columnaB.titulo,
    a: columnaA.elementos,
    b: columnaB.elementos,
    pares,
    parDeA,
    parDeB,
    indiceADePar,
    indiceBDePar,
    barajar: config.barajar !== false,
    firma: hashTexto(pares.map((p) => `${p.id}|${p.a}|${p.b}`).join(';')),
  };
}

/* -------------------------------------------------------------------------------------------
 * Barajado de la columna B
 * ----------------------------------------------------------------------------------------- */

/**
 * ¿Las parejas de B quedan en el mismo orden relativo que sus elementos de A? Entonces la
 * disposición regala la respuesta ("la primera con la primera..."): se vuelve a barajar.
 */
export function regalaLaRespuesta(analisis: AnalisisValido, orden: readonly number[]): boolean {
  const posicionEnB = new Map(orden.map((indice, posicion) => [indice, posicion]));
  const posiciones = analisis.pares.map((_, i) => posicionEnB.get(analisis.indiceBDePar[i] ?? -1));
  // Ordenados los pares por su lugar en A, ¿sus posiciones en B crecen siempre?
  const porA = analisis.pares
    .map((_, i) => i)
    .sort((x, y) => (analisis.indiceADePar[x] ?? 0) - (analisis.indiceADePar[y] ?? 0));
  for (let k = 1; k < porA.length; k++) {
    const antes = posiciones[porA[k - 1] as number] ?? 0;
    const despues = posiciones[porA[k] as number] ?? 0;
    if (despues < antes) return false;
  }
  return true;
}

const INTENTOS_DE_BARAJADO = 24;

/**
 * Orden de la columna B: lista de índices de `analisis.b`. Con `barajar: false` es el del JSON.
 * Con `barajar`, sale de la semilla y es siempre el mismo para la misma semilla; y con dos o más
 * pares nunca deja las parejas en el orden de A.
 */
export function ordenarColumnaB(analisis: AnalisisValido, semilla: number): number[] {
  const original = analisis.b.map((_, i) => i);
  if (!analisis.barajar) return original;
  let orden = original;
  for (let intento = 0; intento < INTENTOS_DE_BARAJADO; intento++) {
    orden = barajarCopia(
      original,
      crearAzar(intento === 0 ? semilla : hashTexto(`${semilla}:${intento}`)),
    );
    if (analisis.pares.length < 2 || !regalaLaRespuesta(analisis, orden)) return orden;
  }
  return romperOrdenDeA(analisis, orden);
}

/**
 * Respaldo determinista de `ordenarColumnaB`: intercambia en `orden` los lugares de las parejas de
 * los dos primeros elementos de A, con lo que las parejas dejan de crecer en el orden de A.
 */
export function romperOrdenDeA(analisis: AnalisisValido, orden: readonly number[]): number[] {
  const copia = [...orden];
  if (analisis.pares.length < 2) return copia;
  const porA = analisis.pares
    .map((_, i) => i)
    .sort((x, y) => (analisis.indiceADePar[x] ?? 0) - (analisis.indiceADePar[y] ?? 0));
  const p0 = orden.indexOf(analisis.indiceBDePar[porA[0] as number] as number);
  const p1 = orden.indexOf(analisis.indiceBDePar[porA[1] as number] as number);
  if (p0 < 0 || p1 < 0) return copia;
  copia[p0] = orden[p1] as number;
  copia[p1] = orden[p0] as number;
  return copia;
}

/* -------------------------------------------------------------------------------------------
 * Evaluar una unión
 * ----------------------------------------------------------------------------------------- */

export interface EvaluacionPar {
  correcto: boolean;
  /** Índice del par que se intentaba formar: el del elemento de A. */
  indicePar: number;
}

/** `null` si el elemento de A no existe. Un distractor de B nunca es correcto. */
export function evaluarPar(
  analisis: AnalisisValido,
  idA: string,
  idB: string,
): EvaluacionPar | null {
  const indicePar = analisis.parDeA.get(idA);
  if (indicePar === undefined) return null;
  return { correcto: analisis.pares[indicePar]?.b === idB, indicePar };
}

/* -------------------------------------------------------------------------------------------
 * Estado del intento e instantánea
 * ----------------------------------------------------------------------------------------- */

export interface EstadoIntento {
  /** Índices de los pares ya formados, en el orden en que se acertaron. */
  hechos: readonly number[];
  /** Uniones equivocadas por índice de par (el del elemento de A que se intentaba unir). */
  errores: readonly number[];
}

/** Tope defensivo de errores por par al leer una instantánea ajena. */
const ERRORES_MAX_POR_PAR = 1000;

export function totalErrores(errores: readonly number[]): number {
  return errores.reduce((suma, n) => suma + n, 0);
}

/** Instantánea del intento a medias: índices y una semilla, no ids (docs de types.ts). */
export function crearInstantanea(
  analisis: AnalisisValido,
  estado: EstadoIntento,
  semilla: number,
): JsonObjeto {
  return {
    firma: analisis.firma,
    semilla,
    hechos: [...estado.hechos],
    errores: [...estado.errores],
  };
}

export interface InstantaneaLeida extends EstadoIntento {
  /** Solo si venía como entero sin signo de 32 bits. */
  semilla: number | undefined;
}

function esEnteroNoNegativo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0;
}

/**
 * Lee la instantánea de un `estadoPrevio` y la valida contra la actividad. Devuelve `null` si es
 * basura, de otra versión del contenido (otra `firma`), o de un intento ya terminado (todos los
 * pares hechos: `completada` ya se emitió y no hay nada que reanudar).
 */
export function leerInstantanea(analisis: AnalisisValido, bruto: unknown): InstantaneaLeida | null {
  if (!esObjeto(bruto) || bruto.firma !== analisis.firma) return null;
  const total = analisis.pares.length;
  const { hechos, errores } = bruto;
  if (!Array.isArray(hechos) || hechos.length >= total) return null;
  const vistos = new Set<number>();
  for (const h of hechos as unknown[]) {
    if (!esEnteroNoNegativo(h) || h >= total || vistos.has(h)) return null;
    vistos.add(h);
  }
  if (!Array.isArray(errores) || errores.length !== total) return null;
  for (const e of errores as unknown[]) {
    if (!esEnteroNoNegativo(e) || e > ERRORES_MAX_POR_PAR) return null;
  }
  const semilla =
    esEnteroNoNegativo(bruto.semilla) && bruto.semilla <= 0xffffffff ? bruto.semilla : undefined;
  return { hechos: [...(hechos as number[])], errores: [...(errores as number[])], semilla };
}

/** `detalle` de `completada`: errores solo de los pares donde hubo alguno. */
export function construirDetalle(
  analisis: AnalisisValido,
  estado: EstadoIntento,
): DetalleRelacionColumnas {
  const errores_por_par: Record<string, number> = {};
  analisis.pares.forEach((par, i) => {
    const n = estado.errores[i] ?? 0;
    if (n > 0)
      Object.defineProperty(errores_por_par, par.id, {
        value: n,
        enumerable: true,
        writable: true,
        configurable: true,
      });
  });
  return {
    aciertos: estado.hechos.length,
    errores: totalErrores(estado.errores),
    errores_por_par,
  };
}
