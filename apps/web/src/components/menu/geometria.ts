/**
 * Geometría del menú circular (F1-10). Todo lo que decide DÓNDE va cada nodo vive aquí, en
 * funciones puras sin DOM ni Vue, para poder probarlo sin navegador.
 *
 * Convenciones:
 *  - Los ángulos van en grados, con 0° a la derecha y 90° arriba (sentido antihorario,
 *    como en matemáticas). Un arco `{ desde: 90, hasta: -90 }` es el semicírculo derecho,
 *    recorrido de arriba abajo.
 *  - Las posiciones (x, y) son relativas al CENTRO del control circular, en píxeles de
 *    pantalla: x crece hacia la derecha e y hacia ABAJO.
 *  - Los nodos se reparten en el centro de sub-sectores iguales del arco. Así queda medio
 *    paso de margen en cada extremo y ningún nodo se pega al borde del arco.
 */

export interface Arco {
  /** Ángulo donde empieza el arco (grados). */
  desde: number;
  /** Ángulo donde termina el arco (grados). */
  hasta: number;
}

export interface PosicionNodo {
  indice: number;
  /** Ángulo del centro del nodo (grados). */
  angulo: number;
  /** Desplazamiento horizontal desde el centro del control (px, positivo = derecha). */
  x: number;
  /** Desplazamiento vertical desde el centro del control (px, positivo = abajo). */
  y: number;
}

/** Ancho de pantalla desde el que se usa la disposición de escritorio (`md` de Tailwind). */
export const ANCHO_ESCRITORIO = 768;
/** Diámetro del nodo de cada módulo. Coincide con el objetivo táctil mínimo de 44 px. */
export const TAM_NODO = 44;
/** Diámetro del botón circular que abre y cierra el menú. */
export const TAM_CONTROL = 56;
/** Distancia del centro del control al borde izquierdo de la pantalla (2.25rem). */
export const CENTRO_X = 36;
/** Alto de la cabecera fija del shell (3.5rem = `--altura-cabecera`). */
export const ALTO_CABECERA = 56;
/** Margen mínimo entre el menú y el borde derecho de la pantalla. */
export const MARGEN_DERECHO = 8;

const arcoEscritorio: Arco = { desde: 90, hasta: -90 };
const arcoMovil: Arco = { desde: 100, hasta: 12 };

const RADIO_MIN_ESCRITORIO = 96;
const RADIO_MAX_ESCRITORIO = 160;
const RADIO_MIN_MOVIL = 160;
const RADIO_MAX_MOVIL = 190;
const ANCHO_ETIQUETA_MIN = 72;
const ANCHO_ETIQUETA_MAX = 260;

const aRadianes = (grados: number): number => (grados * Math.PI) / 180;
/** Redondea a centésimas y evita el `-0`, que estorba en comparaciones y en el DOM. */
const redondear = (n: number): number => Math.round(n * 100) / 100 + 0;
const acotar = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

function validarTotal(total: number): void {
  if (!Number.isInteger(total) || total < 1) {
    throw new RangeError(`total debe ser un entero mayor o igual a 1 (recibido ${total})`);
  }
}

/** Ángulo (grados) del nodo `indice` de `total`, repartidos en el centro de cada sub-sector. */
export function anguloDelNodo(indice: number, total: number, arco: Arco): number {
  validarTotal(total);
  if (!Number.isInteger(indice) || indice < 0 || indice >= total) {
    throw new RangeError(`indice fuera de rango: ${indice} (total ${total})`);
  }
  const paso = (arco.hasta - arco.desde) / total;
  return arco.desde + (indice + 0.5) * paso;
}

/** Posición del nodo `indice` sobre un círculo de `radio` px, respecto del centro del control. */
export function posicionNodo(
  indice: number,
  total: number,
  radio: number,
  arco: Arco,
): PosicionNodo {
  if (!Number.isFinite(radio) || radio < 0) {
    throw new RangeError(`radio inválido: ${radio}`);
  }
  const angulo = anguloDelNodo(indice, total, arco);
  const rad = aRadianes(angulo);
  return {
    indice,
    angulo: redondear(angulo),
    x: redondear(radio * Math.cos(rad)),
    // En pantalla la y crece hacia abajo; el ángulo, hacia arriba.
    y: redondear(-radio * Math.sin(rad)),
  };
}

export function posicionesNodos(total: number, radio: number, arco: Arco): PosicionNodo[] {
  validarTotal(total);
  return Array.from({ length: total }, (_, i) => posicionNodo(i, total, radio, arco));
}

/** Distancia entre los centros de dos nodos consecutivos (la cuerda del sub-sector). */
export function separacionEntreNodos(total: number, radio: number, arco: Arco): number {
  validarTotal(total);
  if (total < 2) return Number.POSITIVE_INFINITY;
  const paso = Math.abs(arco.hasta - arco.desde) / total;
  return redondear(2 * radio * Math.sin(aRadianes(paso) / 2));
}

/** Punto (x, y) de pantalla de un círculo de `radio` a `grados`, respecto del centro. */
function punto(radio: number, grados: number): string {
  const rad = aRadianes(grados);
  return `${redondear(radio * Math.cos(rad))} ${redondear(-radio * Math.sin(rad))}`;
}

/**
 * Trazo SVG (atributo `d`) de un sector anular: la franja entre `radioInterior` y
 * `radioExterior` que va de `desde` a `hasta` grados, centrada en el origen. Es el fondo
 * en forma de semicírculo sobre el que se apoyan los nodos.
 */
export function sectorAnular(
  radioInterior: number,
  radioExterior: number,
  desde: number,
  hasta: number,
): string {
  const barrido = Math.abs(hasta - desde);
  const grande = barrido > 180 ? 1 : 0;
  // Ir de `desde` a `hasta` pasando por la derecha es horario en pantalla (sweep = 1);
  // el borde interior vuelve en sentido contrario.
  const sentido = hasta < desde ? 1 : 0;
  return [
    `M ${punto(radioExterior, desde)}`,
    `A ${radioExterior} ${radioExterior} 0 ${grande} ${sentido} ${punto(radioExterior, hasta)}`,
    `L ${punto(radioInterior, hasta)}`,
    `A ${radioInterior} ${radioInterior} 0 ${grande} ${1 - sentido} ${punto(radioInterior, desde)}`,
    'Z',
  ].join(' ');
}

/**
 * Segmentos (trazos `d`) de un anillo dividido en `total` partes iguales con un pequeño
 * hueco entre ellas. Sirve para el anillo de progreso alrededor del control: un segmento
 * por módulo, empezando arriba y avanzando en sentido horario. Centrado en (cx, cy).
 */
export function segmentosDeAnillo(
  total: number,
  radio: number,
  centro: number,
  huecoGrados = 8,
): string[] {
  validarTotal(total);
  const paso = 360 / total;
  return Array.from({ length: total }, (_, i) => {
    // Grados de pantalla medidos en sentido horario desde las 12 en punto.
    const ini = i * paso + huecoGrados / 2;
    const fin = (i + 1) * paso - huecoGrados / 2;
    const p = (g: number) => {
      const rad = aRadianes(g);
      return `${redondear(centro + radio * Math.sin(rad))} ${redondear(centro - radio * Math.cos(rad))}`;
    };
    return `M ${p(ini)} A ${radio} ${radio} 0 ${fin - ini > 180 ? 1 : 0} 1 ${p(fin)}`;
  });
}

export type ModoMenu = 'escritorio' | 'movil';

export interface DisposicionMenu {
  modo: ModoMenu;
  radio: number;
  arco: Arco;
  nodos: PosicionNodo[];
  /** Radios interior y exterior del sector anular de fondo. */
  sector: { interior: number; exterior: number };
  /** Ancho máximo (px) de la píldora completa (nodo + etiqueta) de cada nodo. */
  anchoMaximo: number[];
}

export interface EntradaDisposicion {
  /** Ancho de la ventana (px). */
  ancho: number;
  /** Alto de la ventana (px). */
  alto: number;
  total: number;
}

/**
 * Elige la disposición según el tamaño de la ventana.
 *
 *  - Escritorio: control fijo al borde izquierdo, a media altura; los nodos se abren en un
 *    semicírculo hacia la derecha. El radio se reduce si la ventana es baja, para no chocar
 *    con la cabecera.
 *  - Móvil: control flotante abajo a la izquierda; los nodos se abren en un cuarto de
 *    círculo hacia arriba y a la derecha. Cada etiqueta recibe el ancho que le queda hasta
 *    el borde de la pantalla (la del último nodo es la más justa).
 */
export function calcularDisposicion({ ancho, alto, total }: EntradaDisposicion): DisposicionMenu {
  validarTotal(total);
  const modo: ModoMenu = ancho >= ANCHO_ESCRITORIO ? 'escritorio' : 'movil';
  const arco = modo === 'escritorio' ? arcoEscritorio : arcoMovil;
  // El nodo más alto (índice 0) es el que fija cuánto espacio vertical hace falta.
  const anguloMayor = Math.abs(anguloDelNodo(0, total, arco));
  const seno = Math.max(Math.sin(aRadianes(anguloMayor)), 0.2);

  let radio: number;
  if (modo === 'escritorio') {
    // Mitad de la ventana menos cabecera, medio nodo y un margen.
    const libre = alto / 2 - ALTO_CABECERA - TAM_NODO / 2 - 12;
    radio = acotar(Math.floor(libre / seno), RADIO_MIN_ESCRITORIO, RADIO_MAX_ESCRITORIO);
  } else {
    // Altura libre sobre el control: ventana menos cabecera, control y medio nodo.
    const libre = alto - ALTO_CABECERA - TAM_CONTROL - TAM_NODO / 2 - 12;
    radio = acotar(Math.floor(libre / seno), RADIO_MIN_MOVIL, RADIO_MAX_MOVIL);
  }

  const nodos = posicionesNodos(total, radio, arco);
  const anchoMaximo = nodos.map((n) => {
    // Borde izquierdo de la píldora = centro del nodo - medio nodo.
    const izquierda = CENTRO_X + n.x - TAM_NODO / 2;
    const disponible = ancho - izquierda - MARGEN_DERECHO;
    return Math.floor(
      acotar(disponible, TAM_NODO + ANCHO_ETIQUETA_MIN, TAM_NODO + ANCHO_ETIQUETA_MAX),
    );
  });

  const media = TAM_NODO / 2 + 8;
  return {
    modo,
    radio,
    arco,
    nodos,
    sector: { interior: Math.max(radio - media, TAM_CONTROL / 2 + 12), exterior: radio + media },
    anchoMaximo,
  };
}
