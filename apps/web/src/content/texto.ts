/**
 * Validación del texto del contenido (docs/content-schema.md, "Texto").
 *
 * Hay tres niveles y ningún campo admite HTML:
 *  - plano:  etiquetas, títulos y opciones. Sin Markdown y en una sola línea.
 *  - línea:  descripciones y explicaciones. Una sola línea con `**negrita**`, `*cursiva*` y
 *            enlaces `[término](glosario:id)` o `[texto](https://...)`.
 *  - bloque: bloques `texto` y `callout`. Párrafos, listas planas, títulos `###` y `####`
 *            (solo en `texto`), y lo mismo que en línea.
 *
 * Son funciones puras que devuelven la lista de problemas (vacía si el texto es válido), para
 * poder probarlas solas y reutilizarlas en los esquemas zod (schema.ts).
 */
import { PATRON_ID } from './constantes';

// Caracteres de control salvo salto de línea (\n) y tabulación: nunca son texto legítimo.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const ETIQUETA_HTML = /<\/?[A-Za-z][^>]*>|<!--|<\?/;
// Texto UTF-8 leído como Latin-1 ("Ã³" en lugar de "ó") o con el carácter de reemplazo.
const MOJIBAKE = /\u00C3[\u0080-\u00BF]|\u00C2[\u00A0-\u00BF]|\u00E2\u20AC|\uFFFD/;
const ENLACE = /\[([^\]\n]*)\]\(([^)\n]*)\)/g;
const MARCA_TITULO = /^ {0,3}(#{1,6})(?:\s|$)/;
const MARCA_LISTA = /^(\s*)(?:[-*+]|\d{1,3}[.)])\s+\S/;
const MARCA_CITA = /^ {0,3}>/;
// En una sola línea, "> 99 %", "- 5 %" o "+ 2 mm" son valores clínicos y no marcadores de bloque:
// un signo seguido de un espacio y un número (o un signo de comparación) es texto normal.
const VALOR_CON_SIGNO = /^ {0,3}(?:>|[-+])\s*[\d≥≤<>=.,±~]/;
// Marca que los guiones ponen en cifras dudosas: es para el docente (estado_revision.pendientes),
// nunca para el estudiante.
const MARCA_VERIFICAR = /\[\s*verificar[^\]\n]*\]/i;
const MARCA_TABLA = /^\s*\|.*\|\s*$/;
const MARCA_REGLA = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const MARCA_SETEXT = /^\s*={2,}\s*$/;
const ENLACE_ESPACIADO = /\]\s+\((?:glosario:|https:)/;

export const PREFIJO_GLOSARIO = 'glosario:';

export interface EnlaceTexto {
  texto: string;
  destino: string;
}

/** Enlaces Markdown `[texto](destino)` de un texto, en orden de aparición. */
export function enlacesDeTexto(texto: string): EnlaceTexto[] {
  return [...texto.matchAll(ENLACE)].map((m) => ({
    texto: m[1] ?? '',
    destino: (m[2] ?? '').trim(),
  }));
}

/** Ids de glosario citados con `[término](glosario:id)`, en orden y sin filtrar repetidos. */
export function idsGlosarioEnTexto(texto: string): string[] {
  return enlacesDeTexto(texto)
    .filter((e) => e.destino.startsWith(PREFIJO_GLOSARIO))
    .map((e) => e.destino.slice(PREFIJO_GLOSARIO.length));
}

function problemasComunes(texto: string): string[] {
  const problemas: string[] = [];
  if (CONTROL.test(texto)) problemas.push('Contiene caracteres de control no permitidos.');
  if (texto.includes('\t')) problemas.push('No uses tabulaciones; usa espacios.');
  if (texto.includes('\r')) problemas.push('Usa saltos de línea "\\n", no "\\r".');
  if (MOJIBAKE.test(texto)) {
    problemas.push('Parece tener la codificación dañada (por ejemplo "Ã³" en lugar de "ó").');
  }
  if (ETIQUETA_HTML.test(texto)) {
    problemas.push('No se permite HTML. Usa Markdown restringido o el bloque adecuado.');
  }
  if (texto.includes('`')) problemas.push('No se permite código con comillas invertidas.');
  if (/!\[/.test(texto)) {
    problemas.push('No se permiten imágenes dentro del texto; usa un bloque "imagen".');
  }
  if (ENLACE_ESPACIADO.test(texto)) {
    problemas.push('Enlace mal formado: no dejes espacio entre "]" y "(".');
  }
  for (const { destino } of enlacesDeTexto(texto)) {
    if (destino.startsWith(PREFIJO_GLOSARIO)) {
      const id = destino.slice(PREFIJO_GLOSARIO.length);
      if (!PATRON_ID.test(id)) {
        problemas.push(
          `Enlace de glosario con id inválido "${id}" (snake_case, empieza por letra).`,
        );
      }
    } else if (!/^https:\/\/\S{4,300}$/.test(destino)) {
      problemas.push(
        `Enlace no permitido "${destino}": solo "glosario:id" o direcciones que empiecen por https://.`,
      );
    }
  }
  if (MARCA_VERIFICAR.test(texto)) {
    problemas.push(
      'Quita la marca "[verificar]": el estudiante la leería. Anota la duda en "estado_revision.pendientes" con el id del bloque o de la actividad.',
    );
  }
  if ((texto.match(/\*\*/g) ?? []).length % 2 === 1) {
    problemas.push('Hay un "**" sin cerrar.');
  }
  return problemas;
}

/** Texto plano: una línea, sin Markdown ni HTML. */
export function problemasTextoPlano(texto: string): string[] {
  const problemas = problemasComunes(texto);
  if (texto.includes('\n')) problemas.push('Debe ir en una sola línea.');
  if (texto.includes('**')) {
    problemas.push('Aquí no se admite Markdown (**negrita**); escribe texto plano.');
  }
  if (/\]\(/.test(texto)) problemas.push('Aquí no se admiten enlaces; escribe texto plano.');
  return problemas;
}

/** Texto de una sola línea con énfasis y enlaces (sin bloques Markdown). */
export function problemasMarkdownLinea(texto: string): string[] {
  const problemas = problemasComunes(texto);
  if (texto.includes('\n')) {
    problemas.push(
      'Debe ir en una sola línea (un solo párrafo); para varios párrafos usa un bloque "texto".',
    );
  }
  const linea = texto.split('\n')[0] ?? '';
  const esValor = VALOR_CON_SIGNO.test(linea);
  if (MARCA_TITULO.test(linea)) problemas.push('No se admiten títulos "#" en este campo.');
  if (MARCA_LISTA.test(linea) && !esValor) {
    problemas.push(
      /^\s*\d/.test(linea)
        ? 'No empieces con "1." ni "1)": no es una lista y el orden lo da la posición del elemento; quita el número.'
        : 'No se admiten listas en este campo: no empieces con "-", "*" ni "+".',
    );
  }
  if (MARCA_CITA.test(linea) && !esValor) {
    problemas.push(
      'No se admiten citas ">" en este campo. Para "mayor que" escribe "≥" o "más de".',
    );
  }
  if (MARCA_TABLA.test(linea)) {
    problemas.push('No se admiten tablas en el texto; usa el bloque "tabla".');
  }
  if (MARCA_REGLA.test(linea)) problemas.push('No se admiten líneas horizontales en este campo.');
  return problemas;
}

export interface OpcionesMarkdownBloque {
  /** Admite títulos `###` y `####` (bloque `texto`; no en `callout`). */
  titulos: boolean;
}

/** Markdown de bloque: párrafos, listas planas, énfasis, enlaces y (opcional) títulos ### y ####. */
export function problemasMarkdownBloque(texto: string, opciones: OpcionesMarkdownBloque): string[] {
  const problemas = problemasComunes(texto);
  if (/\n{3,}/.test(texto)) problemas.push('Usa una sola línea en blanco entre párrafos.');
  let hayTabla = false;
  let hayRegla = false;
  let hayCita = false;
  let hayListaAnidada = false;
  let hayTituloInvalido = false;
  let haySetext = false;
  for (const linea of texto.split('\n')) {
    const titulo = MARCA_TITULO.exec(linea);
    if (titulo) {
      const nivel = titulo[1]?.length ?? 0;
      if (!opciones.titulos || (nivel !== 3 && nivel !== 4)) hayTituloInvalido = true;
    }
    if (MARCA_CITA.test(linea)) hayCita = true;
    if (MARCA_TABLA.test(linea)) hayTabla = true;
    if (MARCA_REGLA.test(linea)) hayRegla = true;
    if (MARCA_SETEXT.test(linea)) haySetext = true;
    const lista = MARCA_LISTA.exec(linea);
    if (lista && (lista[1] ?? '').length >= 2) hayListaAnidada = true;
  }
  if (hayTituloInvalido) {
    problemas.push(
      opciones.titulos
        ? 'Solo se admiten títulos "###" y "####" (el título de la sección ya es un nivel superior).'
        : 'No se admiten títulos en este bloque.',
    );
  }
  if (hayCita) problemas.push('No se admiten citas ">".');
  if (hayTabla) problemas.push('No se admiten tablas dentro del texto; usa el bloque "tabla".');
  if (hayRegla) problemas.push('No se admiten líneas horizontales.');
  if (haySetext) problemas.push('No se admiten títulos subrayados con "===".');
  if (hayListaAnidada) problemas.push('No se admiten listas anidadas; usa una lista plana.');
  return problemas;
}
