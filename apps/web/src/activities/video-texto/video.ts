/**
 * Utilidades del medio "video" de video-texto: fracción vista, formato de tiempo y pista de
 * subtítulos por defecto. Funciones puras, sin DOM.
 */
import { UMBRAL_VIDEO_VISTO } from '@/activities/types';

/** Lo mínimo que se usa de un `TimeRanges` (así se prueba sin un elemento `<video>` real). */
export interface RangosDeTiempo {
  readonly length: number;
  start(indice: number): number;
  end(indice: number): number;
}

/** Limita a [0, 1]; lo que no es número queda en 0. */
export function limitarFraccion(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.min(1, Math.max(0, valor));
}

/**
 * Fracción del video realmente reproducida: la suma de las duraciones de `played` dividida por la
 * duración REAL del elemento (no la de la configuración ni la posición máxima: saltar con la barra
 * no suma). Sin duración conocida (metadatos sin cargar) es 0.
 */
export function fraccionVista(
  reproducido: RangosDeTiempo | null | undefined,
  duracion: number,
): number {
  if (!reproducido || !Number.isFinite(duracion) || duracion <= 0) return 0;
  let total = 0;
  for (let i = 0; i < reproducido.length; i++) {
    const tramo = reproducido.end(i) - reproducido.start(i);
    if (Number.isFinite(tramo) && tramo > 0) total += tramo;
  }
  return limitarFraccion(total / duracion);
}

/** ¿Llegó al umbral de "visto"? Con una tolerancia mínima por el ruido de coma flotante. */
export function alcanzaUmbral(fraccion: number): boolean {
  return fraccion >= UMBRAL_VIDEO_VISTO - 1e-9;
}

/** Dos decimales, como pide el `detalle` (`DetalleVideoTexto.visto`). */
export function redondear2(fraccion: number): number {
  return Math.round(limitarFraccion(fraccion) * 100) / 100;
}

/** `m:ss` (o `h:mm:ss` desde una hora). Un valor inválido o negativo es `0:00`. */
export function formatearTiempo(segundos: number): string {
  const total = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Índice de la pista de subtítulos que va activada por defecto: la de idioma `es`; si no hay,
 * la primera (los subtítulos son un requisito de accesibilidad, así que siempre hay uno activo).
 * `-1` si no hay pistas.
 */
export function indicePistaPorDefecto(pistas: readonly { idioma: string }[]): number {
  if (pistas.length === 0) return -1;
  const es = pistas.findIndex((p) => p.idioma === 'es');
  return es >= 0 ? es : 0;
}

/** Duración de lectura de un texto en la reproducción automática, entre 5 y 40 s (70 ms por letra). */
export function duracionDePasoMs(textoPlano: string): number {
  return Math.min(40_000, Math.max(5_000, [...textoPlano].length * 70));
}
