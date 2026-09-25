/**
 * Utilidades SOLO para las pruebas de la actividad multicapa: actividades de muestra del módulo de
 * pruebas, un generador de actividades adversariales con su SVG y un `fetch` simulado.
 */
import { vi } from 'vitest';
import { listarActividades } from '@/content/consultas';
import type { ActividadMulticapa } from '@/content/schema';
import { muestra, validar } from '@/content/__fixtures__/utiles';
import huesoCapas from '@/content/__fixtures__/svg/hueso_capas.svg?raw';
import celulasHistologia from '@/content/__fixtures__/svg/celulas_histologia.svg?raw';

export const SVG_HUESO = huesoCapas;
export const SVG_CELULAS = celulasHistologia;

export function clonar<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

function deMuestra(id: string): ActividadMulticapa {
  const modulo = validar(muestra()).modulo!;
  const encontrada = listarActividades(modulo).find((u) => u.actividad.id === id);
  if (!encontrada) throw new Error(`No hay la actividad ${id} en el módulo de muestra`);
  return clonar(encontrada.actividad as ActividadMulticapa);
}

/** `explorar`: 4 capas, 3 requeridas. */
export const explorarDeMuestra = (): ActividadMulticapa => deMuestra('m1_capas_hueso');
/** `identificar`: 3 capas, 4 consignas (el osteoclasto trae una `pistas_extra`). */
export const identificarDeMuestra = (): ActividadMulticapa => deMuestra('m1_identifica_celulas');

/** Escapa un texto para usarlo como valor de atributo XML. */
export function escaparAtributo(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface OpcionesGenerador {
  modo?: 'explorar' | 'identificar';
  ids?: string[];
  requeridas?: string[];
  etiqueta?: (i: number) => string;
  descripcion?: (i: number) => string;
  pista?: (i: number) => string;
  id?: string;
}

/**
 * Actividad y SVG coherentes entre sí. Cada capa es un `<g id>` con un círculo relleno en su
 * propia fila: no se superponen.
 */
export function generar(
  n: number,
  opciones: OpcionesGenerador = {},
): {
  actividad: ActividadMulticapa;
  svg: string;
} {
  const ids = opciones.ids ?? Array.from({ length: n }, (_, i) => `capa_${i + 1}`);
  const modo = opciones.modo ?? 'explorar';
  const requeridas = opciones.requeridas ?? ids;
  const capas = ids.map((id, i) => ({
    id,
    etiqueta: opciones.etiqueta?.(i) ?? `Estructura ${i + 1}`,
    descripcion: opciones.descripcion?.(i) ?? `Descripción de la estructura número ${i + 1}.`,
    ...(modo === 'identificar'
      ? { pista: opciones.pista?.(i) ?? `Encuentra la estructura número ${i + 1}.` }
      : {}),
  }));
  const formas = ids
    .map(
      (id, i) =>
        `<g id="${escaparAtributo(id)}"><circle cx="40" cy="${40 + i * 60}" r="20" fill="#c0503a"/></g>`,
    )
    .join('');
  const alto = 40 + ids.length * 60;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 ${alto}">${formas}</svg>`;
  const actividad = {
    id: opciones.id ?? 'm1_generada',
    tipo: 'multicapa',
    titulo: 'Actividad generada',
    instrucciones: 'Toca las capas del dibujo.',
    obligatoria: true,
    puntaje_max: 30,
    penalizacion: { por_intento: 0.1, piso: 0.5 },
    retroalimentacion: { correcta: 'Bien hecho.' },
    concepto: 'Prueba',
    config: {
      svg: '/images/m1/generada.svg',
      viewBox: `0 0 800 ${alto}`,
      alt: 'Dibujo generado para las pruebas de la actividad.',
      modo,
      capas,
      requeridas,
    },
  } as unknown as ActividadMulticapa;
  return { actividad, svg };
}

export interface RespuestaSimulada {
  estado?: number;
  cuerpo?: string;
  /** Si es verdadero, `fetch` rechaza (sin red). */
  sinRed?: boolean;
  /** Si es verdadero, la respuesta nunca llega (salvo que se aborte la solicitud). */
  colgada?: boolean;
}

/** Sustituye `fetch` por un simulado. `responder` recibe la URL y decide la respuesta. */
export function simularFetch(responder: (url: string) => RespuestaSimulada) {
  const señales: (AbortSignal | undefined)[] = [];
  const mock = vi.fn(async (entrada: unknown, init?: { signal?: AbortSignal }) => {
    const url = String(entrada);
    señales.push(init?.signal);
    const r = responder(url);
    if (r.sinRed) throw new TypeError('Failed to fetch');
    if (r.colgada) {
      await new Promise<never>((_, rechazar) => {
        init?.signal?.addEventListener('abort', () =>
          rechazar(new DOMException('abortada', 'AbortError')),
        );
      });
    }
    const estado = r.estado ?? 200;
    return {
      ok: estado >= 200 && estado < 300,
      status: estado,
      text: async () => r.cuerpo ?? '',
    };
  });
  vi.stubGlobal('fetch', mock);
  return { mock, señales };
}
