import { describe, expect, it } from 'vitest';
import { auditarContenidoModulo, auditarEntreModulos } from './auditoria';
import type { DependenciasAuditoria } from './svg';
import { fijar, muestra, rutaActividad, validar } from './__fixtures__/utiles';

const crudos = import.meta.glob('./__fixtures__/svg/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// public/ simulado con los SVG de la muestra y los archivos del video.
const dependencias: DependenciasAuditoria = {
  leerSvg: (ruta) => crudos[`./__fixtures__/svg/${ruta.split('/').pop()}`],
  existe: (ruta) =>
    crudos[`./__fixtures__/svg/${ruta.split('/').pop()}`] !== undefined ||
    ruta.startsWith('/videos/m1/introduccion_hueso'),
};

const CARPETA = 'm1_conociendo_el_hueso';

describe('auditarContenidoModulo', () => {
  it('el módulo de muestra pasa: esquema, carpeta y recursos', () => {
    const r = auditarContenidoModulo(CARPETA, muestra(), dependencias);
    expect(r.problemas).toEqual([]);
    expect(r.modulo?.numero).toBe(1);
  });

  it('un error de esquema se reporta legible y no sigue con los recursos', () => {
    const roto = muestra();
    fijar(roto, ['duracion_estimada_min'], 0);
    const r = auditarContenidoModulo(CARPETA, roto, dependencias);
    expect(r.modulo).toBeUndefined();
    expect(r.problemas).toEqual(['duracion_estimada_min: Debe ser mayor o igual que 5.']);
  });

  it('la carpeta debe ser m{n}_{slug}', () => {
    const r = auditarContenidoModulo('m1_hueso', muestra(), dependencias);
    expect(r.problemas).toEqual(['La carpeta "m1_hueso" debe llamarse "m1_conociendo_el_hueso".']);
  });

  it('un recurso que falta o incumple las reglas se reporta con quién lo usa', () => {
    const sinArchivos: DependenciasAuditoria = { leerSvg: () => undefined, existe: () => false };
    const r = auditarContenidoModulo(CARPETA, muestra(), sinArchivos);
    expect(r.problemas).toContain(
      'Recurso /images/m1/hueso_capas.svg (usado por m1_capas_hueso): El archivo no existe en apps/web/public.',
    );
    expect(r.problemas).toContain(
      'Recurso /videos/m1/introduccion_hueso.mp4 (usado por m1_video_docente): El archivo no existe en apps/web/public.',
    );

    const capaFalsa = muestra();
    fijar(
      capaFalsa,
      [...rutaActividad(capaFalsa, 'm1_capas_hueso'), 'config', 'requeridas'],
      ['capa_periostio'],
    );
    fijar(
      capaFalsa,
      [...rutaActividad(capaFalsa, 'm1_capas_hueso'), 'config', 'capas', 0, 'id'],
      'capa_periostio_x',
    );
    // La capa "capa_periostio" ya no existe en config: el esquema lo detecta antes que el SVG.
    expect(
      auditarContenidoModulo(CARPETA, capaFalsa, dependencias).problemas.length,
    ).toBeGreaterThan(0);
  });
});

describe('auditarEntreModulos', () => {
  const modulo = validar(muestra()).modulo!;

  it('un solo módulo o módulos distintos no dan problemas', () => {
    expect(auditarEntreModulos([modulo])).toEqual([]);
    expect(auditarEntreModulos([])).toEqual([]);
  });

  it('detecta un módulo repetido y los ids de actividad repetidos entre módulos', () => {
    const problemas = auditarEntreModulos([modulo, modulo]);
    expect(problemas).toContain('El módulo 1 está definido dos veces.');
    expect(problemas).toContain('El id de actividad "m1_quiz_repaso" está en los módulos 1 y 1.');
    expect(problemas).toHaveLength(1 + 9);
  });

  it('un id de actividad de un módulo no puede aparecer en otro', () => {
    const otro = structuredClone(modulo);
    otro.numero = 2;
    otro.slug = 'descubriendo_sus_celulas';
    const problemas = auditarEntreModulos([modulo, otro]);
    expect(problemas).toContain('El id de actividad "m1_capas_hueso" está en los módulos 1 y 2.');
    expect(problemas).not.toContain('El módulo 2 está definido dos veces.');
  });
});
