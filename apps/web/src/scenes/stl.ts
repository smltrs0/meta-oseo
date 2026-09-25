/**
 * Carga del modelo de la mandíbula (STL de BodyParts3D) y preparación de su geometría.
 *
 * Es un recurso PROVISIONAL de la Fase 1: el GLB definitivo con nodos nombrados llega con
 * F0-05/F0-09. Cuando exista, esta carga se sustituye por `useGLTF` sin tocar la escena.
 *
 * Se descarga con `fetch` (y no con `useLoader` de TresJS) para poder cancelar la petición al
 * desmontar, informar el progreso real y distinguir errores con mensajes claros. La lógica
 * es pura respecto a Vue: se prueba sin WebGL.
 */
import type { BufferGeometry } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { escalaParaEncajar } from './encuadre';

/** Ruta pública del STL (carpeta public/models). */
export const URL_MODELO_MANDIBULA = `${import.meta.env.BASE_URL}models/mandibula_bodyparts3d.stl`;

/**
 * BodyParts3D usa el eje Z como "arriba" (sistema anatómico); three.js usa Y. Girar -90º
 * alrededor de X deja el cóndilo y la apófisis coronoides hacia arriba.
 */
export const ROTACION_X_BODYPARTS3D = -Math.PI / 2;

/** Error con mensaje ya redactado para el estudiante; `causa` conserva el detalle técnico. */
export class ErrorModelo extends Error {
  readonly causa?: unknown;

  constructor(message: string, causa?: unknown) {
    super(message);
    this.name = 'ErrorModelo';
    this.causa = causa;
  }
}

export type ProgresoDescarga = {
  /** Bytes recibidos hasta ahora. */
  cargado: number;
  /** Tamaño anunciado por el servidor (`Content-Length`), o `null` si no se conoce. */
  total: number | null;
  /** Fracción entre 0 y 1, o `null` si no hay tamaño total (progreso indeterminado). */
  fraccion: number | null;
};

export type OpcionesDescarga = {
  signal?: AbortSignal;
  onProgreso?: (progreso: ProgresoDescarga) => void;
  /** Inyectable para pruebas. */
  fetchFn?: typeof fetch;
};

function calcularProgreso(cargado: number, total: number | null): ProgresoDescarga {
  const fraccion = total && total > 0 ? Math.min(1, cargado / total) : null;
  return { cargado, total, fraccion };
}

/** Une los fragmentos recibidos en un único ArrayBuffer. */
function unirFragmentos(fragmentos: Uint8Array[], longitud: number): ArrayBuffer {
  const unido = new Uint8Array(longitud);
  let desplazamiento = 0;
  for (const fragmento of fragmentos) {
    unido.set(fragmento, desplazamiento);
    desplazamiento += fragmento.byteLength;
  }
  return unido.buffer;
}

/**
 * Descarga el archivo y devuelve sus bytes. Lanza `ErrorModelo` si el servidor responde con
 * error o con una página HTML (el "fallback" de una SPA cuando el archivo no existe).
 * Una cancelación (`AbortError`) se propaga tal cual para que quien llama la distinga.
 */
export async function descargarModelo(
  url: string,
  { signal, onProgreso, fetchFn = fetch }: OpcionesDescarga = {},
): Promise<ArrayBuffer> {
  let respuesta: Response;
  try {
    respuesta = await fetchFn(url, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ErrorModelo('No se pudo descargar el modelo 3D. Revisa tu conexión.', error);
  }
  if (!respuesta.ok) {
    throw new ErrorModelo(`No se pudo descargar el modelo 3D (error ${respuesta.status}).`);
  }
  if ((respuesta.headers.get('content-type') ?? '').includes('text/html')) {
    throw new ErrorModelo('El modelo 3D no está disponible en el servidor.');
  }

  const anunciado = Number(respuesta.headers.get('content-length'));
  const total = Number.isFinite(anunciado) && anunciado > 0 ? anunciado : null;
  const lector = respuesta.body?.getReader();
  if (!lector) {
    // Sin ReadableStream (navegadores muy antiguos): sin progreso intermedio.
    const bytes = await respuesta.arrayBuffer();
    onProgreso?.(calcularProgreso(bytes.byteLength, bytes.byteLength));
    return bytes;
  }

  const fragmentos: Uint8Array[] = [];
  let cargado = 0;
  onProgreso?.(calcularProgreso(0, total));
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      fragmentos.push(value);
      cargado += value.byteLength;
      onProgreso?.(calcularProgreso(cargado, total));
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ErrorModelo('Se interrumpió la descarga del modelo 3D.', error);
  }
  return unirFragmentos(fragmentos, cargado);
}

export type ModeloListo = {
  /** Geometría indexada, con normales suaves, centrada en el origen y de radio 1. */
  geometria: BufferGeometry;
  triangulos: number;
  vertices: number;
  /** Radio de la esfera envolvente en las unidades originales (mm en BodyParts3D). */
  radioOriginal: number;
};

/**
 * Convierte los bytes de un STL en la geometría lista para renderizar:
 *  1. parsea (binario o ASCII) y valida que haya triángulos;
 *  2. orienta el eje Z anatómico hacia Y;
 *  3. centra en el origen (`center`);
 *  4. suelda vértices y recalcula normales para un sombreado suave (el STL trae normales
 *     por cara, que darían un aspecto facetado);
 *  5. escala para que la esfera envolvente tenga radio 1.
 *
 * Lanza `ErrorModelo` si el contenido no es un STL válido.
 */
export function crearGeometriaMandibula(bytes: ArrayBuffer): ModeloListo {
  let crudo: BufferGeometry;
  try {
    crudo = new STLLoader().parse(bytes);
  } catch (error) {
    throw new ErrorModelo('El archivo del modelo 3D no es válido.', error);
  }

  const posiciones = crudo.getAttribute('position');
  if (!posiciones || posiciones.count === 0 || posiciones.count % 3 !== 0) {
    crudo.dispose();
    throw new ErrorModelo('El archivo del modelo 3D no es válido o está vacío.');
  }

  crudo.rotateX(ROTACION_X_BODYPARTS3D);
  crudo.center();
  // Solo la posición: normales y colores por cara impedirían soldar vértices.
  crudo.deleteAttribute('normal');
  crudo.deleteAttribute('color');
  const geometria = mergeVertices(crudo, 1e-3);
  crudo.dispose();

  geometria.computeVertexNormals();
  geometria.computeBoundingSphere();
  const radioOriginal = geometria.boundingSphere?.radius ?? 0;
  const escala = escalaParaEncajar(radioOriginal);
  geometria.scale(escala, escala, escala);
  geometria.computeBoundingSphere();
  geometria.computeBoundingBox();

  return {
    geometria,
    triangulos: (geometria.index?.count ?? posiciones.count) / 3,
    vertices: geometria.getAttribute('position').count,
    radioOriginal,
  };
}
