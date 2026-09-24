import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { progresoDePrueba, respuestaError, respuestaJson } from '@/test/utils';
import { useProgresoStore } from './progreso';

const fetchMock = vi.fn<typeof fetch>();

const catalogoApi = {
  logros: [
    {
      codigo: 'primer_hueso',
      nombre: 'Primer hueso',
      descripcion: 'Completaste el módulo 1',
      obtenido: true,
      obtenido_en: '2026-09-23T20:00:00Z',
    },
    {
      codigo: 'celula_por_celula',
      nombre: 'Célula por célula',
      descripcion: 'Completaste el módulo 2',
      obtenido: false,
      obtenido_en: null,
    },
  ],
};

/** Enruta por URL: cada llamada devuelve una Response nueva. */
function simularApi(rutas: Record<string, () => Response>): void {
  fetchMock.mockImplementation((entrada) => {
    const url = String(entrada);
    const respuesta = rutas[url];
    return respuesta ? Promise.resolve(respuesta()) : Promise.reject(new TypeError('sin red'));
  });
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('store progreso: estado inicial', () => {
  it('trae 6 módulos sin completar, 0 puntos y el catálogo de respaldo', () => {
    const p = useProgresoStore();
    expect(p.modulos).toHaveLength(6);
    expect(p.modulos.map((m) => m.modulo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p.puntajeTotal).toBe(0);
    expect(p.logros).toEqual([]);
    expect(p.modulosCompletados).toEqual([]);
    expect(p.catalogoLogros.map((l) => l.codigo)).toEqual([
      'primer_hueso',
      'celula_por_celula',
      'constructor',
      'mineralizador',
      'remodelador',
      'cronista',
    ]);
    expect(p.siguienteLogro?.codigo).toBe('primer_hueso');
  });
});

describe('store progreso: load', () => {
  it('carga progreso y logros con el token y calcula los derivados', async () => {
    useAuthStore().token = 'tok';
    simularApi({
      '/api/progress': () =>
        respuestaJson(200, progresoDePrueba([1, 2], 180, ['primer_hueso', 'celula_por_celula'])),
      '/api/achievements': () => respuestaJson(200, catalogoApi),
    });
    const p = useProgresoStore();

    await p.load();

    expect(p.loaded).toBe(true);
    expect(p.loading).toBe(false);
    expect(p.error).toBeNull();
    expect(p.puntajeTotal).toBe(180);
    expect(p.modulosCompletados).toEqual([1, 2]);
    expect(p.estaCompletado(2)).toBe(true);
    expect(p.estaCompletado(3)).toBe(false);
    expect(p.logros).toEqual(['primer_hueso', 'celula_por_celula']);
    expect(p.catalogoLogros).toHaveLength(2);
    // Con ambos logros del catálogo obtenidos no queda ninguno pendiente.
    expect(p.siguienteLogro).toBeNull();
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
    }
  });

  it('no duplica peticiones: llamadas simultáneas y posteriores comparten la carga', async () => {
    useAuthStore().token = 'tok';
    simularApi({
      '/api/progress': () => respuestaJson(200, progresoDePrueba()),
      '/api/achievements': () => respuestaJson(200, catalogoApi),
    });
    const p = useProgresoStore();

    await Promise.all([p.load(), p.load(), p.load()]);
    await p.load();

    expect(fetchMock).toHaveBeenCalledTimes(2); // progress + achievements, una sola vez

    await p.load({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('degrada con gracia si /api/progress falla: conserva los valores por defecto y expone error', async () => {
    useAuthStore().token = 'tok';
    simularApi({
      '/api/progress': () => respuestaError(500, 'error_interno'),
      '/api/achievements': () => respuestaJson(200, catalogoApi),
    });
    const p = useProgresoStore();

    await expect(p.load()).resolves.toBeUndefined(); // nunca rechaza

    expect(p.error).toMatch(/No pudimos cargar tu progreso/);
    expect(p.loaded).toBe(false);
    expect(p.loading).toBe(false);
    expect(p.modulos).toHaveLength(6);
    expect(p.puntajeTotal).toBe(0);
  });

  it('con la red caída no lanza y deja el aviso; un reintento posterior puede recuperarse', async () => {
    useAuthStore().token = 'tok';
    simularApi({});
    const p = useProgresoStore();
    await p.load();
    expect(p.error).not.toBeNull();

    simularApi({
      '/api/progress': () => respuestaJson(200, progresoDePrueba([], 50)),
      '/api/achievements': () => respuestaJson(200, catalogoApi),
    });
    await p.load();
    expect(p.error).toBeNull();
    expect(p.puntajeTotal).toBe(50);
  });

  it('si solo falla el catálogo se conserva el de respaldo y no hay aviso', async () => {
    useAuthStore().token = 'tok';
    simularApi({
      '/api/progress': () => respuestaJson(200, progresoDePrueba([], 10, ['primer_hueso'])),
      '/api/achievements': () => respuestaError(500, 'error_interno'),
    });
    const p = useProgresoStore();
    await p.load();
    expect(p.error).toBeNull();
    expect(p.catalogoLogros).toHaveLength(6);
    expect(p.siguienteLogro?.codigo).toBe('celula_por_celula');
  });

  it('completa los módulos que falten si la API devolviera menos de 6', async () => {
    useAuthStore().token = 'tok';
    simularApi({
      '/api/progress': () =>
        respuestaJson(200, {
          modulos: [progresoDePrueba([4]).modulos[3]],
          puntaje_total: 5,
          logros: [],
        }),
      '/api/achievements': () => respuestaJson(200, catalogoApi),
    });
    const p = useProgresoStore();
    await p.load();
    expect(p.modulos).toHaveLength(6);
    expect(p.modulosCompletados).toEqual([4]);
  });

  it('sin token (modo de desarrollo sin backend) no llama a la API ni marca error', async () => {
    const p = useProgresoStore();
    await p.load();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(p.error).toBeNull();
    expect(p.loaded).toBe(false);
  });

  it('una carga que termina después de reset() no escribe datos del estudiante anterior', async () => {
    useAuthStore().token = 'tok';
    let liberar!: () => void;
    const compuerta = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    fetchMock.mockImplementation(async (entrada) => {
      await compuerta;
      return String(entrada).endsWith('/progress')
        ? respuestaJson(200, progresoDePrueba([1], 999))
        : respuestaJson(200, catalogoApi);
    });
    const p = useProgresoStore();

    const carga = p.load();
    p.reset(); // el estudiante cerró sesión mientras cargaba
    liberar();
    await carga;

    expect(p.puntajeTotal).toBe(0);
    expect(p.modulosCompletados).toEqual([]);
    expect(p.loaded).toBe(false);
  });
});

describe('store progreso: siguienteLogro y reset', () => {
  it('siguienteLogro es el primero del catálogo no obtenido', () => {
    const p = useProgresoStore();
    p.logros = ['primer_hueso', 'celula_por_celula'];
    expect(p.siguienteLogro?.codigo).toBe('constructor');
    p.logros = p.catalogoLogros.map((l) => l.codigo);
    expect(p.siguienteLogro).toBeNull();
  });

  it('reset restaura los valores iniciales', () => {
    const p = useProgresoStore();
    p.puntajeTotal = 100;
    p.logros = ['primer_hueso'];
    p.modulos[0]!.completado = true;
    p.error = 'x';
    p.reset();
    expect(p.puntajeTotal).toBe(0);
    expect(p.logros).toEqual([]);
    expect(p.modulosCompletados).toEqual([]);
    expect(p.error).toBeNull();
  });
});
