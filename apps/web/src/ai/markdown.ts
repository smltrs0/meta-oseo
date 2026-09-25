/**
 * Renderizado seguro del Markdown que devuelve el mentor (F1-13).
 *
 * El texto lo genera un modelo de lenguaje, así que se trata como no confiable. Hay dos capas
 * independientes; cualquiera de las dos basta para frenar un HTML malicioso:
 *
 *  1. markdown-it con `html: false` (el HTML crudo se escapa como texto), sin imágenes
 *     (evita cargar recursos remotos que rastreen al estudiante) y con el validador de enlaces
 *     por defecto, que ya rechaza `javascript:`, `vbscript:`, `file:` y `data:`.
 *  2. DOMPurify sobre el HTML resultante (ver `sanitizar.ts`), SIEMPRE, aunque la capa 1 ya
 *     haya limpiado: defensa adicional por si una versión futura de markdown-it cambia.
 *
 * El resultado es el único valor que se pasa a `v-html` en la interfaz del mentor.
 */
import MarkdownIt from 'markdown-it';
import { sanitizarHtml } from './sanitizar';

const md = new MarkdownIt({
  html: false, // sin HTML crudo
  linkify: true, // convierte URLs sueltas en enlaces
  breaks: true, // un salto simple del modelo se respeta como salto visual
  typographer: false,
});
// Sin imágenes: `![texto](url)` queda como texto y enlace, y no se descarga nada.
md.disable('image');

const abrirEnlace = md.renderer.rules.link_open;
md.renderer.rules.link_open = (tokens, idx, opciones, entorno, renderizador) => {
  const token = tokens[idx]!;
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer');
  return abrirEnlace
    ? abrirEnlace(tokens, idx, opciones, entorno, renderizador)
    : renderizador.renderToken(tokens, idx, opciones);
};

/** Convierte Markdown del mentor en HTML seguro. Cadena vacía si no hay contenido. */
export function renderizarMarkdown(fuente: string): string {
  if (!fuente) return '';
  return sanitizarHtml(md.render(fuente));
}

/** Texto plano equivalente (para el anuncio a lectores de pantalla). */
export function textoPlano(fuente: string): string {
  if (!fuente) return '';
  // Se lee del HTML de markdown-it (ya escapado) sin pasar por el DOM real: se quitan las
  // etiquetas y se decodifican las entidades básicas.
  const html = md.render(fuente);
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
