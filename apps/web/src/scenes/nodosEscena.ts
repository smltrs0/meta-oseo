/**
 * Forma en que la actividad `exploracion-3d` le entrega los nodos a la escena. Vive en un archivo
 * aparte, sin three ni Vue, para que la actividad (que NO importa la escena de forma estática) pueda
 * tipar sus datos sin arrastrar three al fragmento inicial.
 */
import type { AnclaNodo, VistaCamara } from '@/content/nodos3d';

/** Lo que la escena necesita saber de cada nodo del contenido. */
export interface NodoEscena {
  id: string;
  etiqueta: string;
  /** Punto en la caja envolvente del modelo (solo mandíbula). Sin él, el nodo se busca por nombre. */
  ancla?: AnclaNodo;
  vista: VistaCamara;
  /** 0,5 a 3; 1 = encuadre automático del nodo. */
  zoom: number;
}
