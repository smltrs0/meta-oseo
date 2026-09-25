import { describe, expect, it } from 'vitest';
import {
  enlacesDeTexto,
  idsGlosarioEnTexto,
  problemasMarkdownBloque,
  problemasMarkdownLinea,
  problemasTextoPlano,
} from './texto';

describe('problemasTextoPlano', () => {
  it('acepta texto normal con tildes, ñ, símbolos químicos y comparadores', () => {
    for (const texto of [
      'Osteoblasto',
      'Mandíbula: ángulo y rama',
      'Ca²⁺ y HPO₄²⁻ (fosfato)',
      'PTH < 20 pg/mL en el suero',
      '5 * 3 = 15',
      'Nota: el 99 % del calcio está en el hueso.',
    ]) {
      expect(problemasTextoPlano(texto), texto).toEqual([]);
    }
  });

  it.each([
    ['Markdown de negrita', 'El **osteoblasto** forma hueso'],
    ['HTML', 'Texto con <b>negrita</b>'],
    ['una etiqueta de script', '<script>alert(1)</script>'],
    ['un comentario HTML', 'texto <!-- oculto -->'],
    ['un enlace', 'ver [aquí](https://ejemplo.org)'],
    ['comillas invertidas', 'usa `codigo` aquí'],
    ['varias líneas', 'línea uno\nlínea dos'],
    ['caracteres de control', 'texto\u0007con campana'],
    ['una tabulación', 'texto\ttabulado'],
    ['una imagen', 'mira ![foto](https://x.org/a.png)'],
    ['codificación dañada (Ã³)', 'AsociaciÃ³n de células'],
    ['el carácter de reemplazo', 'texto \uFFFD roto'],
  ])('rechaza %s', (_nombre, texto) => {
    expect(problemasTextoPlano(texto).length).toBeGreaterThan(0);
  });
});

describe('problemasMarkdownLinea', () => {
  it('acepta énfasis y enlaces al glosario y https', () => {
    expect(
      problemasMarkdownLinea(
        'El [osteoblasto](glosario:osteoblasto) forma **matriz** y *osteoide*; ver [OMS](https://www.who.int/es).',
      ),
    ).toEqual([]);
  });

  it.each([
    ['más de una línea', 'uno\ndos'],
    ['una lista', '- elemento'],
    ['una lista numerada', '1. primero'],
    ['un título', '# Título'],
    ['una cita', '> cita'],
    ['una tabla', '| a | b |'],
    ['una línea horizontal', '---'],
    ['HTML', 'texto <em>hola</em>'],
    ['un enlace http sin cifrar', '[x](http://ejemplo.org)'],
    ['un enlace relativo', '[x](/otra/pagina)'],
    ['un javascript:', '[x](javascript:alert(1))'],
    ['un enlace con espacio', '[x] (glosario:a)'],
    ['un id de glosario inválido', '[x](glosario:Osteo Blasto)'],
    ['una negrita sin cerrar', 'texto **abierto'],
    ['una imagen', '![a](https://x.org/a.png)'],
  ])('rechaza %s', (_nombre, texto) => {
    expect(problemasMarkdownLinea(texto).length).toBeGreaterThan(0);
  });
});

describe('problemasMarkdownBloque', () => {
  const conTitulos = { titulos: true };
  const sinTitulos = { titulos: false };

  it('acepta párrafos, listas planas y títulos ### y ####', () => {
    const texto =
      'Primer párrafo con **negrita**.\n\n### Subtítulo\n\n- uno\n- dos\n\n1. primero\n2. segundo\n\n#### Detalle\n\nCierre.';
    expect(problemasMarkdownBloque(texto, conTitulos)).toEqual([]);
  });

  it('rechaza títulos "#", "##" y "#####" y todos los títulos si no se admiten', () => {
    expect(problemasMarkdownBloque('# Uno\n\ntexto', conTitulos).length).toBeGreaterThan(0);
    expect(problemasMarkdownBloque('## Dos\n\ntexto', conTitulos).length).toBeGreaterThan(0);
    expect(problemasMarkdownBloque('##### Cinco\n\ntexto', conTitulos).length).toBeGreaterThan(0);
    expect(problemasMarkdownBloque('### Tres\n\ntexto', sinTitulos).length).toBeGreaterThan(0);
  });

  it.each([
    ['una tabla', 'antes\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\ndespués'],
    ['una cita', '> texto citado'],
    ['una línea horizontal', 'antes\n\n---\n\ndespués'],
    ['una lista anidada', '- uno\n  - anidado'],
    ['HTML en bloque', 'texto\n\n<div>caja</div>'],
    ['varias líneas en blanco', 'uno\n\n\n\ndos'],
    ['un título subrayado', 'Título\n=====\n\ntexto'],
    ['saltos \\r\\n', 'uno\r\n\r\ndos'],
  ])('rechaza %s', (_nombre, texto) => {
    expect(problemasMarkdownBloque(texto, conTitulos).length).toBeGreaterThan(0);
  });
});

describe('enlaces', () => {
  it('extrae los enlaces y los ids de glosario en orden', () => {
    const texto =
      'a [uno](glosario:osteoblasto), b [dos](https://x.org/a) y [tres](glosario:matriz_osea)';
    expect(enlacesDeTexto(texto)).toEqual([
      { texto: 'uno', destino: 'glosario:osteoblasto' },
      { texto: 'dos', destino: 'https://x.org/a' },
      { texto: 'tres', destino: 'glosario:matriz_osea' },
    ]);
    expect(idsGlosarioEnTexto(texto)).toEqual(['osteoblasto', 'matriz_osea']);
    expect(idsGlosarioEnTexto('sin enlaces')).toEqual([]);
  });
});
