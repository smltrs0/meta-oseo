/**
 * Hash y verificación de contraseñas con PBKDF2-SHA256 (WebCrypto; Workers admite hasta 100 000
 * iteraciones). Formato guardado: `pbkdf2_sha256$<iteraciones>$<sal base64>$<hash base64>`.
 */
const ITERACIONES = 100_000;
const BYTES_HASH = 32;

const aBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const deBase64 = (texto: string): Uint8Array => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

async function derivar(contrasena: string, sal: Uint8Array, iteraciones: number): Promise<Uint8Array> {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones },
    clave,
    BYTES_HASH * 8,
  );
  return new Uint8Array(bits);
}

export async function hashContrasena(contrasena: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(contrasena, sal, ITERACIONES);
  return `pbkdf2_sha256$${ITERACIONES}$${aBase64(sal)}$${aBase64(hash)}`;
}

/** `true` si la contraseña corresponde al hash guardado. Comparación en tiempo constante. */
export async function verificarContrasena(contrasena: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 4 || partes[0] !== 'pbkdf2_sha256') return false;
  const iteraciones = Number(partes[1]);
  if (!Number.isInteger(iteraciones) || iteraciones < 1 || iteraciones > ITERACIONES) return false;
  const esperado = deBase64(partes[3] as string);
  const obtenido = await derivar(contrasena, deBase64(partes[2] as string), iteraciones);
  if (esperado.length !== obtenido.length) return false;
  let diferencia = 0;
  for (let i = 0; i < esperado.length; i++) diferencia |= (esperado[i] as number) ^ (obtenido[i] as number);
  return diferencia === 0;
}
