/**
 * Dónde está cada nodo de la actividad `exploracion-3d` sobre el modelo (lógica pura).
 *
 * Un nodo se coloca de una de tres maneras (docs/content-schema.md, secciones 7.6 y 9):
 *  1. Con `ancla`: punto `{x, y, z}` (0 a 1) de la caja envolvente del modelo. Vale para cualquier
 *     zona, con el modelo provisional de una sola malla y con el GLB definitivo.
 *  2. Sin `ancla` y con el id de una PIEZA del catálogo. El GLB definitivo trae esa pieza como nodo;
 *     el modelo PROVISIONAL (un STL de una sola malla, F1-12) no, así que mientras tanto se usa
 *     `ANCLAS_PROVISIONALES`: una posición aproximada de la pieza sobre esa malla. Desaparece cuando
 *     el GLB de F0-09 exista.
 *  3. El id `mandibula`: el hueso completo.
 * Si un id no se puede ubicar el resultado es `null`: la ficha se muestra igual y la cámara vuelve
 * al encuadre general, sin bloquear la actividad.
 */
import type { AnclaNodo, VistaCamara } from '@/content/nodos3d';
import { RADIO_ZONA_ANCLA } from './vistas';
import type { Vec3 } from './vistas';

/** Caja envolvente del modelo normalizado (esquinas mínima y máxima). */
export interface CajaModelo {
  min: Vec3;
  max: Vec3;
}

/** Lo que la escena necesita de un nodo del contenido. */
export interface NodoUbicable {
  id: string;
  ancla?: AnclaNodo;
  camara: { vista: VistaCamara };
}

export interface UbicacionNodo {
  /** Punto del modelo al que mira la cámara y donde se dibuja la etiqueta. */
  punto: Vec3;
  /** Radio de la zona a encuadrar, en unidades del modelo (radio del modelo entero = 1). */
  radio: number;
  origen: 'ancla' | 'provisional' | 'modelo_completo' | 'nodo_glb';
}

/**
 * Posiciones aproximadas de las piezas de la mandíbula sobre la malla PROVISIONAL, en coordenadas
 * de ancla del lado DERECHO del sujeto (`x` bajo). Se midieron sobre la propia malla
 * (BodyParts3D FJ6399; la prueba `anclas.test.ts` comprueba que cada punto está sobre el hueso).
 * `radio` es el tamaño de la zona en unidades del modelo.
 */
export const ANCLAS_PROVISIONALES: Readonly<Record<string, { ancla: AnclaNodo; radio: number }>> = {
  condilo: { ancla: { x: 0.1, y: 0.95, z: 0.07 }, radio: 0.3 },
  apofisis_coronoides: { ancla: { x: 0.09, y: 0.87, z: 0.5 }, radio: 0.3 },
  rama: { ancla: { x: 0.08, y: 0.62, z: 0.14 }, radio: 0.55 },
  angulo: { ancla: { x: 0.1, y: 0.3, z: 0.2 }, radio: 0.35 },
  cuerpo: { ancla: { x: 0.2, y: 0.3, z: 0.62 }, radio: 0.55 },
  sinfisis: { ancla: { x: 0.5, y: 0.3, z: 0.99 }, radio: 0.35 },
  foramen_mentoniano: { ancla: { x: 0.3, y: 0.36, z: 0.8 }, radio: 0.2 },
};

/** Punto del modelo que corresponde a un ancla: las fracciones recorren la caja envolvente. */
export function puntoDeAncla(ancla: AnclaNodo, caja: CajaModelo): Vec3 {
  const f = (v: number, i: 0 | 1 | 2): number => {
    const fraccion = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
    return caja.min[i] + fraccion * (caja.max[i] - caja.min[i]);
  };
  return [f(ancla.x, 0), f(ancla.y, 1), f(ancla.z, 2)];
}

/** Centro de la caja: el modelo está centrado en el origen, pero no se da por hecho. */
export function centroDeCaja(caja: CajaModelo): Vec3 {
  return [
    (caja.min[0] + caja.max[0]) / 2,
    (caja.min[1] + caja.max[1]) / 2,
    (caja.min[2] + caja.max[2]) / 2,
  ];
}

/**
 * Ubica un nodo sobre la mandíbula provisional, o `null` si no se puede. Las piezas de los dos lados
 * (cóndilo, rama, ángulo...) se toman del lado que ve la cámara: con `lateral_izquierda` se refleja `x`.
 */
export function ubicarNodoMandibula(nodo: NodoUbicable, caja: CajaModelo): UbicacionNodo | null {
  if (nodo.ancla) {
    return {
      punto: puntoDeAncla(nodo.ancla, caja),
      radio: RADIO_ZONA_ANCLA,
      origen: 'ancla',
    };
  }
  if (nodo.id === 'mandibula') {
    return { punto: centroDeCaja(caja), radio: 1, origen: 'modelo_completo' };
  }
  const pieza = Object.hasOwn(ANCLAS_PROVISIONALES, nodo.id)
    ? ANCLAS_PROVISIONALES[nodo.id]
    : undefined;
  if (!pieza) return null;
  const espejo = nodo.camara.vista === 'lateral_izquierda';
  const ancla = espejo ? { ...pieza.ancla, x: 1 - pieza.ancla.x } : pieza.ancla;
  return { punto: puntoDeAncla(ancla, caja), radio: pieza.radio, origen: 'provisional' };
}
