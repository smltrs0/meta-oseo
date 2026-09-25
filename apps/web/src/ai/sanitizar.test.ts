/**
 * Pruebas de la segunda capa (DOMPurify) contra un DOM real.
 *
 * DOMPurify 3.4 no funciona bajo happy-dom 20 (el entorno de vitest de este proyecto): su
 * `nodeName` base devuelve "" y el NodeIterator se detiene al borrar un nodo, así que aquí se
 * usa jsdom, que no es dependencia del proyecto. Si `jsdom` está instalado las pruebas corren;
 * si no, se omiten con un aviso (no fallan). Para activarlas: `pnpm add -D jsdom` en apps/web.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Sanitizador } from './sanitizar';
import { crearSanitizador } from './sanitizar';

interface JsdomMinimo {
  JSDOM: new (html: string) => { window: Window & typeof globalThis };
}

let sanitizar: Sanitizador | null = null;
let ventanaJsdom: (Window & typeof globalThis) | null = null;

beforeAll(async () => {
  try {
    // Especificador en variable: el paquete es opcional y no debe romper el typecheck.
    const nombre = 'jsdom';
    const { JSDOM } = (await import(/* @vite-ignore */ nombre)) as JsdomMinimo;
    ventanaJsdom = new JSDOM('<!doctype html><html><body></body></html>').window;
    sanitizar = crearSanitizador(ventanaJsdom);
  } catch {
    sanitizar = null;
  }
}, 60_000); // importar jsdom por primera vez tarda varios segundos

function aDoc(html: string): Document {
  // El documento de jsdom no carga recursos ni ejecuta scripts por defecto.
  const doc = ventanaJsdom!.document.implementation.createHTMLDocument('');
  doc.body.innerHTML = html;
  return doc;
}

describe('sanitizarHtml con DOM real (jsdom)', () => {
  it('hay un DOM real (jsdom) disponible; si no, estas pruebas se omiten', (contexto) => {
    if (!sanitizar) contexto.skip();
    expect(sanitizar).not.toBeNull();
  });

  it('conserva el formato permitido', (contexto) => {
    if (!sanitizar) contexto.skip();
    const html = sanitizar!(
      '<p>Hola <strong>mundo</strong> <em>x</em> <code>H+</code></p><ul><li>a</li></ul><table><tr><th>a</th></tr></table>',
    );
    const doc = aDoc(html);
    expect(doc.querySelector('p strong')?.textContent).toBe('mundo');
    expect(doc.querySelector('ul li')?.textContent).toBe('a');
    expect(doc.querySelector('table th')?.textContent).toBe('a');
  });

  it('elimina scripts, manejadores on*, marcos, imágenes, formularios y svg', (contexto) => {
    if (!sanitizar) contexto.skip();
    const html = sanitizar!(
      '<p onclick="x()">hola</p><script>alert(1)</script><img src=x onerror=alert(1)>' +
        '<iframe src="https://malo.example"></iframe><form><input></form><svg onload=alert(1)></svg>' +
        '<style>body{display:none}</style><video src=x onerror=alert(1)></video>',
    );
    expect(html).not.toMatch(/<\s*(script|img|iframe|form|input|svg|style|video)/i);
    expect(html).not.toMatch(/\son\w+\s*=/i);
    expect(aDoc(html).querySelector('p')?.textContent).toBe('hola');
  });

  it('rechaza href con javascript:, data:, vbscript: y file:, y deja https y mailto', (contexto) => {
    if (!sanitizar) contexto.skip();
    const doc = aDoc(
      sanitizar!(
        '<a href="javascript:alert(1)">a</a><a href="JaVaScRiPt:alert(1)">b</a>' +
          '<a href="data:text/html,x">c</a><a href="vbscript:x">d</a><a href="file:///etc/passwd">e</a>' +
          '<a href="https://ejemplo.org">f</a><a href="mailto:a@b.org">g</a>',
      ),
    );
    const hrefs = Array.from(doc.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([null, null, null, null, null, 'https://ejemplo.org', 'mailto:a@b.org']);
  });

  it('fuerza target y rel seguros en todo enlace que sobreviva', (contexto) => {
    if (!sanitizar) contexto.skip();
    const enlace = aDoc(
      sanitizar!('<a href="https://ejemplo.org" target="_self" rel="opener">x</a>'),
    ).querySelector('a')!;
    expect(enlace.getAttribute('target')).toBe('_blank');
    expect(enlace.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('quita el atributo style y srcset', (contexto) => {
    if (!sanitizar) contexto.skip();
    const html = sanitizar!('<p style="position:fixed;inset:0">x</p>');
    expect(html).toBe('<p>x</p>');
  });
});
