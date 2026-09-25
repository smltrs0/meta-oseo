import { describe, expect, it } from 'vitest';
import { recorrerCadenas } from './consultas';
import {
  renderizarBloque,
  renderizarLinea,
  sanitizarSalida,
  textoPlanoDeMarkdown,
} from './markdown';
import { problemasMarkdownBloque, problemasMarkdownLinea } from './texto';
import { muestra } from './__fixtures__/utiles';

function aDom(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('renderizarLinea', () => {
  it('convierte énfasis en <strong> y <em> sin envolver en párrafo', () => {
    expect(renderizarLinea('El **osteoblasto** forma *matriz*.')).toBe(
      'El <strong>osteoblasto</strong> forma <em>matriz</em>.',
    );
  });

  it('un enlace al glosario se vuelve un ancla que la interfaz puede interceptar', () => {
    const html = renderizarLinea('Un [osteoclasto](glosario:osteoclasto) grande.');
    expect(html).toBe(
      'Un <a href="#glosario-osteoclasto" data-glosario="osteoclasto" class="enlace-glosario">osteoclasto</a> grande.',
    );
    const ancla = aDom(html).querySelector('a');
    expect(ancla?.getAttribute('data-glosario')).toBe('osteoclasto');
    expect(ancla?.getAttribute('target')).toBeNull();
  });

  it('un enlace https se abre en otra pestaña sin dar acceso a la ventana de origen', () => {
    const html = renderizarLinea('Ver [OMS](https://www.who.int/es?a=1&b=2).');
    expect(html).toBe(
      'Ver <a href="https://www.who.int/es?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">OMS</a>.',
    );
  });

  it('texto vacío da cadena vacía', () => {
    expect(renderizarLinea('')).toBe('');
    expect(renderizarBloque('')).toBe('');
  });

  it('escapa los caracteres especiales del texto plano (Ca²⁺, <, &)', () => {
    expect(renderizarLinea('PTH < 20 pg/mL & Ca²⁺')).toBe('PTH &lt; 20 pg/mL &amp; Ca²⁺');
  });
});

describe('renderizarBloque', () => {
  it('párrafos, listas planas y títulos ### y ####', () => {
    const html = renderizarBloque(
      'Primero.\n\n### Subtítulo\n\n- uno\n- **dos**\n\n1. a\n2. b\n\n#### Detalle\n\nFin.',
    );
    const div = aDom(html);
    expect([...div.children].map((e) => e.tagName)).toEqual(['P', 'H3', 'UL', 'OL', 'H4', 'P']);
    expect(div.querySelectorAll('li')).toHaveLength(4);
    expect(div.querySelector('strong')?.textContent).toBe('dos');
  });

  it('los títulos #, ##, #####, las citas, las tablas y el código NO se interpretan', () => {
    for (const texto of ['# Uno', '## Dos', '##### Cinco', '> cita', '`codigo`', '---']) {
      const html = renderizarBloque(texto);
      expect(html, texto).not.toMatch(/<(?:h1|h2|h5|h6|blockquote|code|pre|hr|table)/);
    }
    expect(renderizarBloque('| a | b |\n|---|---|\n| 1 | 2 |')).not.toContain('<table');
  });
});

describe('sanitizarSalida: lista blanca sobre cadenas', () => {
  it('conserva las etiquetas permitidas y descarta sus atributos', () => {
    expect(
      sanitizarSalida('<p class="x" onclick="y()">hola <strong style="z">a</strong></p>'),
    ).toBe('<p>hola <strong>a</strong></p>');
    expect(sanitizarSalida('<ul><li>a</li></ul><h3 id="t">t</h3><br>')).toBe(
      '<ul><li>a</li></ul><h3>t</h3><br>',
    );
  });

  it('convierte en texto cualquier etiqueta ajena, comentario o < suelto', () => {
    expect(sanitizarSalida('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(sanitizarSalida('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    expect(sanitizarSalida('<iframe src="https://x.org"></iframe>')).toBe(
      '&lt;iframe src="https://x.org"&gt;&lt;/iframe&gt;',
    );
    expect(sanitizarSalida('<!-- oculto -->')).toBe('&lt;!-- oculto --&gt;');
    expect(sanitizarSalida('a < b y c > d')).toBe('a &lt; b y c &gt; d');
    expect(sanitizarSalida('<svg onload=alert(1)>')).toBe('&lt;svg onload=alert(1)&gt;');
  });

  it('los enlaces solo conservan un destino https o #glosario-id válido', () => {
    expect(sanitizarSalida('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizarSalida('<a href="JaVaScRiPt:alert(1)" onclick="y">x</a>')).toBe('<a>x</a>');
    expect(sanitizarSalida('<a href="http://sin-cifrar.example">x</a>')).toBe('<a>x</a>');
    expect(sanitizarSalida('<a href="/ruta/relativa">x</a>')).toBe('<a>x</a>');
    expect(sanitizarSalida('<a href="data:text/html;base64,AAAA">x</a>')).toBe('<a>x</a>');
    expect(sanitizarSalida('<a href="#otra-cosa">x</a>')).toBe('<a>x</a>');
    expect(sanitizarSalida('<a href="#glosario-Bad Id" data-glosario="Bad Id">x</a>')).toBe(
      '<a>x</a>',
    );
    // El data-glosario tiene que coincidir con el destino.
    expect(sanitizarSalida('<a href="#glosario-a" data-glosario="b">x</a>')).toBe('<a>x</a>');
    expect(
      sanitizarSalida('<a href="#glosario-a" data-glosario="a" class="z" title="t">x</a>'),
    ).toBe('<a href="#glosario-a" data-glosario="a" class="enlace-glosario">x</a>');
    expect(
      sanitizarSalida('<a href="https://ok.example/a" title="t" onmouseover="y()">x</a>'),
    ).toBe('<a href="https://ok.example/a" target="_blank" rel="noopener noreferrer">x</a>');
  });

  it('un href https con comillas o ángulos no pasa', () => {
    expect(sanitizarSalida('<a href="https://ok.example/a>b">x</a>')).toBe('<a>x</a>');
    expect(sanitizarSalida('<a href="https://x.org/ onmouseover=alert(1)">x</a>')).toBe('<a>x</a>');
  });

  it('no lanza con entradas raras', () => {
    for (const basura of [
      '',
      '<',
      '>',
      '<<<>>>',
      '<a',
      '<a href=',
      '</',
      '<p',
      '&lt;p&gt;',
      '\u0000',
    ]) {
      expect(() => sanitizarSalida(basura)).not.toThrow();
    }
  });
});

describe('seguridad de extremo a extremo (markdown-it + lista blanca)', () => {
  const ataques = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">clic</a>',
    '[clic](javascript:alert(1))',
    '[clic](JaVaScRiPt:alert(1))',
    '[clic](data:text/html;base64,PHNjcmlwdD4=)',
    '[clic](http://sin-cifrar.example)',
    '[clic](/ruta/relativa)',
    '![imagen](https://x.example/a.png)',
    '<iframe src="https://x.example"></iframe>',
    '<style>body{display:none}</style>',
    '<svg onload=alert(1)>',
    '`codigo`',
    '> cita',
    '| a | b |\n|---|---|\n| 1 | 2 |',
    '[x](https://ok.example "titulo" onmouseover="alert(1)")',
    '[x](https://ok.example "titulo")',
    '**<script>alert(1)</script>**',
    '[<img src=x onerror=alert(1)>](https://ok.example)',
    '&lt;script&gt;alert(1)&lt;/script&gt;',
    '&#60;script&#62;alert(1)&#60;/script&#62;',
  ];

  it.each(ataques)('no ejecuta ni deja pasar %j', (ataque) => {
    for (const html of [renderizarLinea(ataque), renderizarBloque(ataque)]) {
      const div = aDom(html);
      expect(
        div.querySelector(
          'script, iframe, style, img, svg, object, embed, form, input, link, meta',
        ),
        html,
      ).toBeNull();
      for (const elemento of div.querySelectorAll('*')) {
        expect(['P', 'STRONG', 'EM', 'A', 'UL', 'OL', 'LI', 'H3', 'H4', 'BR']).toContain(
          elemento.tagName,
        );
        for (const atributo of elemento.getAttributeNames()) {
          expect(['href', 'target', 'rel', 'class', 'data-glosario']).toContain(atributo);
        }
      }
      for (const ancla of div.querySelectorAll('a')) {
        const href = ancla.getAttribute('href');
        expect(href === null || /^(?:https:\/\/|#glosario-)/.test(href), html).toBe(true);
      }
      // Ninguna etiqueta suelta: todo `<` del HTML pertenece a una etiqueta permitida.
      const sinEtiquetas = html.replace(
        /<\/?(?:p|strong|em|a|ul|ol|li|h3|h4|br)(?:\s[^<>]*)?>/g,
        '',
      );
      expect(sinEtiquetas, html).not.toMatch(/[<>]/);
    }
  });

  it('el texto del ataque sigue visible como texto (se escapa, no se descarta en silencio)', () => {
    expect(renderizarLinea('<b>negrita</b>')).toBe('&lt;b&gt;negrita&lt;/b&gt;');
    expect(aDom(renderizarLinea('<b>negrita</b>')).textContent).toBe('<b>negrita</b>');
  });
});

describe('textoPlanoDeMarkdown', () => {
  it('quita el marcado y decodifica lo escapado', () => {
    expect(textoPlanoDeMarkdown('El **osteoblasto** forma [matriz](glosario:matriz_osea).')).toBe(
      'El osteoblasto forma matriz.',
    );
    expect(textoPlanoDeMarkdown('PTH < 20 & "alto"')).toBe('PTH < 20 & "alto"');
    expect(textoPlanoDeMarkdown('- uno\n- dos\n\nfin')).toBe('uno dos fin');
    expect(textoPlanoDeMarkdown('')).toBe('');
  });
});

describe('todo el texto válido del módulo de muestra se renderiza sin perder nada', () => {
  it('el HTML final tiene el mismo texto que el Markdown', () => {
    let revisados = 0;
    recorrerCadenas(muestra(), [], (texto, ruta) => {
      const esBloque =
        texto.includes('\n') && problemasMarkdownBloque(texto, { titulos: true }).length === 0;
      const esLinea =
        !texto.includes('\n') &&
        /\*|\]\(/.test(texto) &&
        problemasMarkdownLinea(texto).length === 0;
      if (!esBloque && !esLinea) return;
      const html = esBloque ? renderizarBloque(texto) : renderizarLinea(texto);
      const visible = aDom(html).textContent?.replace(/\s+/g, ' ').trim();
      expect(visible, ruta.join('.')).toBe(textoPlanoDeMarkdown(texto));
      expect(html.length).toBeGreaterThan(0);
      revisados++;
    });
    expect(revisados).toBeGreaterThan(10);
  });
});
