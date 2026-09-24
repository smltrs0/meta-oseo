/**
 * Tema claro/oscuro según la preferencia del sistema.
 *
 * El claro es el tema por defecto y el de referencia; el oscuro es opcional y se activa
 * solo si el sistema lo pide. Añade o quita la clase `dark` de <html> (los tokens de
 * src/style.css dependen de ella) y escucha los cambios mientras la página está abierta.
 */
export function aplicarTema(oscuro: boolean): void {
  document.documentElement.classList.toggle('dark', oscuro);
}

/** Devuelve una función que deja de escuchar los cambios de preferencia. */
export function iniciarTema(): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const consulta = window.matchMedia('(prefers-color-scheme: dark)');
  aplicarTema(consulta.matches);
  const alCambiar = (e: MediaQueryListEvent) => aplicarTema(e.matches);
  consulta.addEventListener('change', alCambiar);
  return () => consulta.removeEventListener('change', alCambiar);
}
