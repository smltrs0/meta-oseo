/**
 * Catálogo de las escenas 3D del contenido (docs/content-schema.md, "Actividad exploracion-3d").
 *
 * El 3D se reserva para la mandíbula y las células (CLAUDE.md). Hay DOS maneras de que un nodo
 * del contenido apunte al modelo:
 *  - por PIEZA: su `id` es el nombre de un nodo del GLB. Solo valen los del catálogo de este
 *    archivo, que es exactamente lo que F0-08 (mandíbula) y F0-10 (células) planean separar en
 *    Blender. Cada nodo del GLB debe llamarse igual que su id, en snake_case en español.
 *  - por ANCLA (solo mandíbula): el nodo lleva `ancla: { x, y, z }`, un punto en la caja
 *    envolvente del modelo. Sirve para zonas que no son una pieza separable (una cresta, un
 *    foramen, una zona de compresión, una lámina) y funciona con el modelo provisional de una sola
 *    malla. El `id` de un nodo con ancla es libre (snake_case) y no se comprueba contra el
 *    catálogo.
 * Los GLB definitivos aún no existen: mientras tanto el catálogo es la propuesta que esos GLB
 * deben respetar. Si el modelador cambia un nombre, se cambia aquí y en el contenido.
 */

export const MODELOS_3D = ['mandibula', 'celulas'] as const;
export type Modelo3d = (typeof MODELOS_3D)[number];

export interface NodoCatalogo {
  /** Nombre del nodo en el GLB y `id` en content.json. */
  id: string;
  /** Nombre de la estructura, para mostrarlo tal cual si el contenido no da otra etiqueta. */
  etiqueta: string;
}

/**
 * `mandibula` es el nodo que abarca todo el hueso: es el único nodo del modelo provisional
 * (STL de BodyParts3D, F1-12), así que la escena funciona hoy con ese nodo. Los otros siete son
 * los que F0-08 separa en Blender. Foramen, escotadura o línea oblicua NO son volúmenes
 * separables: son huecos, muescas o crestas, y se piden por ancla.
 */
const NODOS_MANDIBULA: readonly NodoCatalogo[] = [
  { id: 'mandibula', etiqueta: 'Mandíbula' },
  { id: 'condilo', etiqueta: 'Cóndilo mandibular' },
  { id: 'apofisis_coronoides', etiqueta: 'Apófisis coronoides' },
  { id: 'rama', etiqueta: 'Rama mandibular' },
  { id: 'angulo', etiqueta: 'Ángulo mandibular' },
  { id: 'cuerpo', etiqueta: 'Cuerpo mandibular' },
  { id: 'sinfisis', etiqueta: 'Sínfisis mentoniana' },
  { id: 'foramen_mentoniano', etiqueta: 'Foramen mentoniano' },
];

/** Los cuatro modelos low-poly que planea F0-10. */
const NODOS_CELULAS: readonly NodoCatalogo[] = [
  { id: 'celula_osteoprogenitora', etiqueta: 'Célula osteoprogenitora' },
  { id: 'osteoblasto', etiqueta: 'Osteoblasto' },
  { id: 'osteocito', etiqueta: 'Osteocito' },
  { id: 'osteoclasto', etiqueta: 'Osteoclasto' },
];

export const CATALOGO_NODOS: Readonly<Record<Modelo3d, readonly NodoCatalogo[]>> = {
  mandibula: NODOS_MANDIBULA,
  celulas: NODOS_CELULAS,
};

/**
 * Ruta pública del GLB de cada modelo (F0-09 y F0-10 lo producen; aún no existen). Mientras no
 * existan, la mandíbula se muestra con el STL provisional de `scenes/` (F1-12) y sus nodos con
 * `ancla`; la escena que cargue el modelo decide qué hacer si el archivo falta (ver la sección
 * "3D" de la cabecera de activities/types.ts).
 */
export const RUTA_GLB: Readonly<Record<Modelo3d, string>> = {
  mandibula: '/models/mandibula.glb',
  celulas: '/models/celulas.glb',
};

/** Modelos cuyos nodos admiten `ancla` (el 3D de las células es de piezas separadas). */
export const MODELOS_CON_ANCLA: readonly Modelo3d[] = ['mandibula'];

/** ¿`id` es un nodo del catálogo del modelo? (Un nodo con `ancla` no necesita estarlo.) */
export function esNodoDelModelo(modelo: Modelo3d, id: string): boolean {
  return CATALOGO_NODOS[modelo].some((n) => n.id === id);
}

/**
 * Punto de un nodo por ancla, en coordenadas normalizadas (0 a 1) de la caja envolvente del
 * modelo, con los ejes del SUJETO (la persona a la que pertenece la mandíbula), no de la pantalla:
 *  - `x`: 0 = su lado derecho, 1 = su lado izquierdo (la cámara frontal ve el lado derecho del
 *    sujeto a la izquierda de la pantalla).
 *  - `y`: 0 = abajo (borde inferior del hueso), 1 = arriba (punta del cóndilo y de la coronoides).
 *  - `z`: 0 = posterior (atrás), 1 = anterior (adelante: el mentón).
 * El GLB definitivo debe respetar la misma convención (`+Y` arriba, `+Z` hacia delante).
 */
export interface AnclaNodo {
  x: number;
  y: number;
  z: number;
}

/**
 * Vistas de cámara con nombre. El contenido no lleva coordenadas (quien lo escribe no puede
 * previsualizar el 3D): elige una vista y la escena calcula la posición a partir de la caja
 * envolvente del nodo. Las direcciones son relativas al modelo, no a la pantalla:
 *  - `frontal`: vista anterior, la que trae la escena por defecto.
 *  - `posterior`: vista desde atrás.
 *  - `lateral_derecha` y `lateral_izquierda`: la cámara se coloca del lado derecho o izquierdo
 *    DEL SUJETO y mira hacia el modelo (en `lateral_derecha` se ve la cara externa del lado derecho).
 *  - `superior` e `inferior`: desde arriba y desde abajo.
 *  - `oblicua`: tres cuartos, ligeramente elevada; es la que mejor muestra el volumen.
 */
export const VISTAS_CAMARA = [
  'frontal',
  'posterior',
  'lateral_derecha',
  'lateral_izquierda',
  'superior',
  'inferior',
  'oblicua',
] as const;
export type VistaCamara = (typeof VISTAS_CAMARA)[number];
