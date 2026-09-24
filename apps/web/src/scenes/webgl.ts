/**
 * Detección de WebGL. three.js (desde r163) solo funciona con WebGL 2, así que es lo único
 * que se comprueba. Si el navegador no lo ofrece, la escena muestra un mensaje en lugar de
 * un lienzo en blanco o una excepción dentro del renderizador.
 */

/** Crea un lienzo desechable, pide un contexto WebGL 2 y lo libera de inmediato. */
export function hayWebGL2(doc: Document = document): boolean {
  try {
    const lienzo = doc.createElement('canvas');
    const gl = lienzo.getContext('webgl2');
    if (!gl) return false;
    // Libera el contexto de prueba: los navegadores limitan los contextos activos (~16).
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
