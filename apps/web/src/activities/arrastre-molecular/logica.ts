/**
 * Lógica pura del arrastre molecular: modelo derivado de la configuración, resolución de una
 * suelta, precisión y (des)serialización de la instantánea. Todo por ÍNDICE (posición en las
 * listas de `config`) y no por id: así un contenido con ids repetidos o raros nunca rompe el
 * componente, y la instantánea guarda números (recomendación de types.ts, "Instantánea").
 *
 * Reglas (types.ts, "Arrastre", y docs/content-schema.md 7.2):
 *  - Acoplar una molécula sobre SU receptor es un acierto, y cuenta una sola vez por par.
 *  - Soltarla otra vez sobre el receptor donde ya está acoplada no cuenta (ni acierto ni fallo).
 *  - Acoplar una molécula sobre un receptor que no es el suyo, o un distractor sobre cualquiera,
 *    es un fallo. Soltar fuera de todo receptor no es nada (eso lo decide el componente).
 *  - Un receptor acepta varias moléculas: muestra el efecto de la ÚLTIMA acoplada.
 *  - Se completa cuando cada par se acopló al menos una vez.
 */
import type { ConfigArrastreMolecular, EfectoBiologico } from '@/content/schema';
import type { JsonObjeto } from '../types';

export interface MoleculaModelo {
  indice: number;
  id: string;
  etiqueta: string;
  descripcion: string;
  forma: string;
  rechazo?: string;
  /** Índice del par al que pertenece, o `null` si es un distractor (no encaja en ningún receptor). */
  par: number | null;
}

export interface ReceptorModelo {
  indice: number;
  id: string;
  etiqueta: string;
  descripcion: string;
  x: number;
  y: number;
  /** Índices de los pares que acepta este receptor (uno por molécula que encaja). */
  pares: number[];
}

export interface ParModelo {
  indice: number;
  id: string;
  molecula: number;
  receptor: number;
  efecto: EfectoBiologico;
}

export interface Modelo {
  moleculas: MoleculaModelo[];
  receptores: ReceptorModelo[];
  pares: ParModelo[];
  /** Por qué la configuración no se puede mostrar, o `null` si está bien. */
  problema: string | null;
}

/** Lista de objetos de la configuración; con contenido roto (no es lista, hay nulos) sale vacía. */
function listaDe<T>(valor: readonly T[] | undefined): T[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((x) => typeof x === 'object' && x !== null);
}

export function construirModelo(config: ConfigArrastreMolecular): Modelo {
  const listaMoleculas = listaDe(config?.moleculas);
  const listaReceptores = listaDe(config?.receptores);
  const listaPares = listaDe(config?.pares);
  let problema: string | null = null;

  const moleculas: MoleculaModelo[] = listaMoleculas.map((m, indice) => ({
    indice,
    id: String(m.id),
    etiqueta: String(m.etiqueta),
    descripcion: String(m.descripcion ?? ''),
    forma: m.forma ?? 'circulo',
    rechazo: m.rechazo,
    par: null,
  }));
  const receptores: ReceptorModelo[] = listaReceptores.map((r, indice) => ({
    indice,
    id: String(r.id),
    etiqueta: String(r.etiqueta),
    descripcion: String(r.descripcion ?? ''),
    x: Number(r.posicion?.x),
    y: Number(r.posicion?.y),
    pares: [],
  }));

  const pares: ParModelo[] = [];
  listaPares.forEach((p) => {
    const molecula = moleculas.findIndex((m) => m.id === p.molecula);
    const receptor = receptores.findIndex((r) => r.id === p.receptor);
    if (molecula < 0 || receptor < 0) {
      problema ??= `El par "${String(p.id)}" apunta a una molécula o a un receptor que no existe.`;
      return;
    }
    if (moleculas[molecula]!.par !== null) {
      problema ??= `La molécula "${p.molecula}" aparece en más de un par.`;
      return;
    }
    // El índice es la posición en `pares` (los inválidos no entran), no en la configuración.
    const indice = pares.length;
    moleculas[molecula]!.par = indice;
    receptores[receptor]!.pares.push(indice);
    pares.push({ indice, id: String(p.id), molecula, receptor, efecto: p.efecto });
  });

  if (moleculas.length === 0) problema ??= 'No hay moléculas que arrastrar.';
  else if (receptores.length === 0) problema ??= 'No hay receptores.';
  else if (pares.length === 0) problema ??= 'No hay pares molécula-receptor.';
  else if (receptores.some((r) => !Number.isFinite(r.x) || !Number.isFinite(r.y))) {
    problema ??= 'Un receptor no tiene posición.';
  }
  return { moleculas, receptores, pares, problema };
}

/* -------------------------------------------------------------------------------------------
 * Estado de una ejecución
 * ----------------------------------------------------------------------------------------- */

export interface EstadoArrastre {
  /** Índices de los pares acoplados, en el orden en que se acoplaron (el último manda). */
  acoplados: number[];
  /** Acoples equivocados de esta ejecución. */
  fallos: number;
  /** Fallos por índice de molécula. */
  errores: Record<number, number>;
}

export function estadoVacio(): EstadoArrastre {
  return { acoplados: [], fallos: 0, errores: {} };
}

export type Suelta =
  | { tipo: 'acierto'; par: number }
  | { tipo: 'repetido'; par: number }
  | { tipo: 'fallo'; distractor: boolean };

/** Qué significa acoplar `molecula` sobre `receptor` (índices). No modifica el estado. */
export function resolverSuelta(
  modelo: Modelo,
  estado: EstadoArrastre,
  molecula: number,
  receptor: number,
): Suelta {
  const par = modelo.moleculas[molecula]?.par ?? null;
  if (par === null) return { tipo: 'fallo', distractor: true };
  if (modelo.pares[par]?.receptor !== receptor) return { tipo: 'fallo', distractor: false };
  return estado.acoplados.includes(par) ? { tipo: 'repetido', par } : { tipo: 'acierto', par };
}

/** Estado siguiente tras una suelta (nuevo objeto, no muta el anterior). */
export function aplicarSuelta(
  estado: EstadoArrastre,
  suelta: Suelta,
  molecula: number,
): EstadoArrastre {
  if (suelta.tipo === 'fallo') {
    return {
      acoplados: estado.acoplados,
      fallos: estado.fallos + 1,
      errores: { ...estado.errores, [molecula]: (estado.errores[molecula] ?? 0) + 1 },
    };
  }
  // Un acierto o una suelta repetida deja el par como el último acoplado de su receptor: el
  // receptor muestra el efecto de la última molécula que se le llevó.
  return {
    acoplados: [...estado.acoplados.filter((p) => p !== suelta.par), suelta.par],
    fallos: estado.fallos,
    errores: estado.errores,
  };
}

export function estaCompleto(modelo: Modelo, estado: EstadoArrastre): boolean {
  return modelo.pares.length > 0 && estado.acoplados.length >= modelo.pares.length;
}

/** Par cuyo efecto muestra el receptor: el último acoplado en él, o `null` si está libre. */
export function parVisibleDeReceptor(
  modelo: Modelo,
  estado: EstadoArrastre,
  receptor: number,
): number | null {
  for (let i = estado.acoplados.length - 1; i >= 0; i--) {
    const par = estado.acoplados[i]!;
    if (modelo.pares[par]?.receptor === receptor) return par;
  }
  return null;
}

/** Pares acoplados en un receptor, en el orden en que se acoplaron. */
export function paresAcopladosEn(
  modelo: Modelo,
  estado: EstadoArrastre,
  receptor: number,
): number[] {
  return estado.acoplados.filter((par) => modelo.pares[par]?.receptor === receptor);
}

/* -------------------------------------------------------------------------------------------
 * Instantánea (progreso.instantanea)
 * ----------------------------------------------------------------------------------------- */

/** Tope de fallos que se restaura: un valor absurdo de una instantánea corrupta no debe colarse. */
const FALLOS_MAX = 9999;

export function aInstantanea(estado: EstadoArrastre, semilla: number): JsonObjeto {
  return {
    semilla,
    acoplados: [...estado.acoplados],
    fallos: estado.fallos,
    errores: Object.fromEntries(Object.entries(estado.errores).map(([k, v]) => [k, v])),
  };
}

function esEnteroEn(valor: unknown, min: number, max: number): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= min && valor <= max;
}

export interface Restaurado {
  estado: EstadoArrastre;
  semilla: number | null;
}

/**
 * Lee una instantánea guardada, validándola contra el contenido actual: lo que no cuadra (índices
 * fuera de rango, repetidos, tipos equivocados) se ignora. Devuelve `null` si no hay nada
 * aprovechable o si la instantánea describe una actividad ya terminada (no se guarda una así:
 * se borra al completar; restaurarla dejaría la actividad terminada sin emitir `completada`).
 */
export function restaurarInstantanea(instantanea: unknown, modelo: Modelo): Restaurado | null {
  if (typeof instantanea !== 'object' || instantanea === null || Array.isArray(instantanea)) {
    return null;
  }
  const crudo = instantanea as Record<string, unknown>;

  const acoplados: number[] = [];
  if (Array.isArray(crudo.acoplados)) {
    for (const par of crudo.acoplados) {
      if (esEnteroEn(par, 0, modelo.pares.length - 1) && !acoplados.includes(par)) {
        acoplados.push(par);
      }
    }
  }
  if (modelo.pares.length > 0 && acoplados.length >= modelo.pares.length) return null;

  const errores: Record<number, number> = {};
  let sumaErrores = 0;
  if (
    typeof crudo.errores === 'object' &&
    crudo.errores !== null &&
    !Array.isArray(crudo.errores)
  ) {
    for (const [clave, valor] of Object.entries(crudo.errores)) {
      const indice = /^\d{1,3}$/.test(clave) ? Number(clave) : -1;
      if (indice >= 0 && indice < modelo.moleculas.length && esEnteroEn(valor, 1, FALLOS_MAX)) {
        errores[indice] = valor;
        sumaErrores += valor;
      }
    }
  }
  let fallos = esEnteroEn(crudo.fallos, 0, FALLOS_MAX) ? crudo.fallos : 0;
  fallos = Math.max(fallos, sumaErrores);

  const semilla = esEnteroEn(crudo.semilla, 0, 4294967295) ? crudo.semilla : null;
  if (acoplados.length === 0 && fallos === 0 && semilla === null) return null;
  return { estado: { acoplados, fallos, errores }, semilla };
}

/**
 * `errores_por_molecula` del detalle: por id de molécula, solo las que tuvieron fallos. Con ids
 * repetidos (contenido inválido) se suman en lugar de pisarse.
 */
export function erroresPorId(modelo: Modelo, estado: EstadoArrastre): Record<string, number> {
  // Un `Map` y `Object.fromEntries`: un id como "constructor" o "__proto__" no choca con el
  // prototipo de un objeto literal (`{}['constructor']` ya existe y rompería la suma).
  const suma = new Map<string, number>();
  for (const [clave, n] of Object.entries(estado.errores)) {
    const molecula = modelo.moleculas[Number(clave)];
    if (molecula && n > 0) suma.set(molecula.id, (suma.get(molecula.id) ?? 0) + n);
  }
  return Object.fromEntries(suma);
}
