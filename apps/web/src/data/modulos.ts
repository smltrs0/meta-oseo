/**
 * Los seis módulos del OVA. Fuente: docs/briefing-pedagogico.md, "Estructura modular".
 * Si el docente cambia títulos o focos, se cambian aquí (no hay copia en otro lugar).
 * El contenido de cada módulo (secciones, actividades) vive en su `content.json` (F2-01).
 */
import { TOTAL_MODULOS } from '@/config';

export type NumeroModulo = 1 | 2 | 3 | 4 | 5 | 6;

export interface Modulo {
  numero: NumeroModulo;
  /** Identificador estable en snake_case, útil para carpetas de contenido y analítica. */
  slug: string;
  titulo: string;
  /** Foco temático, tal cual el briefing. */
  foco: string;
  /** Densidad de contenido según el briefing (los módulos 3, 4 y 5 son los más robustos). */
  densidad: 'media' | 'alta';
  /** Código del logro que se otorga al completar el módulo (docs/api-contract.md, "Logros"). */
  logro: string;
}

export const MODULOS: readonly Modulo[] = [
  {
    numero: 1,
    slug: 'conociendo_el_hueso',
    titulo: 'Conociendo el hueso',
    foco: 'Generalidades, funciones biomecánicas y metabólicas esenciales',
    densidad: 'media',
    logro: 'primer_hueso',
  },
  {
    numero: 2,
    slug: 'descubriendo_sus_celulas',
    titulo: 'Descubriendo sus células',
    foco: 'Origen y procesos de diferenciación celular',
    densidad: 'media',
    logro: 'celula_por_celula',
  },
  {
    numero: 3,
    slug: 'construyendo_hueso',
    titulo: 'Construyendo hueso',
    foco: 'Mecanotransducción y formación ósea',
    densidad: 'alta',
    logro: 'constructor',
  },
  {
    numero: 4,
    slug: 'transformando_la_matriz',
    titulo: 'Transformando la matriz',
    foco: 'Mineralización del tejido óseo',
    densidad: 'alta',
    logro: 'mineralizador',
  },
  {
    numero: 5,
    slug: 'renovando_el_hueso',
    titulo: 'Renovando el hueso',
    foco: 'Remodelado, reparación y equilibrio óseo',
    densidad: 'alta',
    logro: 'remodelador',
  },
  {
    numero: 6,
    slug: 'el_paso_del_tiempo',
    titulo: 'El paso del tiempo',
    foco: 'Envejecimiento y cambios degenerativos',
    densidad: 'media',
    logro: 'cronista',
  },
];

if (MODULOS.length !== TOTAL_MODULOS) {
  throw new Error(`MODULOS debe tener ${TOTAL_MODULOS} elementos.`);
}

/** Devuelve el módulo o `undefined` si `n` no está entre 1 y 6. */
export function moduloPorNumero(n: number): Modulo | undefined {
  return MODULOS.find((m) => m.numero === n);
}

export function esNumeroModulo(n: unknown): n is NumeroModulo {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= TOTAL_MODULOS;
}
