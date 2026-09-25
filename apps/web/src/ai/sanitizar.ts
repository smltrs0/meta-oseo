/**
 * Segunda capa de defensa del Markdown del mentor: DOMPurify sobre el HTML ya renderizado.
 * Vive en su propio módulo para poder probarla y sustituirla por separado de markdown-it.
 *
 * - Lista blanca de etiquetas (perfil HTML de DOMPurify) sin imágenes, medios, formularios,
 *   marcos ni estilos.
 * - Los enlaces solo pueden ser http, https o mailto.
 * - Un gancho fuerza `target="_blank"` y `rel="noopener noreferrer"` en todo enlace que sobreviva.
 */
import type { Config, WindowLike } from 'dompurify';
import DOMPurify from 'dompurify';

const CONFIGURACION: Config = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ['target'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  FORBID_TAGS: [
    'img',
    'picture',
    'video',
    'audio',
    'source',
    'iframe',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'style',
    'link',
    'meta',
  ],
  FORBID_ATTR: ['style', 'srcset'],
};

export type Sanitizador = (html: string) => string;

/**
 * Crea un sanitizador sobre una ventana concreta. Instancia propia de DOMPurify: el gancho de
 * los enlaces no afecta a ningún otro uso de la librería.
 */
export function crearSanitizador(ventana: WindowLike): Sanitizador {
  const purificador = DOMPurify(ventana);
  purificador.addHook('afterSanitizeAttributes', (nodo) => {
    if (nodo.nodeName === 'A') {
      nodo.setAttribute('target', '_blank');
      nodo.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return (html) => purificador.sanitize(html, CONFIGURACION);
}

let porDefecto: Sanitizador | null = null;

/** Limpia HTML con DOMPurify sobre la ventana del navegador (se crea al primer uso). */
export function sanitizarHtml(html: string): string {
  porDefecto ??= crearSanitizador(window);
  return porDefecto(html);
}
