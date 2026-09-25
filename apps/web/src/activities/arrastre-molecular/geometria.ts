/**
 * Geometría y barajado del arrastre molecular. Funciones puras (sin DOM) para poder probarlas
 * con números: el componente solo mide rectángulos y se los pasa.
 */
import { RADIO_CAPTURA_MIN_PX } from '../types';

export interface Punto {
  x: number;
  y: number;
}

/**
 * Radio de captura de un receptor al soltar una molécula, en px CSS. Es el mínimo del contrato:
 * el receptor se elige por cercanía, no por intersección exacta con el dibujo, y así el dedo
 * (impreciso) no se castiga. Con receptores a 52 px o más entre sí, los radios se solapan y gana
 * el más cercano.
 */
export const RADIO_CAPTURA_PX = RADIO_CAPTURA_MIN_PX;

/** Movimiento (px) desde el que un toque sostenido pasa a ser un arrastre y no un toque. */
export const UMBRAL_ARRASTRE_PX = 6;

/** Tamaño (px) de la zona táctil de un receptor: el mínimo de 44 px del contrato (R2). */
export const TAMANO_RECEPTOR_PX = 44;

export function distancia(a: Punto, b: Punto): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Índice del receptor más cercano a `punto` dentro de `radio`, o `null` si ninguno está al
 * alcance (soltar en el vacío no es un error). Los centros no finitos se ignoran; en un empate
 * gana el de menor índice, para que el resultado sea determinista.
 */
export function receptorMasCercano(
  punto: Punto,
  centros: readonly (Punto | null | undefined)[],
  radio: number = RADIO_CAPTURA_PX,
): number | null {
  if (!Number.isFinite(punto.x) || !Number.isFinite(punto.y)) return null;
  let mejor: number | null = null;
  let mejorDistancia = Number.POSITIVE_INFINITY;
  centros.forEach((centro, indice) => {
    if (!centro || !Number.isFinite(centro.x) || !Number.isFinite(centro.y)) return;
    const d = distancia(punto, centro);
    if (d <= radio && d < mejorDistancia) {
      mejor = indice;
      mejorDistancia = d;
    }
  });
  return mejor;
}

/** Centro de un rectángulo (lo que devuelve `getBoundingClientRect`). */
export function centroDeRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): Punto {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Relación ancho / alto de la escena a partir de su `viewBox` ("0 0 800 600" -> 800 / 600). Si el
 * texto no tiene esa forma se usa 4 / 3 (el esquema ya lo rechaza; esto es defensa).
 */
export function aspectoDeViewBox(viewBox: string | undefined): number {
  const m = /^\s*0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/.exec(viewBox ?? '');
  const ancho = m ? Number(m[1]) : 0;
  const alto = m ? Number(m[2]) : 0;
  return ancho > 0 && alto > 0 ? ancho / alto : 4 / 3;
}

/**
 * Espacio (px) que hay que dejar debajo de la escena para la etiqueta del receptor más bajo, que
 * cuelga de su zona táctil. Se calcula con la escena a 320 px de ancho (el caso más estrecho, el
 * de menos holgura) para que la etiqueta nunca pise el contenido que sigue.
 */
export function margenInferiorEscena(
  receptores: readonly { y: number }[],
  aspecto: number,
  anchoPx = 320,
  alturaEtiquetaPx = 38,
): number {
  const alto = anchoPx / (aspecto > 0 ? aspecto : 4 / 3);
  let exceso = 0;
  for (const r of receptores) {
    const centro = (Math.min(100, Math.max(0, r.y)) / 100) * alto;
    const finEtiqueta = centro + TAMANO_RECEPTOR_PX / 2 + 2 + alturaEtiquetaPx;
    exceso = Math.max(exceso, finEtiqueta - alto);
  }
  return Math.ceil(Math.max(0, exceso)) + (exceso > 0 ? 4 : 0);
}

/**
 * Ancho máximo (px a 320 px de escena) de la etiqueta de un receptor para no pisar la de sus
 * vecinos: mira solo a los que quedan a una altura en la que las etiquetas se solaparían y deja
 * un aire de 4 px. Nunca baja de 44 px (una palabra corta siempre cabe) ni pasa de `maximo`.
 * Se calcula en píxeles de referencia; la interfaz lo convierte en unidades relativas a la escena.
 */
export function anchoMaxEtiquetaPx(
  receptores: readonly { x: number; y: number }[],
  indice: number,
  aspecto: number,
  anchoPx = 320,
  maximo = 112,
): number {
  const yo = receptores[indice];
  if (!yo) return maximo;
  const alto = anchoPx / (aspecto > 0 ? aspecto : 4 / 3);
  let ancho = maximo;
  receptores.forEach((otro, j) => {
    if (j === indice) return;
    const dx = Math.abs(((otro.x - yo.x) / 100) * anchoPx);
    const dy = Math.abs(((otro.y - yo.y) / 100) * alto);
    // Dos etiquetas (38 px) o una etiqueta y una zona táctil vecina (44 px) se tocan si sus
    // alturas distan menos que 84 px.
    if (dy < 84) ancho = Math.min(ancho, dx - 4);
  });
  return Math.max(44, Math.floor(ancho));
}

/** Cómo se alinea la etiqueta de un receptor para no salirse de la escena en un teléfono. */
export function alineacionEtiqueta(x: number, anchoPx = 320): 'inicio' | 'centro' | 'fin' {
  const px = (x / 100) * anchoPx;
  if (px < 48) return 'inicio';
  if (px > anchoPx - 48) return 'fin';
  return 'centro';
}

/* -------------------------------------------------------------------------------------------
 * Barajado con semilla
 * ----------------------------------------------------------------------------------------- */

/** Generador pseudoaleatorio mulberry32: mismo número de semilla, misma secuencia. */
export function generadorConSemilla(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Orden de `n` elementos barajado de forma determinista con `semilla`: aleatorio para el
 * estudiante, pero estable durante la ejecución y al recargar (la semilla va en la instantánea).
 */
export function ordenBarajado(n: number, semilla: number): number[] {
  const orden = Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => i);
  const azar = generadorConSemilla(semilla);
  for (let i = orden.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [orden[i], orden[j]] = [orden[j]!, orden[i]!];
  }
  return orden;
}

/** Semilla nueva de 32 bits. */
export function semillaNueva(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
