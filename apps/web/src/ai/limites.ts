/**
 * Límites de POST /api/chat (docs/api-contract.md, "Mentor de IA"). El backend valida lo mismo;
 * aquí se aplican antes de enviar para que el estudiante no reciba un 422.
 */

/** Máximo de mensajes por petición (el más antiguo se descarta primero). */
export const MAX_MENSAJES = 40;

/** Máximo de caracteres por mensaje. Pydantic cuenta puntos de código, no unidades UTF-16. */
export const MAX_CARACTERES = 8000;

/** Cuenta caracteres como el backend (un emoji cuenta 1, aunque en UTF-16 ocupe 2). */
export function contarCaracteres(texto: string): number {
  let cuenta = 0;
  for (const _ of texto) cuenta++;
  return cuenta;
}

/** Recorta a `MAX_CARACTERES` puntos de código sin partir un par sustituto. */
export function acotarCaracteres(texto: string, maximo = MAX_CARACTERES): string {
  if (texto.length <= maximo) return texto; // atajo: UTF-16 >= puntos de código
  const puntos = Array.from(texto);
  return puntos.length <= maximo ? texto : puntos.slice(0, maximo).join('');
}
