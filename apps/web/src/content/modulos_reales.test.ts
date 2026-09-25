/**
 * Red de seguridad para quienes escriben los módulos: recorre TODOS los `content.json` que
 * existan en `src/modules/` y los audita (esquema, carpeta, recursos de `public/`, ids entre
 * módulos). Hoy no hay ninguno y solo corren las comprobaciones generales; en cuanto alguien
 * añada `src/modules/m1_conociendo_el_hueso/content.json`, esta prueba lo valida.
 *
 * Si falla, el mensaje trae una línea por problema con la ruta y el id del elemento. La guía
 * de autoría es docs/content-schema.md.
 */
import { describe, expect, it } from 'vitest';
import { MODULOS } from '@/data/modulos';
import {
  advertenciasDeModulo,
  advertenciasEntreModulos,
  auditarContenidoModulo,
  auditarEntreModulos,
} from './auditoria';
import { listarModulos, rutasNoReconocidas } from './registry';
import type { ModuloContenido } from './schema';
import type { DependenciasAuditoria } from './svg';

const contenidos = import.meta.glob('../modules/*/content.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

// `public/` tal como lo ve el navegador: /images/m1/x.svg  <->  /public/images/m1/x.svg
const svgsPublicos = import.meta.glob('/public/**/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const archivosPublicos = new Set(Object.keys(import.meta.glob('/public/**/*')));

const dependencias: DependenciasAuditoria = {
  leerSvg: (ruta) => svgsPublicos[`/public${ruta}`],
  existe: (ruta) => archivosPublicos.has(`/public${ruta}`),
};

function carpetaDe(ruta: string): string {
  return /modules\/([^/]+)\/content\.json$/.exec(ruta)?.[1] ?? ruta;
}

describe('módulos reales (src/modules/*/content.json)', () => {
  it('cada content.json está en una carpeta m{n}_{slug} con el slug oficial', () => {
    expect(rutasNoReconocidas(), 'Carpetas de módulo con nombre incorrecto').toEqual([]);
    expect(listarModulos()).toHaveLength(Object.keys(contenidos).length);
  });

  it('no hay más de seis módulos y todos son del briefing', () => {
    const numeros = listarModulos().map((m) => m.numero);
    expect(numeros.length).toBeLessThanOrEqual(6);
    for (const n of numeros) expect(MODULOS.some((m) => m.numero === n)).toBe(true);
  });

  for (const [ruta, bruto] of Object.entries(contenidos)) {
    const carpeta = carpetaDe(ruta);
    it(`${carpeta}: esquema, carpeta y recursos`, () => {
      const { problemas } = auditarContenidoModulo(carpeta, bruto, dependencias);
      expect(problemas, `\n - ${problemas.join('\n - ')}\n`).toEqual([]);
    });
  }

  it('los ids de actividad son únicos entre todos los módulos', () => {
    const modulos = Object.entries(contenidos)
      .map(([ruta, bruto]) => auditarContenidoModulo(carpetaDe(ruta), bruto, dependencias).modulo)
      .filter((m): m is ModuloContenido => m !== undefined);
    const problemas = auditarEntreModulos(modulos);
    expect(problemas, `\n - ${problemas.join('\n - ')}\n`).toEqual([]);
  });

  it('advertencias (no fallan): términos sin enlazar, definiciones distintas y pendientes del docente', () => {
    const modulos = Object.entries(contenidos)
      .map(([ruta, bruto]) => auditarContenidoModulo(carpetaDe(ruta), bruto, dependencias).modulo)
      .filter((m): m is ModuloContenido => m !== undefined);
    const advertencias = [
      ...modulos.flatMap((m) => advertenciasDeModulo(m)),
      ...advertenciasEntreModulos(modulos),
    ];
    // Se muestran para que quien escribe el módulo las vea, pero no rompen la prueba.
    if (advertencias.length > 0) {
      console.warn(`\nAdvertencias del contenido:\n - ${advertencias.join('\n - ')}`);
    }
    expect(Array.isArray(advertencias)).toBe(true);
  });
});
