/**
 * Estado de la carga del modelo provisional de la mandíbula, compartido por las escenas
 * (`MandibulaScene` de la demo y `MandibulaExplorable` de la actividad `exploracion-3d`).
 *
 * La descarga y el parseo ocurren FUERA del lienzo: el indicador de carga es HTML normal y el
 * <TresCanvas> solo se monta cuando ya hay geometría. Al desmontar se cancela la descarga y se libera
 * la geometría; TresJS libera escena y renderizador (incluido `forceContextLoss`).
 */
import { computed, onBeforeUnmount, onErrorCaptured, ref, shallowRef } from 'vue';
import type { ComputedRef, Ref, ShallowRef } from 'vue';
import { Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { RADIO_NORMALIZADO, distanciaParaEncajar, posicionInicialCamara } from './encuadre';
import { ErrorModelo, URL_MODELO_MANDIBULA, crearGeometriaMandibula, descargarModelo } from './stl';
import { hayWebGL2 } from './webgl';

export type EstadoEscena = 'detectando' | 'sin_webgl' | 'cargando' | 'error' | 'listo';

export interface OpcionesModelo {
  /** Nombre del componente para los mensajes de la consola. */
  nombre: string;
  /** Ancho / alto del contenedor en este momento (encuadre inicial de la cámara). */
  aspecto: () => number;
}

export interface ModeloMandibula {
  estado: Ref<EstadoEscena>;
  mensajeError: Ref<string>;
  /** Fracción 0..1 de la descarga, o null si el servidor no anunció el tamaño. */
  progreso: Ref<number | null>;
  porcentaje: ComputedRef<number | null>;
  geometria: ShallowRef<BufferGeometry | null>;
  camaraInicial: ShallowRef<Vector3 | null>;
  /** Detecta WebGL 2 y, si hay, descarga el modelo. */
  iniciar: () => void;
  /** Vuelve a descargar el modelo (tras un error de carga). */
  cargar: () => Promise<void>;
  /** Pasa a la pantalla de error de renderizado. */
  fallarRenderizado: (error: unknown) => void;
}

export function useModeloMandibula({ nombre, aspecto }: OpcionesModelo): ModeloMandibula {
  const estado = ref<EstadoEscena>('detectando');
  const mensajeError = ref('');
  const progreso = ref<number | null>(null);
  const geometria = shallowRef<BufferGeometry | null>(null);
  const camaraInicial = shallowRef<Vector3 | null>(null);
  const porcentaje = computed(() =>
    progreso.value === null ? null : Math.round(progreso.value * 100),
  );

  let descarga: AbortController | null = null;

  async function cargar(): Promise<void> {
    descarga?.abort();
    const control = new AbortController();
    descarga = control;
    estado.value = 'cargando';
    progreso.value = null;
    mensajeError.value = '';

    try {
      const bytes = await descargarModelo(URL_MODELO_MANDIBULA, {
        signal: control.signal,
        onProgreso: (p) => {
          progreso.value = p.fraccion;
        },
      });
      const modelo = crearGeometriaMandibula(bytes);
      if (control.signal.aborted) {
        modelo.geometria.dispose();
        return;
      }
      geometria.value?.dispose();
      geometria.value = modelo.geometria;
      // Encuadre inicial con el aspecto del contenedor en este momento. Es una instantánea:
      // si luego cambia el tamaño la cámara no salta, solo se ajustan los límites del zoom.
      camaraInicial.value = new Vector3(
        ...posicionInicialCamara(distanciaParaEncajar(RADIO_NORMALIZADO, aspecto())),
      );
      estado.value = 'listo';
    } catch (error) {
      if (control.signal.aborted) return;
      console.error(`[${nombre}] no se pudo cargar el modelo`, error);
      mensajeError.value =
        error instanceof ErrorModelo ? error.message : 'No se pudo preparar el modelo 3D.';
      estado.value = 'error';
    }
  }

  function iniciar(): void {
    if (!hayWebGL2()) {
      estado.value = 'sin_webgl';
      return;
    }
    void cargar();
  }

  function fallarRenderizado(error: unknown): void {
    console.error(`[${nombre}] falló el renderizado 3D`, error);
    mensajeError.value = 'No se pudo iniciar el renderizado 3D en este dispositivo.';
    estado.value = 'error';
  }

  // Un fallo al crear el renderizador dentro del lienzo (p. ej. contexto WebGL rechazado a
  // pesar de la detección previa) se convierte en el mensaje de error en vez de una pantalla rota.
  onErrorCaptured((error) => {
    if (estado.value !== 'listo') return true;
    fallarRenderizado(error);
    return false;
  });

  onBeforeUnmount(() => {
    descarga?.abort();
    geometria.value?.dispose();
    geometria.value = null;
  });

  return {
    estado,
    mensajeError,
    progreso,
    porcentaje,
    geometria,
    camaraInicial,
    iniciar,
    cargar,
    fallarRenderizado,
  };
}
