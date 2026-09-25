/**
 * Registro de módulos: descubre los `content.json` de `src/modules/m{n}_{slug}/` y los carga
 * de forma perezosa (una petición por módulo, solo cuando el estudiante lo abre).
 *
 * - `listarModulos()`: qué módulos tienen contenido hoy. Funciona con el glob vacío (hoy no
 *   existe ningún módulo) y con cualquier número de ellos.
 * - `cargarModulo(n)`: carga, valida con zod y devuelve el módulo o un fallo con errores
 *   legibles (`errores`, en español, con la ruta y el id de cada elemento; ver errores.ts).
 *   Nunca lanza. En desarrollo también los escribe en la consola.
 *
 * `crearRegistro` recibe los cargadores como argumento para poder probarlo con un glob vacío o
 * con un módulo de muestra; la instancia real se crea con `import.meta.glob`.
 */
import { moduloPorNumero } from '@/data/modulos';
import type { NumeroModulo } from '@/data/modulos';
import { formatearErrores } from './errores';
import { ModuloContenidoSchema } from './schema';
import type { ModuloContenido } from './schema';

export type CargadorContenido = () => Promise<unknown>;
export type CargadoresContenido = Readonly<Record<string, CargadorContenido>>;

export interface EntradaModulo {
  numero: NumeroModulo;
  /** El de src/data/modulos.ts. */
  slug: string;
  /** Nombre de la carpeta, `m{numero}_{slug}`. */
  carpeta: string;
}

export type MotivoFallo =
  'numero_invalido' | 'sin_contenido' | 'error_de_carga' | 'contenido_invalido';

export type ResultadoCarga =
  | { ok: true; modulo: ModuloContenido; entrada: EntradaModulo }
  | {
      ok: false;
      motivo: MotivoFallo;
      /** Mensaje en español apto para mostrar al estudiante. */
      mensaje: string;
      /** Detalle para quien escribe el contenido (vacío salvo en `contenido_invalido` y `error_de_carga`). */
      errores: string[];
    };

export interface OpcionesRegistro {
  /** Escribir los errores de validación en la consola. Por defecto, solo en desarrollo. */
  registrarErrores?: boolean;
}

export interface RegistroModulos {
  /** Módulos con contenido, ordenados por número. */
  listarModulos: () => EntradaModulo[];
  hayContenido: (numero: number) => boolean;
  cargarModulo: (numero: number) => Promise<ResultadoCarga>;
  /** Rutas de `content.json` que no siguen `m{n}_{slug}` con el slug oficial (o repetidas). */
  rutasNoReconocidas: () => string[];
  /** Olvida los módulos ya cargados (para pruebas). */
  limpiarCache: () => void;
}

const PATRON_RUTA = /(?:^|\/)modules\/(m([1-6])_([a-z0-9_]+))\/content\.json$/;

function fallo(
  motivo: MotivoFallo,
  mensaje: string,
  errores: string[] = [],
): Extract<ResultadoCarga, { ok: false }> {
  return { ok: false, motivo, mensaje, errores };
}

export function crearRegistro(
  cargadores: CargadoresContenido,
  opciones: OpcionesRegistro = {},
): RegistroModulos {
  const registrarErrores = opciones.registrarErrores ?? import.meta.env.DEV;
  const porNumero = new Map<number, { entrada: EntradaModulo; cargar: CargadorContenido }>();
  const noReconocidas: string[] = [];

  for (const ruta of Object.keys(cargadores).sort()) {
    const coincidencia = PATRON_RUTA.exec(ruta);
    const numero = coincidencia ? Number(coincidencia[2]) : NaN;
    const oficial = moduloPorNumero(numero);
    const cargar = cargadores[ruta];
    if (
      !coincidencia ||
      !oficial ||
      !cargar ||
      coincidencia[3] !== oficial.slug ||
      porNumero.has(numero)
    ) {
      noReconocidas.push(ruta);
      continue;
    }
    porNumero.set(numero, {
      entrada: { numero: oficial.numero, slug: oficial.slug, carpeta: coincidencia[1] ?? '' },
      cargar,
    });
  }

  const cache = new Map<number, Promise<ResultadoCarga>>();

  async function cargarSinCache(
    numero: number,
    registro: { entrada: EntradaModulo; cargar: CargadorContenido },
  ): Promise<ResultadoCarga> {
    let bruto: unknown;
    try {
      bruto = await registro.cargar();
    } catch (error) {
      return fallo(
        'error_de_carga',
        'No pudimos cargar el contenido del módulo. Revisa tu conexión e inténtalo de nuevo.',
        [error instanceof Error ? error.message : String(error)],
      );
    }
    const resultado = ModuloContenidoSchema.safeParse(bruto);
    if (!resultado.success) {
      const errores = formatearErrores(resultado.error, bruto);
      if (registrarErrores) {
        console.error(
          `[contenido] ${registro.entrada.carpeta}/content.json no es válido:\n - ${errores.join('\n - ')}`,
        );
      }
      return fallo(
        'contenido_invalido',
        'El contenido de este módulo no es válido y no se puede mostrar. Avisa al equipo del OVA.',
        errores,
      );
    }
    if (resultado.data.numero !== numero) {
      const errores = [
        `numero: la carpeta ${registro.entrada.carpeta} es del módulo ${numero} pero el contenido declara el módulo ${resultado.data.numero}.`,
      ];
      if (registrarErrores) console.error(`[contenido] ${errores[0]}`);
      return fallo(
        'contenido_invalido',
        'El contenido de este módulo no es válido y no se puede mostrar. Avisa al equipo del OVA.',
        errores,
      );
    }
    return { ok: true, modulo: resultado.data, entrada: registro.entrada };
  }

  return {
    listarModulos: () =>
      [...porNumero.values()].map((r) => r.entrada).sort((a, b) => a.numero - b.numero),
    hayContenido: (numero) => porNumero.has(numero),
    cargarModulo(numero) {
      if (!Number.isInteger(numero) || !moduloPorNumero(numero)) {
        return Promise.resolve(
          fallo(
            'numero_invalido',
            `El módulo ${String(numero)} no existe: hay módulos del 1 al 6.`,
          ),
        );
      }
      const previo = cache.get(numero);
      if (previo) return previo;
      const registro = porNumero.get(numero);
      if (!registro) {
        return Promise.resolve(
          fallo('sin_contenido', 'El contenido de este módulo todavía no está disponible.'),
        );
      }
      const promesa = cargarSinCache(numero, registro).then((resultado) => {
        // Solo se recuerdan los éxitos: un fallo de red o de validación se puede reintentar.
        if (!resultado.ok) cache.delete(numero);
        return resultado;
      });
      cache.set(numero, promesa);
      return promesa;
    },
    rutasNoReconocidas: () => [...noReconocidas],
    limpiarCache: () => cache.clear(),
  };
}

/** Registro real: un `content.json` por carpeta `src/modules/m{n}_{slug}/`. Vacío es válido. */
const registro = crearRegistro(
  import.meta.glob('../modules/*/content.json', { import: 'default' }),
);

export function listarModulos(): EntradaModulo[] {
  return registro.listarModulos();
}

export function hayContenido(numero: number): boolean {
  return registro.hayContenido(numero);
}

export function cargarModulo(numero: number): Promise<ResultadoCarga> {
  return registro.cargarModulo(numero);
}

export function rutasNoReconocidas(): string[] {
  return registro.rutasNoReconocidas();
}
