/**
 * Auditoría completa de los `content.json` reales: la usa la prueba que recorre `src/modules`
 * (modulos_reales.test.ts) como red de seguridad para quienes escriben los módulos, y se puede
 * llamar desde un script. Todo son funciones puras: quien las llama aporta el JSON y el acceso a
 * `public/`.
 *
 * Comprueba, por módulo: el esquema completo (schema.ts), que la carpeta sea `m{n}_{slug}` y
 * que los recursos referenciados existan y cumplan las reglas (svg.ts). Entre módulos: que los
 * ids de actividad no se repitan (la API suma el mejor puntaje por `activity_id`).
 */
import { PATRON_ACTIVITY_ID_API } from './constantes';
import { listarActividades, recorrerCadenas } from './consultas';
import { formatearErrores } from './errores';
import { ModuloContenidoSchema } from './schema';
import type { ModuloContenido } from './schema';
import { auditarRecursos } from './svg';
import { idsGlosarioEnTexto } from './texto';
import type { DependenciasAuditoria } from './svg';

export interface ResultadoAuditoria {
  /** El módulo validado, si el esquema pasó. */
  modulo?: ModuloContenido;
  /** Líneas legibles; vacía si todo está bien. */
  problemas: string[];
}

/** Audita un `content.json` de la carpeta `carpeta` (por ejemplo `m1_conociendo_el_hueso`). */
export function auditarContenidoModulo(
  carpeta: string,
  bruto: unknown,
  dependencias: DependenciasAuditoria,
): ResultadoAuditoria {
  const resultado = ModuloContenidoSchema.safeParse(bruto);
  if (!resultado.success) {
    return { problemas: formatearErrores(resultado.error, bruto, 200) };
  }
  const modulo = resultado.data;
  const problemas: string[] = [];
  const esperada = `m${modulo.numero}_${modulo.slug}`;
  if (carpeta !== esperada) {
    problemas.push(`La carpeta "${carpeta}" debe llamarse "${esperada}".`);
  }
  for (const p of auditarRecursos(modulo, dependencias)) {
    const donde = p.usadoPor ? ` (usado por ${p.usadoPor})` : '';
    problemas.push(`Recurso ${p.ruta}${donde}: ${p.mensaje}`);
  }
  return { modulo, problemas };
}

/**
 * Comprobaciones entre módulos: números distintos y ids de actividad únicos en todo el OVA (y
 * con el formato que acepta la API).
 */
export function auditarEntreModulos(modulos: readonly ModuloContenido[]): string[] {
  const problemas: string[] = [];
  const numeros = new Map<number, string>();
  const actividades = new Map<string, number>();
  for (const modulo of modulos) {
    if (numeros.has(modulo.numero)) {
      problemas.push(`El módulo ${modulo.numero} está definido dos veces.`);
    }
    numeros.set(modulo.numero, modulo.slug);
    for (const { actividad } of listarActividades(modulo)) {
      if (!PATRON_ACTIVITY_ID_API.test(actividad.id)) {
        problemas.push(`El id de actividad "${actividad.id}" no es válido para la API.`);
      }
      const otro = actividades.get(actividad.id);
      if (otro !== undefined) {
        problemas.push(
          `El id de actividad "${actividad.id}" está en los módulos ${otro} y ${modulo.numero}.`,
        );
      }
      actividades.set(actividad.id, modulo.numero);
    }
  }
  return problemas;
}

/* -------------------------------------------------------------------------------------------
 * Advertencias (no hacen fallar nada: son cosas que un humano debe mirar)
 * ----------------------------------------------------------------------------------------- */

/**
 * Advertencias de un módulo ya válido:
 *  - términos del glosario que ningún texto enlaza con `[..](glosario:id)` (un término definido y
 *    nunca usado suele ser un olvido);
 *  - cuántos pendientes de revisión quedan para el docente.
 */
export function advertenciasDeModulo(modulo: ModuloContenido): string[] {
  const advertencias: string[] = [];
  const usados = new Set<string>();
  recorrerCadenas(modulo, [], (texto) => {
    for (const id of idsGlosarioEnTexto(texto)) usados.add(id);
  });
  // Los enlaces del propio glosario (una definición que cita otro término) también cuentan.
  for (const termino of modulo.glosario) {
    if (!usados.has(termino.id)) {
      advertencias.push(
        `Módulo ${modulo.numero}: el término "${termino.id}" del glosario no está enlazado desde ningún texto.`,
      );
    }
  }
  const pendientes = modulo.estado_revision.pendientes.length;
  if (pendientes > 0) {
    advertencias.push(
      `Módulo ${modulo.numero}: ${pendientes} pendiente(s) de revisión para el docente (estado_revision.pendientes).`,
    );
  }
  return advertencias;
}

/**
 * Advertencias entre módulos: el mismo término del glosario (`id`) con una definición distinta en
 * dos módulos. A veces es legítimo (cada módulo lo enfoca distinto), pero suele ser dos agentes
 * que lo redactaron por separado: conviene que el docente lo confirme.
 */
export function advertenciasEntreModulos(modulos: readonly ModuloContenido[]): string[] {
  const advertencias: string[] = [];
  const definiciones = new Map<string, { numero: number; definicion: string }>();
  for (const modulo of modulos) {
    for (const termino of modulo.glosario) {
      const previa = definiciones.get(termino.id);
      if (previa && previa.definicion !== termino.definicion) {
        advertencias.push(
          `El término "${termino.id}" tiene definiciones distintas en los módulos ${previa.numero} y ${modulo.numero}.`,
        );
      } else if (!previa) {
        definiciones.set(termino.id, { numero: modulo.numero, definicion: termino.definicion });
      }
    }
  }
  return advertencias;
}
