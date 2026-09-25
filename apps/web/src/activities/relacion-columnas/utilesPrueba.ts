/**
 * Utilidades de las pruebas de `relacion-columnas`. Solo las importan archivos .test.ts (no entran
 * al build).
 */
import type { ActividadRelacionColumnas } from '@/content/schema';
import { listarActividades } from '@/content/consultas';
import { muestra, validar } from '@/content/__fixtures__/utiles';

export interface OpcionesActividad {
  id?: string;
  /** Número de pares (y de elementos de A). */
  pares?: number;
  /** Elementos de B sin pareja. */
  distractores?: number;
  barajar?: boolean;
  aprobacion_min?: number;
  puntaje_max?: number;
  /** Texto de un elemento: por defecto `A 1`, `B 1`... */
  texto?: (columna: 'a' | 'b', indice: number) => string;
  /** Id de un elemento: por defecto `ea_1`, `eb_1`... */
  idElemento?: (columna: 'a' | 'b', indice: number) => string;
  explicacion?: (indice: number) => string;
}

/** Actividad sintética con las dimensiones que se pidan (incluso fuera de los límites del esquema). */
export function crearActividad(opciones: OpcionesActividad = {}): ActividadRelacionColumnas {
  const {
    id = 'm1_relacion_prueba',
    pares = 4,
    distractores = 1,
    barajar = true,
    aprobacion_min,
    puntaje_max = 30,
    texto = (columna, i) => `${columna === 'a' ? 'Elemento' : 'Función'} ${i + 1}`,
    idElemento = (columna, i) => `e${columna}_${i + 1}`,
    explicacion = (i) => `Explicación de la pareja número ${i + 1} de la actividad.`,
  } = opciones;
  const elementos = (columna: 'a' | 'b', n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: idElemento(columna, i),
      texto: texto(columna, i),
    }));
  return {
    id,
    tipo: 'relacion-columnas',
    titulo: 'Une cada elemento con su pareja',
    instrucciones: 'Toca un elemento y luego la pareja que le corresponde. Sobra alguno.',
    obligatoria: true,
    ...(aprobacion_min !== undefined ? { aprobacion_min } : {}),
    puntaje_max,
    penalizacion: { por_intento: 0.1, piso: 0.4 },
    retroalimentacion: {
      correcta: 'Excelente: distingues bien cada pareja.',
      parcial: 'Vas bien, pero repasa las parejas que fallaste.',
      incorrecta: 'Repasa el contenido de la sección y vuelve a intentarlo.',
    },
    concepto: 'Concepto de prueba',
    config: {
      columna_a: { titulo: 'Columna A', elementos: elementos('a', pares) },
      columna_b: { titulo: 'Columna B', elementos: elementos('b', pares + distractores) },
      pares: Array.from({ length: pares }, (_, i) => ({
        id: `par_${i + 1}`,
        a: idElemento('a', i),
        b: idElemento('b', i),
        explicacion: explicacion(i),
      })),
      barajar,
    },
  };
}

/** La actividad de relación del módulo de muestra, ya validada por el esquema. */
export function actividadDeMuestra(): ActividadRelacionColumnas {
  const modulo = validar(muestra()).modulo!;
  return listarActividades(modulo).find((u) => u.actividad.tipo === 'relacion-columnas')!
    .actividad as ActividadRelacionColumnas;
}

/** Clon profundo para modificar sin tocar el original. */
export function clonar<T>(valor: T): T {
  return structuredClone(valor);
}
