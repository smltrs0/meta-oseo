/**
 * Errores de validación legibles (en español) para quien escribe un `content.json`.
 *
 * zod devuelve rutas como `secciones.1.bloques.2.actividad.config.correctas.0` y mensajes en
 * inglés. Aquí se convierten en líneas como
 *   secciones[1]{funciones}.bloques[2]{m1_quiz_final}.actividad.config.preguntas[0]{p1}.correctas[0]: ...
 * donde `{id}` es el `id` del elemento (o de su actividad) en esa posición, para localizarlo sin
 * contar índices a mano.
 */
import type { ZodError } from 'zod';
import { rutaLegible } from './consultas';
import { ModuloContenidoSchema } from './schema';

type Registro = Record<PropertyKey, unknown>;

function valorEn(datos: unknown, ruta: readonly PropertyKey[]): unknown {
  let actual = datos;
  for (const paso of ruta) {
    if (typeof actual !== 'object' || actual === null) return undefined;
    actual = (actual as Registro)[paso];
  }
  return actual;
}

/** Ruta legible con el `id` de los elementos de lista que atraviesa. */
export function describirRuta(ruta: readonly PropertyKey[], datos: unknown): string {
  let texto = '';
  let actual: unknown = datos;
  ruta.forEach((paso, posicion) => {
    actual = typeof actual === 'object' && actual !== null ? (actual as Registro)[paso] : undefined;
    if (typeof paso === 'number') {
      texto += `[${paso}]`;
      if (typeof actual === 'object' && actual !== null) {
        const elemento = actual as { id?: unknown; actividad?: { id?: unknown } };
        const id = elemento.id ?? elemento.actividad?.id;
        if (typeof id === 'string') texto += `{${id}}`;
      }
    } else {
      texto += posicion === 0 ? String(paso) : `.${String(paso)}`;
    }
  });
  return texto === '' ? rutaLegible([]) : texto;
}

/** Longitud máxima de un texto que se cita tal cual en un mensaje ("hay "Clinico""). */
const MAX_VALOR_CITADO = 40;

function describirValor(valor: unknown): string {
  if (valor === undefined) return 'nada';
  if (valor === null) return 'null';
  if (Array.isArray(valor)) return 'una lista';
  if (typeof valor === 'object') return 'un objeto';
  if (typeof valor === 'string') {
    return valor.length <= MAX_VALOR_CITADO ? `"${valor}"` : 'un texto';
  }
  if (typeof valor === 'number') return 'un número';
  if (typeof valor === 'boolean') return 'verdadero/falso';
  return typeof valor;
}

const TIPOS_ESPERADOS: Record<string, string> = {
  string: 'un texto',
  number: 'un número',
  int: 'un número entero',
  boolean: 'verdadero o falso',
  array: 'una lista',
  object: 'un objeto',
  null: 'null',
};

function pluralElementos(n: number): string {
  return n === 1 ? '1 elemento' : `${n} elementos`;
}

interface IssueBasico {
  code?: string;
  message: string;
  path: readonly PropertyKey[];
  [clave: string]: unknown;
}

const MENSAJE_POR_DEFECTO = /^(Invalid|Too small|Too big|Unrecognized|Input not)/;

/* -------------------------------------------------------------------------------------------
 * "¿Quisiste decir...?": campos del esquema parecidos a uno desconocido
 * ----------------------------------------------------------------------------------------- */

let camposConocidos: readonly string[] | null = null;

/** Nombres de campo de todo el esquema (se recorre una vez; los guarda en caché). */
function campos(): readonly string[] {
  if (camposConocidos) return camposConocidos;
  const encontrados = new Set<string>();
  const vistos = new Set<unknown>();
  const recoger = (nodo: unknown): void => {
    if (typeof nodo !== 'object' || nodo === null || vistos.has(nodo)) return;
    vistos.add(nodo);
    const def = (nodo as { _zod?: { def?: Record<string, unknown> } })._zod?.def;
    if (!def) return;
    if (typeof def.shape === 'object' && def.shape !== null) {
      for (const [clave, valor] of Object.entries(def.shape)) {
        encontrados.add(clave);
        recoger(valor);
      }
    }
    for (const clave of ['element', 'innerType', 'in', 'out']) recoger(def[clave]);
    if (Array.isArray(def.options)) def.options.forEach(recoger);
  };
  recoger(ModuloContenidoSchema);
  camposConocidos = [...encontrados];
  return camposConocidos;
}

/** Minúsculas, sin tildes y con `_` en lugar de espacios o guiones: "Descripción" -> "descripcion". */
function normalizarClave(clave: string): string {
  return clave
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '');
}

function distanciaEdicion(a: string, b: string): number {
  const previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previa[0] ?? 0;
    previa[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const arriba = previa[j] ?? 0;
      previa[j] = Math.min(
        arriba + 1,
        (previa[j - 1] ?? 0) + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = arriba;
    }
  }
  return previa[b.length] ?? 0;
}

/** El campo del esquema más parecido a `clave` (misma palabra sin tildes, o una errata), si lo hay. */
export function campoParecido(clave: string): string | undefined {
  const normal = normalizarClave(clave);
  const conocidos = campos();
  const igual = conocidos.find((c) => c === normal && c !== clave);
  if (igual) return igual;
  if (normal.length < 4) return undefined;
  let mejor: { campo: string; distancia: number } | undefined;
  for (const campo of conocidos) {
    if (campo.length < 4 || campo === clave) continue;
    const distancia = distanciaEdicion(normal, campo);
    const limite = normal.length >= 8 ? 2 : 1;
    if (distancia <= limite && (!mejor || distancia < mejor.distancia))
      mejor = { campo, distancia };
  }
  return mejor?.campo;
}

/** Traduce los mensajes por defecto de zod; los que ya están en español pasan tal cual. */
function traducir(issue: IssueBasico, datos: unknown): string {
  if (!MENSAJE_POR_DEFECTO.test(issue.message)) return issue.message;
  const valor = valorEn(datos, issue.path);
  switch (issue.code) {
    case 'invalid_type': {
      if (valor === undefined) {
        return issue.path.length === 0
          ? 'El contenido está vacío.'
          : 'Falta este campo obligatorio.';
      }
      const esperado = String(issue.expected ?? '');
      return `Se esperaba ${TIPOS_ESPERADOS[esperado] ?? esperado} y hay ${describirValor(valor)}.`;
    }
    case 'too_small': {
      const minimo = Number(issue.minimum);
      if (issue.origin === 'string') return `Muy corto: mínimo ${minimo} caracteres.`;
      if (issue.origin === 'array') return `Debe tener al menos ${pluralElementos(minimo)}.`;
      return `Debe ser mayor o igual que ${minimo}.`;
    }
    case 'too_big': {
      const maximo = Number(issue.maximum);
      if (issue.origin === 'string') return `Muy largo: máximo ${maximo} caracteres.`;
      if (issue.origin === 'array') return `Debe tener como máximo ${pluralElementos(maximo)}.`;
      return `Debe ser menor o igual que ${maximo}.`;
    }
    case 'invalid_format':
      return 'Formato inválido.';
    case 'invalid_value': {
      const validos = Array.isArray(issue.values) ? issue.values.map(String).join(', ') : '';
      return `Valor no permitido (hay ${describirValor(valor)}). Valores válidos: ${validos}.`;
    }
    case 'invalid_union': {
      const clave = String(issue.path[issue.path.length - 1] ?? 'tipo');
      const opciones = /Expected (.+)$/.exec(issue.message)?.[1]?.replace(/'/g, '"');
      const hay = typeof valor === 'string' ? ` (hay ${describirValor(valor)})` : '';
      return `El valor de "${clave}" no es válido${hay}${opciones ? `; debe ser ${opciones}` : ''}.`;
    }
    case 'unrecognized_keys': {
      const desconocidas = Array.isArray(issue.keys) ? issue.keys.map(String) : [];
      const claves = desconocidas.map((k) => `"${k}"`);
      const sugerencias = desconocidas.flatMap((k) => {
        const parecido = campoParecido(k);
        return parecido ? [`¿quisiste decir "${parecido}" en lugar de "${k}"?`] : [];
      });
      return `Campo(s) desconocido(s): ${claves.join(', ')}. ${sugerencias.length > 0 ? `${sugerencias.join(' ')} ` : ''}Revisa la ortografía; los campos válidos están en docs/content-schema.md.`;
    }
    default:
      return issue.message;
  }
}

/**
 * Líneas legibles de un `ZodError`, sin repetidos. Cada línea es `ruta: mensaje`. `datos` es el
 * JSON que se validó: sirve para poner el `id` de cada elemento en la ruta y para decir qué
 * había en lugar de lo esperado.
 */
export function formatearErrores(error: ZodError, datos: unknown, maximo = 60): string[] {
  const lineas: string[] = [];
  const vistas = new Set<string>();
  for (const issue of error.issues) {
    const linea = `${describirRuta(issue.path, datos)}: ${traducir(issue as unknown as IssueBasico, datos)}`;
    if (vistas.has(linea)) continue;
    vistas.add(linea);
    lineas.push(linea);
  }
  if (lineas.length > maximo) {
    const resto = lineas.length - maximo;
    return [...lineas.slice(0, maximo), `... y ${resto} error(es) más.`];
  }
  return lineas;
}
