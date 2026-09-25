/**
 * Utilidades de las pruebas del contenido: clonar el módulo de muestra, modificarlo por ruta y
 * validarlo. Solo se importan desde archivos .test.ts (no entran al build).
 */
import { formatearErrores } from '../errores';
import { ModuloContenidoSchema } from '../schema';
import type { ModuloContenido } from '../schema';
import muestraJson from './modulo_muestra.json';

export type Ruta = readonly (string | number)[];
type Objeto = Record<string | number, unknown>;

/** Copia profunda del módulo de muestra, lista para modificar. */
export function muestra(): Record<string, unknown> {
  return structuredClone(muestraJson) as unknown as Record<string, unknown>;
}

function padreDe(datos: unknown, ruta: Ruta): Objeto {
  let actual = datos as Objeto;
  for (const paso of ruta.slice(0, -1)) {
    const siguiente = actual[paso];
    if (typeof siguiente !== 'object' || siguiente === null) {
      throw new Error(`La ruta ${ruta.join('.')} no existe (falla en "${String(paso)}").`);
    }
    actual = siguiente as Objeto;
  }
  return actual;
}

/** Lee el valor en la ruta. */
export function leer(datos: unknown, ruta: Ruta): unknown {
  return ruta.length === 0 ? datos : padreDe(datos, ruta)[ruta[ruta.length - 1] as string | number];
}

/** Fija el valor en la ruta (crea o reemplaza el campo). */
export function fijar(datos: unknown, ruta: Ruta, valor: unknown): void {
  padreDe(datos, ruta)[ruta[ruta.length - 1] as string | number] = valor;
}

/** Elimina el campo de un objeto o el elemento de una lista. */
export function borrar(datos: unknown, ruta: Ruta): void {
  const padre = padreDe(datos, ruta);
  const ultimo = ruta[ruta.length - 1] as string | number;
  if (Array.isArray(padre)) padre.splice(Number(ultimo), 1);
  else delete padre[ultimo];
}

/** Añade un elemento al final de la lista que hay en la ruta. */
export function agregarA(datos: unknown, ruta: Ruta, elemento: unknown): void {
  (leer(datos, ruta) as unknown[]).push(elemento);
}

/** Ruta al objeto `actividad` con ese id. */
export function rutaActividad(datos: unknown, id: string): (string | number)[] {
  const secciones = (datos as { secciones: { bloques: { actividad?: { id: string } }[] }[] })
    .secciones;
  for (let s = 0; s < secciones.length; s++) {
    const bloques = secciones[s]?.bloques ?? [];
    for (let b = 0; b < bloques.length; b++) {
      if (bloques[b]?.actividad?.id === id) return ['secciones', s, 'bloques', b, 'actividad'];
    }
  }
  throw new Error(`No hay una actividad con id ${id}.`);
}

/** Ruta al bloque (no actividad) con ese id. */
export function rutaBloque(datos: unknown, id: string): (string | number)[] {
  const secciones = (datos as { secciones: { bloques: { id?: string }[] }[] }).secciones;
  for (let s = 0; s < secciones.length; s++) {
    const bloques = secciones[s]?.bloques ?? [];
    for (let b = 0; b < bloques.length; b++) {
      if (bloques[b]?.id === id) return ['secciones', s, 'bloques', b];
    }
  }
  throw new Error(`No hay un bloque con id ${id}.`);
}

export interface ResultadoValidacion {
  ok: boolean;
  /** `ruta.con.puntos: mensaje` tal como los da zod (las rutas son índices, sin ids). */
  issues: string[];
  /** Líneas legibles de formatearErrores. */
  errores: string[];
  modulo?: ModuloContenido;
}

export function validar(datos: unknown): ResultadoValidacion {
  const resultado = ModuloContenidoSchema.safeParse(datos);
  if (resultado.success) return { ok: true, issues: [], errores: [], modulo: resultado.data };
  return {
    ok: false,
    issues: resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    errores: formatearErrores(resultado.error, datos),
  };
}

/** Módulo de muestra tras aplicar los cambios, validado. */
export function validarCon(...cambios: ((datos: Record<string, unknown>) => void)[]) {
  const datos = muestra();
  for (const cambio of cambios) cambio(datos);
  return validar(datos);
}
