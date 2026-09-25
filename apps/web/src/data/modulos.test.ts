import { describe, expect, it, vi } from 'vitest';
import { BLOQUEO_SECUENCIAL } from '@/config';
import { catalogoDeRespaldo } from './logros';
import { MODULOS, esNumeroModulo, moduloPorNumero } from './modulos';

describe('MODULOS (docs/briefing-pedagogico.md)', () => {
  it('son los 6 módulos del briefing, en orden, con título y foco', () => {
    expect(MODULOS.map((m) => [m.numero, m.titulo, m.foco])).toEqual([
      [1, 'Conociendo el hueso', 'Generalidades, funciones biomecánicas y metabólicas esenciales'],
      [2, 'Descubriendo sus células', 'Origen y procesos de diferenciación celular'],
      [3, 'Construyendo hueso', 'Mecanotransducción y formación ósea'],
      [4, 'Transformando la matriz', 'Mineralización del tejido óseo'],
      [5, 'Renovando el hueso', 'Remodelado, reparación y equilibrio óseo'],
      [6, 'El paso del tiempo', 'Envejecimiento y cambios degenerativos'],
    ]);
  });

  it('los módulos 3, 4 y 5 son de densidad alta y el resto media', () => {
    expect(MODULOS.filter((m) => m.densidad === 'alta').map((m) => m.numero)).toEqual([3, 4, 5]);
  });

  it('los slugs son únicos y están en snake_case', () => {
    const slugs = MODULOS.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(6);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });

  it('cada módulo apunta al logro que otorga (catálogo de Fase 1 del contrato)', () => {
    expect(MODULOS.map((m) => m.logro)).toEqual([
      'primer_hueso',
      'celula_por_celula',
      'constructor',
      'mineralizador',
      'remodelador',
      'cronista',
    ]);
    expect(catalogoDeRespaldo().map((l) => l.codigo)).toEqual(MODULOS.map((m) => m.logro));
    expect(catalogoDeRespaldo()[0]).toMatchObject({
      nombre: 'Primer hueso',
      descripcion: 'Completaste el módulo 1',
      obtenido: false,
    });
  });

  it('moduloPorNumero y esNumeroModulo solo aceptan de 1 a 6', () => {
    expect(moduloPorNumero(3)?.titulo).toBe('Construyendo hueso');
    expect(moduloPorNumero(0)).toBeUndefined();
    expect(moduloPorNumero(7)).toBeUndefined();
    expect([1, 6].every(esNumeroModulo)).toBe(true);
    expect([0, 7, 2.5, '3', null].some(esNumeroModulo)).toBe(false);
  });
});

describe('config', () => {
  it('el bloqueo secuencial está activo por defecto (F2-08)', () => {
    expect(BLOQUEO_SECUENCIAL).toBe(true);
  });

  it('VITE_BLOQUEO_SECUENCIAL=false lo desactiva y cualquier otro valor lo deja activo', async () => {
    vi.stubEnv('VITE_BLOQUEO_SECUENCIAL', 'false');
    vi.resetModules();
    expect((await import('@/config')).BLOQUEO_SECUENCIAL).toBe(false);
    vi.stubEnv('VITE_BLOQUEO_SECUENCIAL', '0');
    vi.resetModules();
    expect((await import('@/config')).BLOQUEO_SECUENCIAL).toBe(true);
  });
});
