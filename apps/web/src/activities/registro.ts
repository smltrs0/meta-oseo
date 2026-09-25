/**
 * Registro de componentes de actividad: asocia cada tipo del contrato con el componente que lo
 * dibuja, por CONVENCIÓN de nombres y sin imports estáticos, para que la página de módulo compile
 * aunque algún componente aún no exista (o lo escriba otra persona en paralelo).
 *
 * Convención: `src/activities/<tipo>/Actividad<Nombre>.vue`, con `<tipo>` el valor de `tipo` del
 * contenido (`quiz`, `multicapa`, `arrastre-molecular`...). Se compara sin distinguir mayúsculas ni
 * separadores, y se acepta el nombre de la carpeta o el del archivo:
 *
 *   activities/quiz/ActividadQuiz.vue                                  -> quiz
 *   activities/arrastre-molecular/ActividadArrastreMolecular.vue       -> arrastre-molecular
 *   activities/multicapa/ActividadMulticapa.vue                        -> multicapa
 *
 * También se reconocen los nombres del contrato en inglés (`layers`, `drag`, `match`, `media`,
 * `scene3d`; ver la cabecera de types.ts) por si alguien nombró así la carpeta o el archivo.
 *
 * Carga perezosa: `import.meta.glob` sin `eager` genera un fragmento por componente; la actividad
 * se descarga solo cuando el estudiante llega a ella. Si falta el componente de un tipo se usa
 * `ActividadReserva` ("Esta actividad aún no está disponible"), y si la descarga falla, la misma
 * reserva con el mensaje de error.
 */
import { defineAsyncComponent } from 'vue';
import type { Component } from 'vue';
import ActividadCargando from '@/components/modulo/ActividadCargando.vue';
import ActividadReserva from '@/components/modulo/ActividadReserva.vue';
import { TIPOS_ACTIVIDAD } from '@/content/schema';
import type { TipoActividad } from '@/content/schema';

export type CargadorComponente = () => Promise<{ default: Component }>;
export type CargadoresComponentes = Readonly<Record<string, CargadorComponente>>;

/** Nombres del contrato (activities/types.ts) que equivalen a cada tipo. */
const ALIAS: Readonly<Record<string, TipoActividad>> = {
  layers: 'multicapa',
  drag: 'arrastre-molecular',
  match: 'relacion-columnas',
  media: 'video-texto',
  scene3d: 'exploracion-3d',
};

function normalizar(texto: string): string {
  return texto.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const NORMALIZADOS = new Map<string, TipoActividad>([
  ...TIPOS_ACTIVIDAD.map((t) => [normalizar(t), t] as const),
  ...Object.entries(ALIAS).map(([alias, t]) => [normalizar(alias), t] as const),
]);

/** Tipo al que corresponde una ruta `./<carpeta>/Actividad<Nombre>.vue`, o `null`. */
export function tipoDeRuta(ruta: string): TipoActividad | null {
  const coincidencia = /(?:^|\/)([^/]+)\/(Actividad[^/]*)\.vue$/.exec(ruta);
  if (!coincidencia) return null;
  const carpeta = normalizar(coincidencia[1] ?? '');
  const archivo = normalizar((coincidencia[2] ?? '').replace(/^Actividad/, ''));
  return NORMALIZADOS.get(carpeta) ?? NORMALIZADOS.get(archivo) ?? null;
}

export interface RegistroActividades {
  /** ¿Hay un componente para este tipo? */
  hayComponente: (tipo: TipoActividad) => boolean;
  /** Tipos con componente, en el orden del contrato. */
  tiposDisponibles: () => TipoActividad[];
  /** Componente (asíncrono) del tipo, o la reserva si falta. Siempre el mismo objeto por tipo. */
  componenteDe: (tipo: TipoActividad) => Component;
}

export function crearRegistroActividades(cargadores: CargadoresComponentes): RegistroActividades {
  const porTipo = new Map<TipoActividad, CargadorComponente>();
  for (const ruta of Object.keys(cargadores).sort()) {
    const tipo = tipoDeRuta(ruta);
    const cargar = cargadores[ruta];
    // Si dos archivos declaran el mismo tipo gana el primero por orden alfabético (estable).
    if (tipo && cargar && !porTipo.has(tipo)) porTipo.set(tipo, cargar);
  }

  const cache = new Map<TipoActividad, Component>();

  return {
    hayComponente: (tipo) => porTipo.has(tipo),
    tiposDisponibles: () => TIPOS_ACTIVIDAD.filter((t) => porTipo.has(t)),
    componenteDe(tipo) {
      const previo = cache.get(tipo);
      if (previo) return previo;
      const cargar = porTipo.get(tipo);
      const componente: Component = cargar
        ? defineAsyncComponent({
            // Se desenvuelve el `default` aquí: no depende de que el módulo sea un ES module real.
            loader: () => cargar().then((modulo) => modulo.default),
            loadingComponent: ActividadCargando,
            errorComponent: ActividadReserva,
            // Sin parpadeo si el fragmento ya está en caché; el aviso sale solo si tarda.
            delay: 200,
          })
        : ActividadReserva;
      cache.set(tipo, componente);
      return componente;
    },
  };
}

/** Registro real: un componente por carpeta `src/activities/<tipo>/`. Vacío es válido. */
const registro = crearRegistroActividades(
  import.meta.glob<{ default: Component }>('./*/Actividad*.vue'),
);

export function hayComponenteDeActividad(tipo: TipoActividad): boolean {
  return registro.hayComponente(tipo);
}

export function tiposConComponente(): TipoActividad[] {
  return registro.tiposDisponibles();
}

export function componenteDeActividad(tipo: TipoActividad): Component {
  return registro.componenteDe(tipo);
}
