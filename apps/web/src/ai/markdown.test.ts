import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderizarMarkdown, textoPlano } from './markdown';
import { sanitizarHtml } from './sanitizar';

/*
 * La segunda capa (DOMPurify, `sanitizar.ts`) se sustituye aquí por una función identidad con
 * espía: DOMPurify 3.4 no funciona bajo happy-dom 20 (su `nodeName` base devuelve "" y el
 * NodeIterator se detiene al borrar un nodo), así que no se puede probar con este entorno.
 * Lo que sí se prueba aquí:
 *   - la capa 1 (markdown-it) por sí sola frena el HTML crudo y los enlaces peligrosos;
 *   - `renderizarMarkdown` pasa SIEMPRE su resultado por la capa 2.
 * La capa 2 se prueba contra un DOM real en `sanitizar.test.ts` (requiere jsdom).
 */
vi.mock('./sanitizar', () => ({ sanitizarHtml: vi.fn((html: string) => html) }));

const sanitizar = vi.mocked(sanitizarHtml);

beforeEach(() => {
  sanitizar.mockClear();
  sanitizar.mockImplementation((html) => html);
});

/** Parsea con DOMParser (documento inerte: no carga marcos ni imágenes). */
function aDom(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('renderizarMarkdown: formato', () => {
  it('cadena vacía -> cadena vacía', () => {
    expect(renderizarMarkdown('')).toBe('');
  });

  it('párrafos, negrita, cursiva y código en línea', () => {
    const doc = aDom(renderizarMarkdown('Los **osteoclastos** son _grandes_ y usan `H+`.'));
    expect(doc.querySelector('p')).not.toBeNull();
    expect(doc.querySelector('strong')?.textContent).toBe('osteoclastos');
    expect(doc.querySelector('em')?.textContent).toBe('grandes');
    expect(doc.querySelector('code')?.textContent).toBe('H+');
  });

  it('listas ordenadas y con viñetas', () => {
    const doc = aDom(renderizarMarkdown('- uno\n- dos\n\n1. a\n2. b'));
    expect(doc.querySelectorAll('ul > li')).toHaveLength(2);
    expect(doc.querySelectorAll('ol > li')).toHaveLength(2);
  });

  it('bloques de código y tablas', () => {
    const doc = aDom(renderizarMarkdown('```\nRANKL\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |'));
    expect(doc.querySelector('pre code')?.textContent).toContain('RANKL');
    expect(doc.querySelector('table th')?.textContent).toBe('a');
  });

  it('un bloque de código sin cerrar (respuesta a medias) no rompe el render', () => {
    const doc = aDom(renderizarMarkdown('Mira:\n```\nRANK'));
    expect(doc.querySelector('pre code')?.textContent).toContain('RANK');
  });

  it('un salto de línea simple se respeta', () => {
    expect(renderizarMarkdown('a\nb')).toContain('<br>');
  });
});

describe('renderizarMarkdown: enlaces', () => {
  it('los enlaces http(s) abren en pestaña nueva con rel seguro', () => {
    const doc = aDom(renderizarMarkdown('[Guía](https://ejemplo.org/hueso)'));
    const enlace = doc.querySelector('a')!;
    expect(enlace.getAttribute('href')).toBe('https://ejemplo.org/hueso');
    expect(enlace.getAttribute('target')).toBe('_blank');
    expect(enlace.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('las URLs sueltas se convierten en enlaces seguros', () => {
    const doc = aDom(renderizarMarkdown('Mira https://ejemplo.org/x ahora'));
    const enlace = doc.querySelector('a')!;
    expect(enlace.getAttribute('href')).toBe('https://ejemplo.org/x');
    expect(enlace.getAttribute('target')).toBe('_blank');
    expect(enlace.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('mailto: se permite', () => {
    const doc = aDom(renderizarMarkdown('[Escríbeme](mailto:docente@ejemplo.org)'));
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('mailto:docente@ejemplo.org');
  });
});

describe('renderizarMarkdown: capa 1 (markdown-it) frena el XSS por sí sola', () => {
  /** Nada de lo que salga puede ser una etiqueta peligrosa ni llevar manejadores on*. */
  function verificarInerte(html: string): void {
    expect(html).not.toMatch(
      /<\s*(script|iframe|object|embed|style|form|input|img|svg|link|meta)\b/i,
    );
    // Ninguna etiqueta real (no escapada) lleva atributos on*.
    expect(html).not.toMatch(/<[^>]*\son\w+\s*=/i);
    for (const a of Array.from(aDom(html).querySelectorAll('a'))) {
      expect(a.getAttribute('href') ?? '').toMatch(/^(https?:|mailto:)/i);
    }
  }

  it.each([
    '<img src=x onerror=alert(1)>',
    'Mira esto: <img src=x onerror="alert(document.cookie)">',
    '<script>alert(1)</script>',
    '<iframe src="https://malo.example"></iframe>',
    '<svg onload=alert(1)>',
    '<a href="javascript:alert(1)">clic</a>',
    '<a href="https://x.example" onclick="robar()">x</a>',
    '<style>body{display:none}</style>',
    '<form action="https://malo.example"><input name=x></form>',
    '<details open ontoggle=alert(1)>x</details>',
  ])('el HTML crudo se escapa como texto: %s', (fuente) => {
    const html = renderizarMarkdown(fuente);
    verificarInerte(html);
    // Se ve como texto literal (escapado), no desaparece en silencio.
    expect(html).toContain('&lt;');
  });

  it('<img src=x onerror=...> no genera <img> ni atributo onerror en el DOM', () => {
    const doc = aDom(renderizarMarkdown('<img src=x onerror=alert(1)>'));
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.body.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it.each([
    '[clic](javascript:alert(1))',
    '[clic](JaVaScRiPt:alert(1))',
    '[clic](  javascript:alert(1))',
    '[clic](vbscript:msgbox(1))',
    '[clic](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    '[clic](file:///C:/Windows/win.ini)',
    '[clic](java&#115;cript:alert(1))',
    '<javascript:alert(1)>',
  ])('un enlace "%s" no llega al DOM como enlace ejecutable', (fuente) => {
    const html = renderizarMarkdown(fuente);
    verificarInerte(html);
    expect(html).not.toMatch(/href="\s*(javascript|vbscript|data|file):/i);
  });

  it('las imágenes Markdown no se cargan (solo queda texto o enlace)', () => {
    const html = renderizarMarkdown('![pixel](https://rastreo.example/p.png)');
    expect(html).not.toMatch(/<img/i);
    verificarInerte(html);
  });
});

describe('renderizarMarkdown: capa 2 (DOMPurify)', () => {
  it('pasa SIEMPRE el HTML de markdown-it por sanitizarHtml', () => {
    renderizarMarkdown('Hola **mundo**');
    renderizarMarkdown('[a](https://ejemplo.org)');
    renderizarMarkdown('<script>alert(1)</script>');
    expect(sanitizar).toHaveBeenCalledTimes(3);
    expect(sanitizar.mock.calls[0]![0]).toContain('<strong>mundo</strong>');
  });

  it('devuelve lo que devuelve el sanitizador, no el HTML sin limpiar', () => {
    sanitizar.mockImplementation(() => '<p>LIMPIO</p>');
    expect(renderizarMarkdown('cualquier cosa')).toBe('<p>LIMPIO</p>');
  });

  it('con texto vacío no hace falta sanitizar', () => {
    expect(renderizarMarkdown('')).toBe('');
    expect(sanitizar).not.toHaveBeenCalled();
  });
});

describe('textoPlano', () => {
  it('quita el formato y colapsa espacios', () => {
    expect(textoPlano('# Título\n\nLos **osteoclastos**   resorben.\n\n- uno\n- dos')).toBe(
      'Título Los osteoclastos resorben. uno dos',
    );
  });

  it('conserva los caracteres especiales como texto', () => {
    expect(textoPlano('Si a < b & c > d')).toBe('Si a < b & c > d');
  });

  it('cadena vacía -> cadena vacía', () => {
    expect(textoPlano('')).toBe('');
  });
});
