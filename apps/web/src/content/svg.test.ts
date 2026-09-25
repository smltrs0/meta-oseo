import { describe, expect, it } from 'vitest';
import { SVG_MAX_BYTES } from './constantes';
import { analizarSvg, auditarRecursos, problemasSvg } from './svg';
import type { DependenciasAuditoria } from './svg';
import { muestra, validar } from './__fixtures__/utiles';

// SVG de las pruebas: viven junto al módulo de muestra y se sirven como si estuvieran en public/.
const crudos = import.meta.glob('./__fixtures__/svg/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const svgDeMuestra = (nombre: string): string => {
  const texto = crudos[`./__fixtures__/svg/${nombre}.svg`];
  if (texto === undefined) throw new Error(`Falta el SVG de prueba ${nombre}`);
  return texto;
};

function svgSimple(cuerpo: string, viewBox = '0 0 100 100'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${cuerpo}</svg>`;
}

describe('analizarSvg', () => {
  it('lee el viewBox, los ids y cuáles son de grupos', () => {
    const info = analizarSvg(
      svgSimple('<g id="capa_a"><rect id="fig_1" width="1" height="1"/></g><g id=\'capa_b\'/>'),
    );
    expect(info.viewBox).toBe('0 0 100 100');
    expect(info.ids).toEqual(['capa_a', 'fig_1', 'capa_b']);
    expect(info.idsGrupo).toEqual(['capa_a', 'capa_b']);
    expect(info.bytes).toBeGreaterThan(50);
  });

  it('ignora lo que hay en comentarios y no lanza con basura', () => {
    const info = analizarSvg(
      `<!-- <g id="fantasma"> --><svg viewBox="0 0 1 1"><g id="real"/></svg>`,
    );
    expect(info.ids).toEqual(['real']);
    expect(() => analizarSvg('esto no es un svg <<<>>>')).not.toThrow();
    expect(analizarSvg('').viewBox).toBeNull();
  });

  it('cuenta bytes UTF-8, no caracteres', () => {
    expect(analizarSvg('ñ').bytes).toBe(2);
  });
});

describe('problemasSvg', () => {
  it('los SVG de la muestra son válidos con su viewBox y sus capas', () => {
    expect(
      problemasSvg(svgDeMuestra('hueso_capas'), {
        viewBox: '0 0 800 600',
        capas: [
          'capa_periostio',
          'capa_hueso_compacto',
          'capa_hueso_esponjoso',
          'capa_medula_osea',
        ],
      }),
    ).toEqual([]);
    expect(problemasSvg(svgDeMuestra('membrana_celular'), { viewBox: '0 0 800 600' })).toEqual([]);
    expect(
      problemasSvg(svgDeMuestra('celulas_histologia'), {
        viewBox: '0 0 800 500',
        capas: ['histo_osteoblasto', 'histo_osteocito', 'histo_osteoclasto'],
      }),
    ).toEqual([]);
  });

  it('acepta prólogo XML y comentarios antes de <svg>', () => {
    expect(
      problemasSvg(`<?xml version="1.0"?>\n<!-- Autor -->\n${svgSimple('<g id="a"/>')}`),
    ).toEqual([]);
  });

  it.each([
    ['un script', svgSimple('<script>alert(1)</script>'), 'script'],
    ['un foreignObject', svgSimple('<foreignObject><div/></foreignObject>'), 'foreignObject'],
    ['un <style>', svgSimple('<style>.a{fill:red}</style>'), '<style>'],
    ['una imagen incrustada', svgSimple('<image href="#x" width="1" height="1"/>'), '<image>'],
    [
      'una animación SMIL',
      svgSimple('<rect width="1" height="1"><animate attributeName="x" to="5"/></rect>'),
      'SMIL',
    ],
    [
      'un set SMIL',
      svgSimple('<rect width="1" height="1"><set attributeName="x" to="5"/></rect>'),
      'SMIL',
    ],
    ['un manejador onclick', svgSimple('<rect onclick="alert(1)" width="1" height="1"/>'), 'on*='],
    ['un manejador onload', `<svg viewBox="0 0 1 1" onload="x()"></svg>`, 'on*='],
    ['un javascript:', svgSimple('<a href="javascript:alert(1)"><rect/></a>'), 'javascript:'],
    ['un DOCTYPE', `<!DOCTYPE svg SYSTEM "x.dtd">${svgSimple('')}`, 'DOCTYPE'],
    ['un ENTITY', `<!ENTITY x "y">${svgSimple('')}`, 'DOCTYPE o ENTITY'],
  ])('rechaza %s', (_nombre, svg, fragmento) => {
    const problemas = problemasSvg(svg);
    expect(
      problemas.some((p) => p.includes(fragmento)),
      problemas.join(' | '),
    ).toBe(true);
  });

  it('detecta on*= pegado a la comilla anterior o a una barra, y no confunde texto con atributos', () => {
    const pegado = problemasSvg(svgSimple('<g id="capa_a"onclick="alert(1)"><rect/></g>'));
    expect(pegado.some((p) => p.includes('on*='))).toBe(true);
    const barra = problemasSvg(svgSimple('<g/onclick="alert(1)" id="capa_a"></g>'));
    expect(barra.some((p) => p.includes('on*='))).toBe(true);
    // Texto y valores que contienen "on...=" no son atributos.
    expect(problemasSvg(svgSimple('<title>Zona onda=3</title><g id="capa_a"/>'))).toEqual([]);
    expect(problemasSvg(svgSimple('<g id="capa_a" data-nota="onclick=1"/>'))).toEqual([]);
  });

  it('las animaciones exigen grupos de primer nivel y ninguna forma suelta en la raíz', () => {
    const bien = svgSimple('<defs/><g id="fondo"><g id="detalle"/></g><g id="otro"/>');
    expect(problemasSvg(bien, { gruposRaiz: ['fondo', 'otro'] })).toEqual([]);
    // "detalle" existe pero está anidado.
    const anidado = problemasSvg(bien, { gruposRaiz: ['detalle'] });
    expect(anidado.some((p) => p.includes('no es hijo directo'))).toBe(true);
    // Falta del todo.
    expect(
      problemasSvg(bien, { gruposRaiz: ['nada'] }).some((p) => p.includes('Falta el grupo')),
    ).toBe(true);
    // Forma suelta en la raíz.
    const suelta = svgSimple('<rect width="1" height="1"/><g id="fondo"/>');
    expect(
      problemasSvg(suelta, { gruposRaiz: ['fondo'] }).some((p) => p.includes('formas sueltas')),
    ).toBe(true);
    // Sin `gruposRaiz` (multicapa) la raíz puede llevar formas.
    expect(problemasSvg(suelta, { capas: ['fondo'] })).toEqual([]);
  });

  it('analizarSvg da los hijos directos de la raíz y los ids referenciados', () => {
    const info = analizarSvg(
      svgSimple(
        '<defs><linearGradient id="aux_g"/></defs><g id="capa_a"><rect id="r1" fill="url(#aux_g)"/><use href="#r1"/></g><rect id="suelta"/>',
      ),
    );
    expect(info.hijosRaiz).toEqual([
      { etiqueta: 'defs', id: null },
      { etiqueta: 'g', id: 'capa_a' },
      { etiqueta: 'rect', id: 'suelta' },
    ]);
    expect([...info.idsReferenciados].sort()).toEqual(['aux_g', 'r1']);
  });

  it('rechaza referencias externas (href y url()) y admite las internas', () => {
    expect(
      problemasSvg(svgSimple('<use href="https://x.org/a.svg#i"/>')).some((p) =>
        p.includes('href="https://x.org/a.svg#i"'),
      ),
    ).toBe(true);
    expect(
      problemasSvg(svgSimple('<use xlink:href="/otro.svg#i"/>')).some((p) => p.includes('externa')),
    ).toBe(true);
    expect(
      problemasSvg(svgSimple('<rect fill="url(https://x.org/g.svg#g)"/>')).some((p) =>
        p.includes('url('),
      ),
    ).toBe(true);
    expect(
      problemasSvg(svgSimple('<rect fill="url(data:image/png;base64,AAA)"/>')).some((p) =>
        p.includes('url('),
      ),
    ).toBe(true);
    // Internas: válidas.
    expect(
      problemasSvg(
        svgSimple(
          '<defs><linearGradient id="aux_degradado"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect id="r" fill="url(#aux_degradado)"/><use href="#r"/>',
        ),
      ),
    ).toEqual([]);
  });

  it('lo que está dentro de un comentario no cuenta', () => {
    expect(problemasSvg(svgSimple('<!-- <script>x</script> onclick="1" --><g id="a"/>'))).toEqual(
      [],
    );
  });

  it('detecta etiquetas mal cerradas o sin cerrar (archivo truncado)', () => {
    expect(
      problemasSvg('<svg viewBox="0 0 1 1"><g id="a"><rect/></svg>').some((p) =>
        p.includes('mal anidadas'),
      ),
    ).toBe(true);
    expect(
      problemasSvg('<svg viewBox="0 0 1 1"><g id="a">').some((p) => p.includes('sin cerrar')),
    ).toBe(true);
    expect(problemasSvg('<svg viewBox="0 0 1 1"><g id="a"/></svg>')).toEqual([]);
  });

  it('exige empezar por <svg>', () => {
    expect(problemasSvg('<html><body/></html>')).toEqual(['No empieza con una etiqueta <svg>.']);
    expect(problemasSvg('')).toEqual(['No empieza con una etiqueta <svg>.']);
    expect(problemasSvg('texto suelto <svg viewBox="0 0 1 1"/>')).toEqual([
      'No empieza con una etiqueta <svg>.',
    ]);
  });

  it('exige viewBox y que coincida con el de content.json (aunque cambien los separadores)', () => {
    expect(problemasSvg('<svg><g id="a"/></svg>')).toContain(
      'La etiqueta <svg> no tiene atributo viewBox.',
    );
    const svg = svgSimple('<g id="a"/>', '0 0 800 600');
    expect(problemasSvg(svg, { viewBox: '0 0 800 600' })).toEqual([]);
    expect(
      problemasSvg(svgSimple('<g id="a"/>', '0,0,800,600'), { viewBox: '0 0 800 600' }),
    ).toEqual([]);
    const distinto = problemasSvg(svg, { viewBox: '0 0 400 300' });
    expect(distinto).toHaveLength(1);
    expect(distinto[0]).toContain('no coincide');
  });

  it('cada capa declarada debe ser un <g id="...">', () => {
    const svg = svgSimple('<g id="capa_a"/><path id="capa_b" d="M0 0"/>');
    expect(problemasSvg(svg, { capas: ['capa_a'] })).toEqual([]);
    const sinG = problemasSvg(svg, { capas: ['capa_b'] });
    expect(sinG[0]).toContain('no está en un <g>');
    const faltante = problemasSvg(svg, { capas: ['capa_c'] });
    expect(faltante[0]).toContain('Falta la capa <g id="capa_c">');
  });

  it('un id no puede repetirse dentro del archivo', () => {
    const problemas = problemasSvg(svgSimple('<g id="capa_a"/><g id="capa_a"/>'));
    expect(problemas).toContain('Id repetido dentro del archivo: "capa_a".');
  });

  it(`no admite SVG de más de ${SVG_MAX_BYTES / 1024} KB`, () => {
    const grande = svgSimple(
      `<g id="a"><path d="${'M0 0 L1 1 '.repeat(SVG_MAX_BYTES / 10)}"/></g>`,
    );
    expect(problemasSvg(grande).some((p) => p.includes('KB'))).toBe(true);
    expect(problemasSvg(svgSimple('<g id="a"/>'))).toEqual([]);
  });
});

describe('auditarRecursos', () => {
  const modulo = validar(muestra()).modulo!;

  // Simula public/: los SVG de la muestra bajo /images/m1/ y los archivos de video.
  function dependencias(sobrescribir: Record<string, string | null> = {}): DependenciasAuditoria {
    const svgs: Record<string, string> = {
      '/images/m1/hueso_capas.svg': svgDeMuestra('hueso_capas'),
      '/images/m1/remodelado_pasos.svg': svgDeMuestra('remodelado_pasos'),
      '/images/m1/membrana_celular.svg': svgDeMuestra('membrana_celular'),
      '/images/m1/celulas_histologia.svg': svgDeMuestra('celulas_histologia'),
    };
    for (const [ruta, valor] of Object.entries(sobrescribir)) {
      if (valor === null) delete svgs[ruta];
      else svgs[ruta] = valor;
    }
    const otros = new Set([
      '/videos/m1/introduccion_hueso.mp4',
      '/videos/m1/introduccion_hueso.es.vtt',
    ]);
    return {
      leerSvg: (ruta) => svgs[ruta],
      existe: (ruta) => ruta in svgs || otros.has(ruta),
    };
  }

  it('el módulo de muestra pasa la auditoría completa', () => {
    expect(auditarRecursos(modulo, dependencias())).toEqual([]);
  });

  it('avisa de un SVG que no existe y de un video o subtítulo que no existen', () => {
    const sinSvg = auditarRecursos(modulo, dependencias({ '/images/m1/hueso_capas.svg': null }));
    expect(
      sinSvg.some(
        (p) => p.ruta === '/images/m1/hueso_capas.svg' && p.mensaje.includes('no existe'),
      ),
    ).toBe(true);
    const sinVideo: DependenciasAuditoria = {
      ...dependencias(),
      existe: (ruta) =>
        ruta !== '/videos/m1/introduccion_hueso.mp4' &&
        ruta !== '/videos/m1/introduccion_hueso.es.vtt' &&
        ruta.endsWith('.svg'),
    };
    const problemas = auditarRecursos(modulo, sinVideo);
    expect(
      problemas
        .filter((p) => p.mensaje.includes('no existe'))
        .map((p) => p.ruta)
        .sort(),
    ).toEqual(['/videos/m1/introduccion_hueso.es.vtt', '/videos/m1/introduccion_hueso.mp4']);
  });

  it('avisa si falta una capa declarada de la multicapa', () => {
    const sinCapa = svgDeMuestra('hueso_capas').replace('id="capa_medula_osea"', 'id="capa_otra"');
    const problemas = auditarRecursos(
      modulo,
      dependencias({ '/images/m1/hueso_capas.svg': sinCapa }),
    );
    expect(
      problemas.some(
        (p) => p.usadoPor === 'm1_capas_hueso' && p.mensaje.includes('capa_medula_osea'),
      ),
    ).toBe(true);
  });

  it('avisa si el viewBox del archivo no es el declarado', () => {
    const otro = svgDeMuestra('hueso_capas').replace(
      'viewBox="0 0 800 600"',
      'viewBox="0 0 400 300"',
    );
    const problemas = auditarRecursos(modulo, dependencias({ '/images/m1/hueso_capas.svg': otro }));
    expect(problemas.some((p) => p.mensaje.includes('no coincide'))).toBe(true);
  });

  it('avisa si un paso de la animación pide un grupo que el SVG no tiene', () => {
    const sinGrupo = svgDeMuestra('remodelado_pasos').replace(
      'id="osteoclasto_activo"',
      'id="osteoclasto_x"',
    );
    const problemas = auditarRecursos(
      modulo,
      dependencias({ '/images/m1/remodelado_pasos.svg': sinGrupo }),
    );
    expect(
      problemas.some(
        (p) => p.usadoPor === 'm1_animacion_remodelado' && p.mensaje.includes('osteoclasto_activo'),
      ),
    ).toBe(true);
  });

  it('un SVG con un script se rechaza aunque exista', () => {
    const conScript = svgDeMuestra('membrana_celular').replace(
      '</svg>',
      '<script>alert(1)</script></svg>',
    );
    const problemas = auditarRecursos(
      modulo,
      dependencias({ '/images/m1/membrana_celular.svg': conScript }),
    );
    expect(problemas.some((p) => p.mensaje.includes('script'))).toBe(true);
  });

  it('los SVG inline de un mismo módulo no pueden compartir ids REFERENCIADOS', () => {
    // La membrana y la multicapa definen y usan el mismo degradado.
    const conDegradado = (svg: string): string =>
      svg.replace(
        /(<svg[^>]*>)/,
        '$1<defs><linearGradient id="aux_comun"><stop offset="0"/></linearGradient></defs><rect width="1" height="1" fill="url(#aux_comun)"/>',
      );
    const problemas = auditarRecursos(
      modulo,
      dependencias({
        '/images/m1/membrana_celular.svg': conDegradado(svgDeMuestra('membrana_celular')),
        '/images/m1/hueso_capas.svg': conDegradado(svgDeMuestra('hueso_capas')),
      }),
    );
    expect(problemas.some((p) => p.mensaje.includes('"aux_comun"'))).toBe(true);
  });

  it('los ids autogenerados que nadie referencia (Inkscape) no chocan entre SVG', () => {
    // `svg5` y `layer1` aparecen en los dos archivos, pero ningún url(#..) ni href los usa.
    const conAutoIds = (svg: string): string =>
      svg.replace(/(<svg[^>]*>)/, '$1<g id="layer1"><metadata id="metadata5"/></g>');
    const problemas = auditarRecursos(
      modulo,
      dependencias({
        '/images/m1/membrana_celular.svg': conAutoIds(svgDeMuestra('membrana_celular')),
        '/images/m1/hueso_capas.svg': conAutoIds(svgDeMuestra('hueso_capas')),
      }),
    );
    expect(problemas.filter((p) => p.mensaje.includes('también está definido'))).toEqual([]);
  });

  it('un mismo SVG usado dos veces no cuenta como choque consigo mismo', () => {
    // hueso_capas.svg se usa como <img> (bloque imagen) y como SVG inline (multicapa).
    const problemas = auditarRecursos(modulo, dependencias());
    expect(problemas.filter((p) => p.mensaje.includes('también está definido'))).toEqual([]);
  });

  it('las imágenes que se muestran con <img> se comprueban pero no exigen capas', () => {
    // Un SVG de un bloque imagen sin <g> con id es válido; con un script no.
    const soloImagen = {
      secciones: [
        {
          id: 's',
          titulo: 'Sección',
          bloques: [
            {
              id: 'i_1',
              tipo: 'imagen' as const,
              src: '/images/m1/dibujo.svg',
              alt: 'Un dibujo de prueba',
              pie: 'Pie de foto',
            },
          ],
        },
      ],
    };
    const deps = (svg: string | undefined): DependenciasAuditoria => ({
      leerSvg: () => svg,
      existe: () => svg !== undefined,
    });
    expect(auditarRecursos(soloImagen, deps(svgSimple('<rect width="1" height="1"/>')))).toEqual(
      [],
    );
    expect(
      auditarRecursos(soloImagen, deps(svgSimple('<script>1</script>'))).length,
    ).toBeGreaterThan(0);
    expect(auditarRecursos(soloImagen, deps(undefined))[0]?.mensaje).toContain('no existe');
  });
});
