/**
 * Utilidades de las pruebas de la página de módulo y del store de actividades: una API simulada
 * con `fetch` que registra cada llamada y responde como el backend (docs/api-contract.md). Solo se
 * importa desde archivos .test.ts (no entra al build).
 */
import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { ResultadoActividad } from '@/activities/types';
import { catalogoDeRespaldo } from '@/data/logros';
import { progresoDePrueba, respuestaError, respuestaJson } from '@/test/utils';
import type { ResultadoActividadFila } from '@/types/api';

export interface LlamadaApi {
  metodo: string;
  /** Ruta con la query, sin el prefijo `/api`. */
  ruta: string;
  cuerpo: unknown;
}

export interface OpcionesApi {
  /** Módulos completados según GET /api/progress. */
  completados?: number[];
  /** Filas de GET /api/activities/results. */
  filas?: ResultadoActividadFila[];
  /** `true`: GET /api/activities/results falla como una caída de red. */
  fallaLectura?: boolean;
  puntajeTotal?: number;
  /** Logros nuevos que devuelve el POST de cada actividad. */
  logrosPorActividad?: Record<string, string[]>;
  /** Sustituye la respuesta por defecto; devolver `undefined` deja la de por defecto. */
  responder?: (llamada: LlamadaApi) => Response | Promise<Response> | undefined;
}

export interface ApiSimulada {
  fetch: Mock<typeof fetch>;
  llamadas: LlamadaApi[];
  /** Llamadas de un método y una ruta que empieza por `prefijo`. */
  filtrar: (metodo: string, prefijo: string) => LlamadaApi[];
  opciones: OpcionesApi;
}

export function fila(
  id: string,
  modulo: number,
  parcial: Partial<ResultadoActividadFila> = {},
): ResultadoActividadFila {
  return {
    activity_id: id,
    modulo,
    tipo: 'quiz',
    mejor_puntaje: 10,
    intentos: 1,
    completada: true,
    ultimo_intento_en: '2026-09-24T10:00:00Z',
    ...parcial,
  };
}

export function resultadoDePrueba(
  puntaje: number,
  intentos = 1,
  precision = 1,
): ResultadoActividad {
  return { puntaje, intentos, precision, detalle: {} } as ResultadoActividad;
}

/** Instala una API simulada como `fetch` global. Devuelve el registro de llamadas. */
export function simularApi(opciones: OpcionesApi = {}): ApiSimulada {
  const llamadas: LlamadaApi[] = [];
  const mock = vi.fn<typeof fetch>();

  mock.mockImplementation(async (entrada, init) => {
    const url = String(entrada).replace(/^\/api/, '');
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const cuerpo = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const llamada: LlamadaApi = { metodo, ruta: url, cuerpo };
    llamadas.push(llamada);

    const propia = await opciones.responder?.(llamada);
    if (propia) return propia;

    if (metodo === 'GET' && url === '/progress') {
      return respuestaJson(
        200,
        progresoDePrueba(opciones.completados ?? [], opciones.puntajeTotal ?? 0),
      );
    }
    if (metodo === 'GET' && url === '/achievements')
      return respuestaJson(200, { logros: catalogoDeRespaldo() });
    if (metodo === 'GET' && url.startsWith('/activities/results')) {
      if (opciones.fallaLectura) throw new TypeError('sin red');
      const modulo = Number(new URL(url, 'http://x').searchParams.get('modulo'));
      return respuestaJson(200, {
        resultados: (opciones.filas ?? []).filter((f) => f.modulo === modulo),
      });
    }
    const post = /^\/activities\/([^/]+)\/result$/.exec(url);
    if (metodo === 'POST' && post) {
      const id = decodeURIComponent(post[1] ?? '');
      const c = cuerpo as { modulo: number; tipo: string; puntaje: number; intentos: number };
      return respuestaJson(200, {
        resultado: {
          activity_id: id,
          modulo: c.modulo,
          tipo: c.tipo,
          puntaje: c.puntaje,
          intentos: c.intentos,
          completada: true,
          created_at: '2026-09-24T10:00:00Z',
        },
        puntaje_total: (opciones.puntajeTotal ?? 0) + c.puntaje,
        logros_nuevos: opciones.logrosPorActividad?.[id] ?? [],
      });
    }
    const put = /^\/progress\/(\d)$/.exec(url);
    if (metodo === 'PUT' && put) {
      const modulo = Number(put[1]);
      const c = cuerpo as {
        completado?: boolean;
        seccion_actual?: string;
        tiempo_delta_seg?: number;
      };
      return respuestaJson(200, {
        modulo: {
          modulo,
          seccion_actual: c.seccion_actual ?? null,
          completado: c.completado === true,
          tiempo_total_seg: c.tiempo_delta_seg ?? 0,
          updated_at: '2026-09-24T10:00:00Z',
        },
        logros_nuevos: [],
      });
    }
    return respuestaError(404, 'no_encontrado');
  });

  vi.stubGlobal('fetch', mock);
  return {
    fetch: mock,
    llamadas,
    opciones,
    filtrar: (metodo, prefijo) =>
      llamadas.filter((l) => l.metodo === metodo && l.ruta.startsWith(prefijo)),
  };
}
