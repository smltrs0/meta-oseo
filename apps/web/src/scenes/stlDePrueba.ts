/**
 * Ayudas para las pruebas: construyen STL diminutos en memoria y respuestas de `fetch`
 * falsas. No se importa desde código de la aplicación, así que no entra en el build.
 */

export type Punto3 = [number, number, number];
export type Triangulo = [Punto3, Punto3, Punto3];

/** Caja alineada con los ejes, como 12 triángulos que comparten 8 vértices. */
export function triangulosDeCaja(
  centro: Punto3,
  tamano: Punto3, // [ancho en X, fondo en Y, alto en Z]
): Triangulo[] {
  const [cx, cy, cz] = centro;
  const [hx, hy, hz] = [tamano[0] / 2, tamano[1] / 2, tamano[2] / 2];
  const v = (sx: number, sy: number, sz: number): Punto3 => [
    cx + sx * hx,
    cy + sy * hy,
    cz + sz * hz,
  ];
  const [a, b, c, d] = [v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1)];
  const [e, f, g, h] = [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)];
  return [
    [a, c, b],
    [a, d, c], // base (z-)
    [e, f, g],
    [e, g, h], // tapa (z+)
    [a, b, f],
    [a, f, e], // y-
    [d, g, c],
    [d, h, g], // y+
    [a, e, h],
    [a, h, d], // x-
    [b, c, g],
    [b, g, f], // x+
  ];
}

/** STL binario: 80 bytes de cabecera, contador de triángulos y 50 bytes por triángulo. */
export function stlBinario(triangulos: Triangulo[]): ArrayBuffer {
  const bytes = new ArrayBuffer(84 + 50 * triangulos.length);
  const vista = new DataView(bytes);
  vista.setUint32(80, triangulos.length, true);
  triangulos.forEach((triangulo, i) => {
    let desplazamiento = 84 + 50 * i + 12; // se deja la normal a cero
    for (const vertice of triangulo) {
      for (const coordenada of vertice) {
        vista.setFloat32(desplazamiento, coordenada, true);
        desplazamiento += 4;
      }
    }
  });
  return bytes;
}

/** STL ASCII de un solo triángulo. */
export function stlAscii(): ArrayBuffer {
  const texto = [
    'solid prueba',
    'facet normal 0 0 1',
    ' outer loop',
    '  vertex 0 0 0',
    '  vertex 1 0 0',
    '  vertex 0 1 0',
    ' endloop',
    'endfacet',
    'endsolid prueba',
  ].join('\n');
  return new TextEncoder().encode(texto).buffer as ArrayBuffer;
}

export type OpcionesRespuesta = {
  ok?: boolean;
  status?: number;
  tipo?: string;
  /** Valor de la cabecera Content-Length; `null` para omitirla. */
  longitud?: number | null;
  fragmentos?: Uint8Array[];
  /** Sin `body` legible (navegadores antiguos): se usa `arrayBuffer()`. */
  sinCuerpo?: boolean;
};

/** Respuesta de `fetch` mínima, con cuerpo legible por fragmentos. */
export function respuestaFalsa({
  ok = true,
  status = 200,
  tipo = 'model/stl',
  longitud = null,
  fragmentos = [],
  sinCuerpo = false,
}: OpcionesRespuesta = {}): Response {
  const cabeceras = new Headers({ 'content-type': tipo });
  if (longitud !== null) cabeceras.set('content-length', String(longitud));
  let siguiente = 0;
  const total = fragmentos.reduce((suma, f) => suma + f.byteLength, 0);
  const cuerpo = sinCuerpo
    ? null
    : {
        getReader: () => ({
          read: async () =>
            siguiente < fragmentos.length
              ? { done: false, value: fragmentos[siguiente++] }
              : { done: true, value: undefined },
        }),
      };
  return {
    ok,
    status,
    headers: cabeceras,
    body: cuerpo,
    arrayBuffer: async () => {
      const unido = new Uint8Array(total);
      let desplazamiento = 0;
      for (const f of fragmentos) {
        unido.set(f, desplazamiento);
        desplazamiento += f.byteLength;
      }
      return unido.buffer;
    },
  } as unknown as Response;
}

/** Trocea un buffer en fragmentos de `tamano` bytes (el último puede ser menor). */
export function trocear(bytes: ArrayBuffer, tamano: number): Uint8Array[] {
  const origen = new Uint8Array(bytes);
  const fragmentos: Uint8Array[] = [];
  for (let i = 0; i < origen.byteLength; i += tamano) {
    fragmentos.push(origen.slice(i, i + tamano));
  }
  return fragmentos;
}
