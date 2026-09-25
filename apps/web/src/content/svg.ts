/**
 * Validación de los SVG del contenido y auditoría de los recursos de un módulo.
 *
 * Los SVG multicapa se inyectan inline en la página y se manipulan por `id` (docs/content-schema.md,
 * "SVG multicapa"). Por eso se validan con reglas más estrictas que un SVG cualquiera:
 *  - Seguridad: sin scripts, manejadores `on*`, `foreignObject`, `<style>`, `<image>`, animaciones
 *    SMIL ni referencias externas. Así basta una desinfección mínima al inyectar (la app quita los `on*`) y las animaciones las
 *    controla solo la actividad (respetando `prefers-reduced-motion`).
 *  - Coherencia con content.json: el `viewBox` declarado coincide y cada capa declarada existe
 *    como `<g id="...">`.
 *  - Sin colisiones: ningún id se repite dentro de un archivo, y los ids que un `url(#id)` o un
 *    `href="#id"` referencian (degradados, máscaras, `<use>`) no se repiten entre los SVG inline de
 *    un mismo módulo. Los ids autogenerados que nadie referencia no cuentan. Además, la app antepone
 *    un prefijo por actividad al inyectar (activities/types.ts).
 *  - Animaciones: los grupos que controlan los pasos son hijos directos de la raíz y no hay formas
 *    sueltas en ella (`gruposRaiz`).
 *
 * Son funciones puras sobre texto: el llamador decide de dónde sale el SVG (archivo, glob de Vite).
 */
import { SVG_MAX_BYTES } from './constantes';
import { recolectarRecursos } from './consultas';
import type { ConSecciones, RecursoReferenciado } from './consultas';

const ELEMENTOS_PROHIBIDOS: readonly { patron: RegExp; motivo: string }[] = [
  { patron: /<script\b/i, motivo: 'contiene <script>' },
  { patron: /<foreignObject\b/i, motivo: 'contiene <foreignObject>' },
  {
    patron: /<style\b/i,
    motivo:
      'contiene <style>: al inyectarse inline sus reglas afectarían a toda la página; usa atributos de presentación o style=""',
  },
  { patron: /<image\b/i, motivo: 'contiene <image>: el SVG debe ser vectorial puro' },
  {
    patron: /<(?:animate|animateTransform|animateMotion|set)\b/i,
    motivo: 'contiene animaciones SMIL: las animaciones las controla la actividad con GSAP',
  },
  { patron: /<!DOCTYPE|<!ENTITY/i, motivo: 'contiene DOCTYPE o ENTITY' },
  { patron: /javascript:/i, motivo: 'contiene "javascript:"' },
];

const ETIQUETA = /<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

export interface InfoSvg {
  /** Valor del atributo `viewBox` de la etiqueta raíz, o `null` si no lo tiene. */
  viewBox: string | null;
  /** Todos los `id` del archivo, en orden y con repetidos. */
  ids: string[];
  /** Ids que están en elementos `<g>`. */
  idsGrupo: string[];
  /** Hijos directos de la raíz `<svg>`, en orden: nombre de la etiqueta (minúsculas) e id. */
  hijosRaiz: { etiqueta: string; id: string | null }[];
  /** Ids que algún `url(#id)` o `href="#id"` del archivo referencia y que el archivo define. */
  idsReferenciados: string[];
  bytes: number;
}

function atributo(atributos: string, nombre: string): string | null {
  const m = new RegExp(`(?:^|\\s)${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(atributos);
  return m ? (m[1] ?? m[2] ?? '') : null;
}

/** Quita comentarios, CDATA y el prólogo XML: lo que hay ahí no es parte del dibujo. */
function sinComentarios(svg: string): string {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '');
}

/** Lee del SVG lo que necesitan las validaciones. No lanza con SVG mal formados. */
export function analizarSvg(svg: string): InfoSvg {
  const limpio = sinComentarios(svg);
  const raiz = /<svg\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/i.exec(limpio);
  const ids: string[] = [];
  const idsGrupo: string[] = [];
  const hijosRaiz: InfoSvg['hijosRaiz'] = [];
  const pila: string[] = [];
  for (const m of limpio.matchAll(ETIQUETA)) {
    const nombre = (m[2] ?? '').toLowerCase();
    if (m[1] === '/') {
      pila.pop();
      continue;
    }
    const id = atributo(m[3] ?? '', 'id');
    if (pila.length === 1) hijosRaiz.push({ etiqueta: nombre, id });
    if (m[4] !== '/') pila.push(nombre);
    if (id === null) continue;
    ids.push(id);
    if (nombre === 'g') idsGrupo.push(id);
  }
  const definidos = new Set(ids);
  const idsReferenciados = new Set<string>();
  for (const m of limpio.matchAll(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/gi)) {
    if (definidos.has(m[1] ?? '')) idsReferenciados.add(m[1] ?? '');
  }
  for (const m of limpio.matchAll(/(?:xlink:)?href\s*=\s*(?:"#([^"]*)"|'#([^']*)')/gi)) {
    const id = m[1] ?? m[2] ?? '';
    if (definidos.has(id)) idsReferenciados.add(id);
  }
  return {
    viewBox: raiz ? atributo(raiz[1] ?? '', 'viewBox') : null,
    ids,
    idsGrupo,
    hijosRaiz,
    idsReferenciados: [...idsReferenciados],
    bytes: new TextEncoder().encode(svg).length,
  };
}

function normalizarViewBox(texto: string): string {
  return texto
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .join(' ');
}

/** Comprueba que las etiquetas abren y cierran en orden (detecta archivos truncados). */
function problemaDeEtiquetas(limpio: string): string | null {
  const pila: string[] = [];
  for (const m of limpio.matchAll(ETIQUETA)) {
    const nombre = (m[2] ?? '').toLowerCase();
    if (m[4] === '/') continue;
    if (m[1] === '/') {
      const abierta = pila.pop();
      if (abierta !== nombre) {
        return `Etiquetas mal anidadas: se cierra </${nombre}> pero estaba abierta <${abierta ?? 'ninguna'}>.`;
      }
    } else {
      pila.push(nombre);
    }
  }
  return pila.length > 0 ? `Etiqueta sin cerrar: <${pila[pila.length - 1]}>.` : null;
}

export interface OpcionesValidacionSvg {
  /** `viewBox` declarado en content.json: debe coincidir con el del archivo. */
  viewBox?: string;
  /** Ids de capas que deben existir como `<g id="...">` (en cualquier nivel del dibujo). */
  capas?: readonly string[];
  /**
   * Ids de grupos que deben ser hijos DIRECTOS de la raíz `<svg>`; además, el dibujo no puede
   * tener formas sueltas en la raíz. Es la convención de las animaciones: `visibles` y
   * `resaltadas` de cada paso solo controlan los `<g id>` de primer nivel.
   */
  gruposRaiz?: readonly string[];
}

/** Etiquetas que pueden estar en la raíz de un SVG de animación sin ser un grupo del dibujo. */
const ETIQUETAS_RAIZ_NEUTRAS: readonly string[] = [
  'g',
  'defs',
  'title',
  'desc',
  'metadata',
  'sodipodi:namedview',
];

/** ¿Alguna etiqueta de apertura trae un atributo `on*=`? Se mira solo dentro de las etiquetas. */
function tieneManejadorDeEventos(limpio: string): boolean {
  for (const m of limpio.matchAll(ETIQUETA)) {
    if (m[1] === '/') continue;
    // Sin los valores entre comillas: `id="onda=3"` no es un atributo. Lo que queda son los
    // nombres de atributo, y `on...=` puede ir tras un espacio, una comilla o una barra.
    const soloNombres = (m[3] ?? '').replace(/"[^"]*"|'[^']*'/g, '""');
    if (/(?:^|[\s"'/])on[a-z]+\s*=/i.test(soloNombres)) return true;
  }
  return false;
}

/** Problemas del SVG (lista vacía si es válido). */
export function problemasSvg(svg: string, opciones: OpcionesValidacionSvg = {}): string[] {
  const problemas: string[] = [];
  const info = analizarSvg(svg);
  if (info.bytes > SVG_MAX_BYTES) {
    problemas.push(
      `Pesa ${(info.bytes / 1024).toFixed(0)} KB; el máximo es ${SVG_MAX_BYTES / 1024} KB (se carga en móvil).`,
    );
  }
  // Antes de <svg> puede haber prólogo XML, comentarios y un DOCTYPE (este último se rechaza
  // más abajo con su propio mensaje: los exportadores de Illustrator e Inkscape lo añaden).
  if (!/^\s*(?:<\?xml[^>]*\?>\s*|<!--[\s\S]*?-->\s*|<![A-Z][^>]*>\s*)*<svg[\s>]/i.test(svg)) {
    problemas.push('No empieza con una etiqueta <svg>.');
    return problemas;
  }
  // Lo que está dentro de un comentario no se dibuja ni se ejecuta: no se revisa.
  const limpio = sinComentarios(svg);
  for (const { patron, motivo } of ELEMENTOS_PROHIBIDOS) {
    if (patron.test(limpio)) problemas.push(`No permitido: ${motivo}.`);
  }
  for (const m of limpio.matchAll(/(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const destino = m[1] ?? m[2] ?? '';
    if (!destino.startsWith('#')) {
      problemas.push(`Referencia externa no permitida: href="${destino}" (solo "#id").`);
    }
  }
  for (const m of limpio.matchAll(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi)) {
    if (!(m[2] ?? '').startsWith('#')) {
      problemas.push(`Referencia externa no permitida: url(${m[2] ?? ''}) (solo "url(#id)").`);
    }
  }
  if (tieneManejadorDeEventos(limpio)) {
    problemas.push('No permitido: contiene un manejador de eventos on*= en una etiqueta.');
  }
  const etiquetas = problemaDeEtiquetas(limpio);
  if (etiquetas) problemas.push(etiquetas);

  if (info.viewBox === null) {
    problemas.push('La etiqueta <svg> no tiene atributo viewBox.');
  } else if (opciones.viewBox !== undefined) {
    if (normalizarViewBox(info.viewBox) !== normalizarViewBox(opciones.viewBox)) {
      problemas.push(
        `El viewBox del archivo ("${info.viewBox}") no coincide con el de content.json ("${opciones.viewBox}").`,
      );
    }
  }

  const vistos = new Set<string>();
  for (const id of info.ids) {
    if (vistos.has(id)) problemas.push(`Id repetido dentro del archivo: "${id}".`);
    vistos.add(id);
  }
  const grupos = new Set(info.idsGrupo);
  for (const capa of opciones.capas ?? []) {
    if (grupos.has(capa)) continue;
    problemas.push(
      vistos.has(capa)
        ? `El id "${capa}" existe pero no está en un <g>: cada capa debe ser un <g id="${capa}">.`
        : `Falta la capa <g id="${capa}"> en el SVG.`,
    );
  }
  for (const grupo of opciones.gruposRaiz ?? []) {
    if (info.hijosRaiz.some((h) => h.etiqueta === 'g' && h.id === grupo)) continue;
    problemas.push(
      grupos.has(grupo)
        ? `El grupo "${grupo}" existe pero no es hijo directo de <svg>: en una animación cada paso muestra u oculta solo los <g id> de primer nivel (saca "${grupo}" de su grupo contenedor).`
        : `Falta el grupo <g id="${grupo}"> como hijo directo de <svg>.`,
    );
  }
  if (opciones.gruposRaiz !== undefined) {
    const sueltas = info.hijosRaiz.filter((h) => !ETIQUETAS_RAIZ_NEUTRAS.includes(h.etiqueta));
    if (sueltas.length > 0) {
      const nombres = [...new Set(sueltas.map((h) => `<${h.etiqueta}>`))].join(', ');
      problemas.push(
        `Hay formas sueltas en la raíz de <svg> (${nombres}): en una animación todo el dibujo va dentro de un <g id>, para poder mostrarlo u ocultarlo.`,
      );
    }
  }
  return problemas;
}

/* -------------------------------------------------------------------------------------------
 * Auditoría de los recursos de un módulo
 * ----------------------------------------------------------------------------------------- */

export interface DependenciasAuditoria {
  /** Contenido del SVG en `public/` o `undefined` si el archivo no existe. */
  leerSvg: (ruta: string) => string | undefined;
  /** ¿Existe el archivo (cualquier tipo) en `public/`? */
  existe: (ruta: string) => boolean;
}

export interface ProblemaRecurso {
  ruta: string;
  /** Id de la actividad o del bloque que usa el recurso. */
  usadoPor: string;
  mensaje: string;
}

/**
 * Ids de SVG que la actividad pide encontrar: las capas de un multicapa (en cualquier nivel) o
 * los grupos de primer nivel que controlan los pasos de una animación.
 */
function idsEsperados(
  modulo: ConSecciones,
  recurso: RecursoReferenciado,
): Pick<OpcionesValidacionSvg, 'capas' | 'gruposRaiz'> {
  for (const seccion of modulo.secciones) {
    for (const bloque of seccion.bloques) {
      if (bloque.tipo !== 'actividad' || bloque.actividad.id !== recurso.usadoPor) continue;
      const a = bloque.actividad;
      if (a.tipo === 'multicapa') return { capas: a.config.capas.map((c) => c.id) };
      if (a.tipo === 'video-texto' && a.config.medio === 'animacion') {
        return {
          gruposRaiz: [...new Set(a.config.pasos.flatMap((p) => [...p.visibles, ...p.resaltadas]))],
        };
      }
    }
  }
  return {};
}

function viewBoxDeclarado(modulo: ConSecciones, recurso: RecursoReferenciado): string | undefined {
  for (const seccion of modulo.secciones) {
    for (const bloque of seccion.bloques) {
      if (bloque.tipo !== 'actividad' || bloque.actividad.id !== recurso.usadoPor) continue;
      const a = bloque.actividad;
      if (a.tipo === 'multicapa') return a.config.viewBox;
      if (a.tipo === 'arrastre-molecular') return a.config.escena.viewBox;
      if (a.tipo === 'video-texto' && a.config.medio === 'animacion') return a.config.viewBox;
    }
  }
  return undefined;
}

/**
 * Comprueba los archivos que el módulo referencia: existen; los SVG cumplen `problemasSvg`
 * (con el viewBox y las capas que declara la actividad); y ningún id se repite entre los SVG
 * inline del módulo. Devuelve la lista de problemas (vacía si todo está bien).
 */
export function auditarRecursos(
  modulo: ConSecciones,
  dependencias: DependenciasAuditoria,
): ProblemaRecurso[] {
  const problemas: ProblemaRecurso[] = [];
  const idsPorArchivo = new Map<string, Set<string>>();

  for (const recurso of recolectarRecursos(modulo)) {
    const { ruta, usadoPor } = recurso;
    const esSvg = ruta.endsWith('.svg');
    if (!esSvg) {
      if (!dependencias.existe(ruta)) {
        problemas.push({ ruta, usadoPor, mensaje: 'El archivo no existe en apps/web/public.' });
      }
      continue;
    }
    const svg = dependencias.leerSvg(ruta);
    if (svg === undefined) {
      problemas.push({ ruta, usadoPor, mensaje: 'El archivo no existe en apps/web/public.' });
      continue;
    }
    const opciones: OpcionesValidacionSvg =
      recurso.tipo === 'svg_inline'
        ? { viewBox: viewBoxDeclarado(modulo, recurso), ...idsEsperados(modulo, recurso) }
        : {};
    for (const mensaje of problemasSvg(svg, opciones)) {
      problemas.push({ ruta, usadoPor, mensaje });
    }
    if (recurso.tipo === 'svg_inline' && !idsPorArchivo.has(ruta)) {
      // Solo cuentan los ids que algo referencia (degradados, máscaras, `<use>`): los que
      // generan Inkscape o Illustrator (`svg5`, `defs2`, `layer1`) y nadie usa no chocan.
      idsPorArchivo.set(ruta, new Set(analizarSvg(svg).idsReferenciados));
    }
  }

  const propietario = new Map<string, string>();
  for (const [ruta, ids] of idsPorArchivo) {
    for (const id of ids) {
      const otro = propietario.get(id);
      if (otro !== undefined && otro !== ruta) {
        problemas.push({
          ruta,
          usadoPor: '',
          mensaje: `El id "${id}", que el dibujo referencia con url(#..) o href, también está definido en ${otro}: los SVG inline de un módulo no pueden compartir ids referenciados (prefija los auxiliares, por ejemplo "aux_hueso_degradado").`,
        });
      } else {
        propietario.set(id, ruta);
      }
    }
  }
  return problemas;
}
