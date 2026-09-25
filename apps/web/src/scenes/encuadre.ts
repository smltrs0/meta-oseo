/**
 * Lógica pura del encuadre de las escenas 3D (sin three ni Vue, para poder probarla sola).
 *
 * Convención: el modelo se normaliza a una esfera envolvente de radio 1 (ver
 * `crearGeometriaMandibula` en stl.ts) y la cámara se coloca a la distancia justa para
 * que esa esfera quepa en pantalla, tanto en vertical (móvil) como en horizontal (escritorio).
 */

/** Radio al que se normaliza la esfera envolvente de los modelos. */
export const RADIO_NORMALIZADO = 1;

/** Campo de visión vertical de la cámara, en grados. */
export const FOV_VERTICAL_GRADOS = 40;

/** Aire alrededor del modelo al encuadrarlo (1 = pegado a los bordes). */
export const MARGEN_ENCUADRE = 1.1;

/** Elevación de la cámara inicial sobre el plano horizontal, en grados (vista ligeramente picada). */
export const ELEVACION_INICIAL_GRADOS = 12;

const aRadianes = (grados: number): number => (grados * Math.PI) / 180;

/**
 * Factor de escala que lleva una esfera envolvente de `radioActual` a `radioObjetivo`.
 * Con un radio inválido (0, negativo o no finito) devuelve 1: no se escala.
 */
export function escalaParaEncajar(
  radioActual: number,
  radioObjetivo: number = RADIO_NORMALIZADO,
): number {
  if (!Number.isFinite(radioActual) || radioActual <= 0) return 1;
  return radioObjetivo / radioActual;
}

/**
 * Distancia de la cámara al centro para que una esfera de `radio` quepa entera en pantalla.
 *
 * La esfera debe caber en el eje más estrecho: el vertical si el lienzo es apaisado
 * (aspecto >= 1) y el horizontal si es vertical (móvil en portrait). Para una esfera, la
 * distancia límite es `radio / sin(fov / 2)`.
 */
export function distanciaParaEncajar(
  radio: number,
  aspecto: number,
  fovVerticalGrados: number = FOV_VERTICAL_GRADOS,
  margen: number = MARGEN_ENCUADRE,
): number {
  const aspectoSeguro = Number.isFinite(aspecto) && aspecto > 0 ? aspecto : 1;
  const fovVertical = aRadianes(fovVerticalGrados);
  const fovHorizontal = 2 * Math.atan(Math.tan(fovVertical / 2) * aspectoSeguro);
  const fovMinimo = Math.min(fovVertical, fovHorizontal);
  return (radio * margen) / Math.sin(fovMinimo / 2);
}

/** Posición inicial de la cámara: de frente, a `distancia` del origen y algo elevada. */
export function posicionInicialCamara(
  distancia: number,
  elevacionGrados: number = ELEVACION_INICIAL_GRADOS,
): [number, number, number] {
  const elevacion = aRadianes(elevacionGrados);
  return [0, distancia * Math.sin(elevacion), distancia * Math.cos(elevacion)];
}

export type LimitesDistancia = { minima: number; maxima: number };

/**
 * Límites del zoom (pinch/rueda). La mínima impide meter la cámara dentro del hueso y la
 * máxima evita perderlo de vista.
 */
export function limitesDistancia(radio: number, distanciaEncuadre: number): LimitesDistancia {
  const minima = radio * 1.4;
  return { minima, maxima: Math.max(minima * 2, distanciaEncuadre * 2.2) };
}

export type PuntoPantalla = { x: number; y: number };

/**
 * ¿Fue un toque o clic limpio y no el final de un arrastre? Las rotaciones con OrbitControls
 * terminan también en un `click`; si el puntero se desplazó más de `umbralPx` entre pulsar y
 * soltar, no debe contar como selección. Sin punto de inicio (p. ej. teclado) se acepta.
 */
export function esToqueSinArrastre(
  inicio: PuntoPantalla | null,
  fin: PuntoPantalla,
  umbralPx = 8,
): boolean {
  if (!inicio) return true;
  return Math.hypot(fin.x - inicio.x, fin.y - inicio.y) <= umbralPx;
}
