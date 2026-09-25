import { describe, expect, it } from 'vitest';
import {
  alcanceDeId,
  buscarActividad,
  contarActividadesPorTipo,
  esBloqueActividad,
  idDeBloque,
  buscarEstructura,
  claveEstructura,
  indiceEstructuras,
  indiceMoleculas,
  listarActividades,
  listarActividadesObligatorias,
  recolectarIds,
  recolectarRecursos,
  recorrerCadenas,
  rutaLegible,
} from './consultas';
import type { TipoId } from './consultas';
import { muestra, validar } from './__fixtures__/utiles';

const modulo = validar(muestra()).modulo!;

describe('actividades', () => {
  it('listarActividades sigue el orden del módulo y trae su sección y su posición', () => {
    const lista = listarActividades(modulo);
    expect(lista.map((u) => u.actividad.id)).toEqual([
      'm1_capas_hueso',
      'm1_celulas_funciones',
      'm1_animacion_remodelado',
      'm1_senales_remodelado',
      'm1_explora_mandibula',
      'm1_explora_celulas',
      'm1_identifica_celulas',
      'm1_quiz_repaso',
      'm1_video_docente',
    ]);
    const relacion = lista[1]!;
    expect(relacion.seccion.id).toBe('funciones');
    expect(relacion.indiceSeccion).toBe(1);
    expect(modulo.secciones[1]!.bloques[relacion.indiceBloque]).toEqual({
      tipo: 'actividad',
      actividad: relacion.actividad,
    });
  });

  it('obligatorias, búsqueda por id y conteo por tipo', () => {
    expect(listarActividadesObligatorias(modulo)).toHaveLength(7);
    expect(buscarActividad(modulo, 'm1_quiz_repaso')?.actividad.tipo).toBe('quiz');
    expect(buscarActividad(modulo, 'no_existe')).toBeUndefined();
    expect(contarActividadesPorTipo(modulo)).toEqual({
      multicapa: 2,
      'arrastre-molecular': 1,
      'relacion-columnas': 1,
      quiz: 1,
      'video-texto': 2,
      'exploracion-3d': 2,
    });
  });

  it('esBloqueActividad distingue los bloques', () => {
    const tipos = modulo.secciones.flatMap((s) => s.bloques.map((b) => esBloqueActividad(b)));
    expect(tipos.filter(Boolean)).toHaveLength(9);
  });
});

describe('idDeBloque', () => {
  it('es el id del bloque o el de su actividad, y es único en toda la sección', () => {
    for (const seccion of modulo.secciones) {
      const ids = seccion.bloques.map((b) => idDeBloque(b));
      expect(new Set(ids).size).toBe(ids.length);
      seccion.bloques.forEach((bloque, i) => {
        expect(ids[i]).toBe(bloque.tipo === 'actividad' ? bloque.actividad.id : bloque.id);
      });
    }
    expect(idDeBloque(modulo.secciones[0]!.bloques[0]!)).toBe('t_tejido_vivo');
    expect(idDeBloque(modulo.secciones[0]!.bloques[3]!)).toBe('m1_capas_hueso');
  });
});

describe('recolectarIds', () => {
  const ids = recolectarIds(modulo);

  it('recoge todos los ids que deben ser únicos, con su tipo', () => {
    const porTipo = new Map<TipoId, number>();
    for (const e of ids) porTipo.set(e.tipo, (porTipo.get(e.tipo) ?? 0) + 1);
    expect(Object.fromEntries(porTipo)).toEqual({
      seccion: 4,
      bloque: 9,
      actividad: 9,
      capa: 7,
      nodo: 8,
      opcion: 11,
      par: 6,
      pregunta: 5,
      molecula: 3,
      receptor: 2,
      elemento: 9,
      paso: 8,
    });
  });

  it('cada id dice a qué actividad pertenece y su alcance de unicidad', () => {
    const porId = new Map(ids.map((e) => [`${e.tipo}:${e.id}`, e]));
    expect(porId.get('seccion:tejido_dinamico')?.actividadId).toBeUndefined();
    expect(porId.get('bloque:t_tejido_vivo')?.actividadId).toBeUndefined();
    expect(porId.get('actividad:m1_capas_hueso')?.actividadId).toBe('m1_capas_hueso');
    expect(porId.get('capa:capa_periostio')?.actividadId).toBe('m1_capas_hueso');
    expect(porId.get('nodo:condilo')?.actividadId).toBe('m1_explora_mandibula');
    expect(porId.get('opcion:qr_p1_a')?.actividadId).toBe('m1_quiz_repaso');
    for (const tipo of [
      'seccion',
      'bloque',
      'actividad',
      'capa',
      'molecula',
      'pregunta',
    ] as const) {
      expect(alcanceDeId(tipo), tipo).toBe('modulo');
    }
    for (const tipo of ['nodo', 'opcion', 'par', 'receptor', 'elemento', 'paso'] as const) {
      expect(alcanceDeId(tipo), tipo).toBe('actividad');
    }
  });

  it('no incluye los ids del glosario ni de las referencias (tienen su propio espacio)', () => {
    const porId = new Map(ids.map((e) => [e.id, e.tipo]));
    // Términos que solo están en el glosario: no aparecen.
    expect(porId.has('matriz_osea')).toBe(false);
    expect(porId.has('periostio')).toBe(false);
    expect(porId.has('ref_junqueira')).toBe(false);
    // Términos que además son nodos 3D: aparecen solo por el nodo.
    expect(porId.get('osteoblasto')).toBe('nodo');
    expect(porId.get('osteoclasto')).toBe('nodo');
  });

  it('en la muestra ningún id se repite', () => {
    const vistos = ids.map((e) => e.id);
    expect(new Set(vistos).size).toBe(vistos.length);
  });

  it('la ruta de cada entrada apunta al campo id', () => {
    for (const entrada of ids) {
      let actual: unknown = modulo;
      for (const paso of entrada.ruta) actual = (actual as Record<string | number, unknown>)[paso];
      expect(actual, rutaLegible(entrada.ruta)).toBe(entrada.id);
    }
  });
});

describe('recolectarRecursos', () => {
  it('lista los archivos de public/ con su tipo y quién los usa', () => {
    const recursos = recolectarRecursos(modulo);
    expect(recursos.map((r) => [r.ruta, r.tipo, r.usadoPor])).toEqual([
      ['/images/m1/hueso_capas.svg', 'imagen', 'i_capas_hueso'],
      ['/images/m1/hueso_capas.svg', 'svg_inline', 'm1_capas_hueso'],
      ['/images/m1/remodelado_pasos.svg', 'svg_inline', 'm1_animacion_remodelado'],
      ['/images/m1/membrana_celular.svg', 'svg_inline', 'm1_senales_remodelado'],
      ['/images/m1/celulas_histologia.svg', 'svg_inline', 'm1_identifica_celulas'],
      ['/videos/m1/introduccion_hueso.mp4', 'video', 'm1_video_docente'],
      ['/images/m1/hueso_capas.svg', 'imagen', 'm1_video_docente'],
      ['/videos/m1/introduccion_hueso.es.vtt', 'subtitulo', 'm1_video_docente'],
    ]);
  });
});

describe('índices para el mentor', () => {
  it('indiceEstructuras une capas y nodos por id, con su actividad y sección', () => {
    const indice = indiceEstructuras(modulo);
    expect(indice.size).toBe(15);
    expect(indice.get(claveEstructura('m1_capas_hueso', 'capa_periostio'))).toMatchObject({
      etiqueta: 'Periostio',
      origen: 'capa',
      actividadId: 'm1_capas_hueso',
      seccionId: 'tejido_dinamico',
    });
    expect(indice.get(claveEstructura('m1_explora_mandibula', 'condilo'))).toMatchObject({
      origen: 'nodo',
      actividadId: 'm1_explora_mandibula',
      seccionId: 'celulas_y_senales',
    });
    expect(indice.get('inexistente')).toBeUndefined();
    // Sin la actividad no hay clave: un nodo puede repetirse entre actividades.
    expect(indice.get('condilo')).toBeUndefined();
    expect(buscarEstructura(indice, 'm1_explora_mandibula', 'condilo')?.origen).toBe('nodo');
    expect(buscarEstructura(indice, 'm1_capas_hueso', 'condilo')).toBeUndefined();
  });

  it('indiceMoleculas', () => {
    const indice = indiceMoleculas(modulo);
    expect([...indice.keys()]).toEqual(['mol_rankl', 'mol_pth', 'mol_opg']);
    expect(indice.get('mol_pth')).toMatchObject({
      etiqueta: 'PTH',
      actividadId: 'm1_senales_remodelado',
    });
  });
});

describe('recorrerCadenas y rutaLegible', () => {
  it('visita cada cadena con su ruta, a cualquier profundidad', () => {
    const visitadas: [string, string][] = [];
    recorrerCadenas({ a: 'uno', b: [{ c: 'dos' }, 3, null], d: { e: ['tres'] } }, [], (t, ruta) =>
      visitadas.push([t, rutaLegible(ruta)]),
    );
    expect(visitadas).toEqual([
      ['uno', 'a'],
      ['dos', 'b[0].c'],
      ['tres', 'd.e[0]'],
    ]);
  });

  it('rutaLegible', () => {
    expect(rutaLegible([])).toBe('(raíz del módulo)');
    expect(rutaLegible(['secciones', 0, 'bloques', 2, 'actividad', 'config'])).toBe(
      'secciones[0].bloques[2].actividad.config',
    );
    expect(rutaLegible([0, 'a'])).toBe('[0].a');
  });
});
