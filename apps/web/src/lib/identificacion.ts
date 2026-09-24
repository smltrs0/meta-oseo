/**
 * Identificación del estudiante: tipos, normalización y validación.
 *
 * Reglas idénticas a docs/api-contract.md, sección "Identificación". El servidor las
 * aplica también (app/models/enums.py y los schemas Pydantic); aquí se repiten para dar
 * feedback inmediato sin viajar a la red. Si el contrato cambia, cambian los dos lados.
 *
 * La lista de tipos vive SOLO aquí en el frontend.
 * Supuesto a confirmar con el docente: contexto colombiano.
 */

export const TIPOS_IDENTIFICACION = [
  { codigo: 'CC', etiqueta: 'Cédula de ciudadanía', soloNumerico: true },
  { codigo: 'TI', etiqueta: 'Tarjeta de identidad', soloNumerico: true },
  { codigo: 'CE', etiqueta: 'Cédula de extranjería', soloNumerico: true },
  // El pasaporte es el único que suele llevar letras.
  { codigo: 'PA', etiqueta: 'Pasaporte', soloNumerico: false },
  { codigo: 'RC', etiqueta: 'Registro civil', soloNumerico: true },
  { codigo: 'PEP', etiqueta: 'Permiso especial de permanencia', soloNumerico: true },
  { codigo: 'PPT', etiqueta: 'Permiso por protección temporal', soloNumerico: true },
] as const;

export type TipoIdentificacion = (typeof TIPOS_IDENTIFICACION)[number]['codigo'];

/** Tipo de identificación con el que se abre el formulario (el más común). */
export const TIPO_POR_DEFECTO: TipoIdentificacion = 'CC';

export function esTipoIdentificacion(valor: unknown): valor is TipoIdentificacion {
  return TIPOS_IDENTIFICACION.some((t) => t.codigo === valor);
}

export function etiquetaDeTipo(codigo: TipoIdentificacion): string {
  return TIPOS_IDENTIFICACION.find((t) => t.codigo === codigo)?.etiqueta ?? codigo;
}

/** `true` si el teclado numérico basta para ese tipo (para el atributo `inputmode`). */
export function esSoloNumerico(codigo: TipoIdentificacion): boolean {
  return TIPOS_IDENTIFICACION.find((t) => t.codigo === codigo)?.soloNumerico ?? false;
}

/** Resultado de una validación: el valor ya normalizado, o un mensaje en español. */
export type Validacion = { ok: true; valor: string } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Número de identificación
// ---------------------------------------------------------------------------

export const NUMERO_MIN = 4;
export const NUMERO_MAX = 20;
/** Forma que debe tener el número YA normalizado. */
export const PATRON_NUMERO = /^[A-Z0-9]{4,20}$/;

/**
 * Quita espacios, puntos y guiones y pasa a mayúsculas.
 * `"1.023.456-789"` -> `"1023456789"`; `"ab 123-456"` -> `"AB123456"`.
 */
export function normalizarNumero(crudo: string): string {
  return crudo.replace(/[\s.-]/g, '').toUpperCase();
}

/** Normaliza y valida el número. `valor` (si `ok`) es el número que se envía al servidor. */
export function validarNumero(crudo: string): Validacion {
  const valor = normalizarNumero(crudo);
  if (valor.length === 0) {
    return { ok: false, error: 'Escribe tu número de identificación.' };
  }
  if (!/^[A-Z0-9]+$/.test(valor)) {
    return {
      ok: false,
      error: 'Usa solo letras y números. Los puntos, guiones y espacios se ignoran.',
    };
  }
  if (valor.length < NUMERO_MIN) {
    return {
      ok: false,
      error: `El número es muy corto: debe tener al menos ${NUMERO_MIN} caracteres.`,
    };
  }
  if (valor.length > NUMERO_MAX) {
    return {
      ok: false,
      error: `El número es muy largo: puede tener hasta ${NUMERO_MAX} caracteres.`,
    };
  }
  return { ok: true, valor };
}

// ---------------------------------------------------------------------------
// Nombre y apellido
// ---------------------------------------------------------------------------

export const NOMBRE_MAX = 80;
/** Caracteres de control Unicode (categoría Cc): saltos de línea, tabulaciones, NUL... */
const CARACTER_DE_CONTROL = /\p{Cc}/u;

/** Recorta y colapsa los espacios internos. No cambia mayúsculas ni acentos. */
export function normalizarNombre(crudo: string): string {
  return crudo.trim().replace(/\s+/g, ' ');
}

export type CampoNombre = 'nombre' | 'apellido';

/**
 * Valida nombre o apellido: de 1 a 80 caracteres tras recortar y colapsar espacios,
 * sin caracteres de control. Se aceptan acentos, ñ, apóstrofes y guiones. El texto se
 * guarda "tal cual se escribió" (solo recortado y con espacios colapsados).
 *
 * Los caracteres de control se rechazan ANTES de colapsar: así una tabulación pegada
 * en el campo se considera un error en vez de convertirse en un espacio, que es la
 * lectura más estricta del contrato (el servidor nunca acepta menos que el cliente).
 */
export function validarNombre(crudo: string, campo: CampoNombre = 'nombre'): Validacion {
  if (CARACTER_DE_CONTROL.test(crudo)) {
    return { ok: false, error: `Tu ${campo} tiene caracteres no permitidos.` };
  }
  const valor = normalizarNombre(crudo);
  if (valor.length === 0) {
    return { ok: false, error: `Escribe tu ${campo}.` };
  }
  // Se cuentan puntos de código (como len() de Python en el servidor), no unidades UTF-16.
  if ([...valor].length > NOMBRE_MAX) {
    return { ok: false, error: `Tu ${campo} puede tener hasta ${NOMBRE_MAX} caracteres.` };
  }
  return { ok: true, valor };
}
