/**
 * Acceso al JWT guardado en localStorage.
 *
 * localStorage puede lanzar (ventana privada, datos de sitio bloqueados, cuota llena) o no
 * existir (SSR, pruebas): cada acceso va en try/catch y la app funciona sin él, solo que
 * la sesión no sobrevive a recargar la página.
 */
import { CLAVE_TOKEN } from '@/config';

export function leerToken(): string | null {
  try {
    return globalThis.localStorage?.getItem(CLAVE_TOKEN) ?? null;
  } catch {
    return null;
  }
}

export function guardarToken(token: string): void {
  try {
    globalThis.localStorage?.setItem(CLAVE_TOKEN, token);
  } catch {
    // Sin almacenamiento: la sesión vive solo en memoria.
  }
}

export function borrarToken(): void {
  try {
    globalThis.localStorage?.removeItem(CLAVE_TOKEN);
  } catch {
    // Nada que borrar.
  }
}
