/**
 * Render seguro del Markdown restringido del contenido (docs/content-schema.md, "Texto").
 *
 * Es el ÚNICO camino para mostrar los textos de `content.json` que admiten Markdown
 * (`renderizarLinea`, `renderizarBloque`): la página del módulo y los seis componentes de
 * actividad lo usan, así el resultado es el mismo en todas partes. Dos capas independientes:
 *
 *  1. markdown-it en modo `zero` con solo lo que la guía permite (párrafos, listas, títulos,
 *     énfasis y enlaces), `html: false` (el HTML se escapa como texto), sin imágenes, tablas,
 *     citas, código ni líneas horizontales.
 *  2. `sanitizarSalida`: reconstruye el HTML etiqueta por etiqueta con una lista blanca (solo
 *     `p strong em a ul ol li h3 h4 br`), descarta todo atributo salvo los de los enlaces `https:`
 *     y `#glosario-...`, y convierte cualquier otra cosa en texto escapado. Trabaja sobre
 *     cadenas, sin DOM: DOMPurify 3.4 no funciona bajo happy-dom 20 (el entorno de pruebas de
 *     este proyecto: descarta el primer nodo), y un render que se comporta distinto en las
 *     pruebas y en el navegador no es una defensa comprobable.
 *
 * Los enlaces `[término](glosario:id)` se convierten en
 * `<a href="#glosario-id" data-glosario="id" class="enlace-glosario">`: la interfaz los intercepta
 * para abrir la definición del glosario. Los enlaces `https://` se abren en otra pestaña con
 * `rel="noopener noreferrer"`.
 */
import MarkdownIt from 'markdown-it';
import { PATRON_ID } from './constantes';
import { PREFIJO_GLOSARIO } from './texto';

const md = new MarkdownIt('zero', {
  html: false,
  linkify: false,
  typographer: false,
  breaks: false,
}).enable([
  'newline',
  'escape',
  'entity',
  'emphasis',
  'link',
  'balance_pairs',
  'text_join',
  'fragments_join',
  'list',
  'heading',
]);

md.renderer.rules.link_open = (tokens, indice, opciones, _entorno, renderizador) => {
  const token = tokens[indice]!;
  const destino = String(token.attrGet('href') ?? '');
  if (destino.startsWith(PREFIJO_GLOSARIO)) {
    const id = destino.slice(PREFIJO_GLOSARIO.length);
    token.attrSet('href', `#glosario-${id}`);
    token.attrSet('data-glosario', id);
    token.attrSet('class', 'enlace-glosario');
  } else {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
  }
  return renderizador.renderToken(tokens, indice, opciones);
};

/* -------------------------------------------------------------------------------------------
 * Capa 2: lista blanca sobre cadenas
 * ----------------------------------------------------------------------------------------- */

const ETIQUETAS_PERMITIDAS: ReadonlySet<string> = new Set([
  'p',
  'strong',
  'em',
  'a',
  'ul',
  'ol',
  'li',
  'h3',
  'h4',
  'br',
]);

// `<etiqueta atributo="valor" atributo>` o `</etiqueta>`, con valores entre comillas dobles.
const ETIQUETA = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z][a-zA-Z0-9-]*(?:="[^"]*")?)*)\s*\/?>/g;
const ATRIBUTO = /\s+([a-zA-Z][a-zA-Z0-9-]*)(?:="([^"]*)")?/g;
const ENLACE_HTTPS = /^https:\/\/[^\s"<>]{4,2000}$/;

function escaparTexto(texto: string): string {
  return texto.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Atributos que se conservan en un enlace, ya validados; el resto se descarta. */
function atributosDeEnlace(atributos: string): string {
  const valores = new Map<string, string>();
  for (const m of atributos.matchAll(ATRIBUTO)) valores.set((m[1] ?? '').toLowerCase(), m[2] ?? '');
  const href = valores.get('href') ?? '';
  const glosario = /^#glosario-(.+)$/.exec(href)?.[1];
  if (
    glosario !== undefined &&
    PATRON_ID.test(glosario) &&
    valores.get('data-glosario') === glosario
  ) {
    return ` href="${href}" data-glosario="${glosario}" class="enlace-glosario"`;
  }
  if (ENLACE_HTTPS.test(href)) {
    return ` href="${href}" target="_blank" rel="noopener noreferrer"`;
  }
  return ''; // enlace sin destino válido: queda como texto sin enlace
}

/**
 * Reconstruye `html` conservando solo las etiquetas y atributos permitidos. Lo que no lo es
 * (etiquetas ajenas, comentarios, `<` sueltos) se muestra como texto escapado. Se exporta para
 * probarla con entradas hostiles.
 */
export function sanitizarSalida(html: string): string {
  let salida = '';
  let ultimo = 0;
  for (const m of html.matchAll(ETIQUETA)) {
    const inicio = m.index ?? 0;
    salida += escaparTexto(html.slice(ultimo, inicio));
    ultimo = inicio + m[0].length;
    const cierre = m[1] === '/';
    const nombre = (m[2] ?? '').toLowerCase();
    if (!ETIQUETAS_PERMITIDAS.has(nombre)) {
      salida += escaparTexto(m[0]);
    } else if (cierre) {
      salida += nombre === 'br' ? '' : `</${nombre}>`;
    } else {
      salida += `<${nombre}${nombre === 'a' ? atributosDeEnlace(m[3] ?? '') : ''}>`;
    }
  }
  return salida + escaparTexto(html.slice(ultimo));
}

/* -------------------------------------------------------------------------------------------
 * API pública
 * ----------------------------------------------------------------------------------------- */

/** Texto de una sola línea con énfasis y enlaces (descripciones, explicaciones, opciones...). */
export function renderizarLinea(texto: string): string {
  return texto ? sanitizarSalida(md.renderInline(texto)) : '';
}

/** Bloque `texto` o `callout`: párrafos, listas, títulos ### y ####, énfasis y enlaces. */
export function renderizarBloque(texto: string): string {
  return texto ? sanitizarSalida(md.render(texto)) : '';
}

const ENTIDADES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/**
 * El mismo texto sin marcado, para `aria-label`, anuncios a lectores de pantalla y atributos
 * `title`: `El **osteoblasto** forma [matriz](glosario:matriz_osea)` -> `El osteoblasto forma matriz`.
 */
export function textoPlanoDeMarkdown(texto: string): string {
  return md
    .render(texto)
    .replace(/<\/(?:p|li|h3|h4)>/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (entidad) => ENTIDADES[entidad] ?? entidad)
    .replace(/\s+/g, ' ')
    .trim();
}
