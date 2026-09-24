/**
 * Catálogo de logros de Fase 1 (docs/api-contract.md, "Logros"). Es solo el respaldo
 * mientras GET /api/achievements no responde: la fuente de verdad es la API, que siembra
 * el mismo catálogo. Completar el módulo N otorga el logro N.
 */
import type { Logro } from '@/types/api';
import { MODULOS } from './modulos';

const NOMBRES: Record<string, string> = {
  primer_hueso: 'Primer hueso',
  celula_por_celula: 'Célula por célula',
  constructor: 'Constructor',
  mineralizador: 'Mineralizador',
  remodelador: 'Remodelador',
  cronista: 'Cronista',
};

export function catalogoDeRespaldo(): Logro[] {
  return MODULOS.map((m) => ({
    codigo: m.logro,
    nombre: NOMBRES[m.logro] ?? m.logro,
    descripcion: `Completaste el módulo ${m.numero}`,
    obtenido: false,
    obtenido_en: null,
  }));
}
