/* global console, process */
/**
 * Valida UN módulo (`src/modules/m{n}_{slug}/content.json`) con el esquema y las auditorías reales
 * de `src/content` (esquema, carpeta, recursos de `public/`), sin recorrer los demás módulos.
 * Es lo mismo que hace `src/content/modulos_reales.test.ts`, pero para un solo módulo y con los
 * errores agrupados para que se vea qué depende del contenido y qué depende de los dibujos.
 *
 * Uso (desde la raíz del repositorio):
 *   pnpm --filter @ova/web exec node scripts/validar-modulo.mjs <n>
 *   pnpm --filter @ova/web exec node scripts/validar-modulo.mjs 3 --advertencias
 *   pnpm --filter @ova/web exec node scripts/validar-modulo.mjs 3 --json
 *
 * <n> es el número del módulo (1 a 6). Opciones:
 *   --advertencias   muestra también las advertencias (términos sin enlazar, pendientes...)
 *   --json           imprime el resultado como JSON (para otras herramientas)
 *   --archivo <ruta> valida ese JSON en lugar del content.json del módulo (pruebas, borradores)
 *
 * Código de salida: 0 todo bien; 1 hay errores estructurales; 2 solo faltan dibujos o capas de
 * dibujos (los agentes que producen los SVG los resuelven).
 *
 * Carga los `.ts` del proyecto con Vite (ya es una dependencia): sin instalar nada. Un
 * servidor de Vite en modo middleware transforma `src/content/*.ts` y resuelve el alias `@/`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ_WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Categorías en que se reparten los problemas, en el orden en que se muestran. */
const CATEGORIAS = [
  ['estructurales', 'ERRORES ESTRUCTURALES (esquema, ids, textos, puntaje...)'],
  ['svg_faltante', 'SVG QUE NO EXISTEN (los produce el agente ilustrador)'],
  ['capa_faltante', 'CAPAS O GRUPOS QUE FALTAN EN UN SVG (los resuelve el ilustrador)'],
  ['svg_reglas', 'OTROS PROBLEMAS DE SVG (viewBox, reglas de seguridad, tamaño...)'],
];

/** Reparte un problema de `auditarContenidoModulo` en su categoría. */
export function clasificar(linea) {
  if (!linea.startsWith('Recurso ')) return 'estructurales';
  if (/: El archivo no existe en apps\/web\/public\./.test(linea)) return 'svg_faltante';
  if (
    /: Falta (?:la capa|el grupo) <g id=|existe pero no est[aá] en un <g>|no es hijo directo/.test(
      linea,
    )
  ) {
    return 'capa_faltante';
  }
  return 'svg_reglas';
}

function leerArgumentos(argv) {
  const opciones = { numero: null, advertencias: false, json: false, archivo: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--advertencias') opciones.advertencias = true;
    else if (arg === '--json') opciones.json = true;
    else if (arg === '--archivo') opciones.archivo = argv[++i] ?? null;
    else if (/^[1-6]$/.test(arg)) opciones.numero = Number(arg);
    else {
      console.error(
        `Argumento desconocido: "${arg}". Uso: validar-modulo.mjs <1-6> [--advertencias] [--json] [--archivo ruta]`,
      );
      process.exit(64);
    }
  }
  if (opciones.numero === null) {
    console.error(
      'Falta el número del módulo (1 a 6). Uso: validar-modulo.mjs <1-6> [--advertencias] [--json] [--archivo ruta]',
    );
    process.exit(64);
  }
  return opciones;
}

async function main() {
  const opciones = leerArgumentos(process.argv.slice(2));
  const servidor = await createServer({
    configFile: false,
    root: RAIZ_WEB,
    logLevel: 'error',
    appType: 'custom',
    resolve: { alias: { '@': resolve(RAIZ_WEB, 'src') } },
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  let codigo;
  try {
    const { moduloPorNumero } = await servidor.ssrLoadModule('/src/data/modulos.ts');
    const auditoria = await servidor.ssrLoadModule('/src/content/auditoria.ts');
    const svg = await servidor.ssrLoadModule('/src/content/svg.ts');

    const oficial = moduloPorNumero(opciones.numero);
    const carpeta = `m${opciones.numero}_${oficial.slug}`;
    const ruta = opciones.archivo
      ? resolve(process.cwd(), opciones.archivo)
      : resolve(RAIZ_WEB, 'src', 'modules', carpeta, 'content.json');
    if (!existsSync(ruta)) {
      console.error(
        `No existe ${ruta}. Genéralo con: python tools/guiones/convertir.py ${opciones.numero}`,
      );
      process.exit(3);
    }
    let bruto;
    try {
      bruto = JSON.parse(readFileSync(ruta, 'utf8'));
    } catch (error) {
      console.error(`content.json no es JSON válido (${ruta}): ${error.message}`);
      process.exit(3);
    }

    const dependencias = {
      leerSvg: (rutaPublica) => {
        const archivo = resolve(RAIZ_WEB, 'public', `.${rutaPublica}`);
        return existsSync(archivo) ? readFileSync(archivo, 'utf8') : undefined;
      },
      existe: (rutaPublica) => existsSync(resolve(RAIZ_WEB, 'public', `.${rutaPublica}`)),
    };

    const { modulo, problemas } = auditoria.auditarContenidoModulo(carpeta, bruto, dependencias);
    const grupos = Object.fromEntries(CATEGORIAS.map(([clave]) => [clave, []]));
    for (const linea of problemas) grupos[clasificar(linea)].push(linea);

    // Si el esquema falla, la auditoría se detiene ahí y no mira los dibujos. Se intenta igualmente,
    // sobre el JSON sin validar, para separar ya lo que depende de los SVG (mejor esfuerzo).
    let parcial = false;
    if (!modulo) {
      try {
        const recursos = svg.auditarRecursos(bruto, dependencias);
        parcial = true;
        for (const p of recursos) {
          const donde = p.usadoPor ? ` (usado por ${p.usadoPor})` : '';
          const linea = `Recurso ${p.ruta}${donde}: ${p.mensaje}`;
          grupos[clasificar(linea)].push(linea);
        }
      } catch {
        // El JSON está tan roto que ni se pueden listar sus recursos: solo se muestran los estructurales.
      }
    }

    const advertencias =
      modulo && opciones.advertencias ? auditoria.advertenciasDeModulo(modulo) : [];
    const estructurales = grupos.estructurales.length;
    const deSvg = CATEGORIAS.slice(1).reduce((suma, [clave]) => suma + grupos[clave].length, 0);
    codigo = estructurales > 0 ? 1 : deSvg > 0 ? 2 : 0;

    if (opciones.json) {
      console.log(
        JSON.stringify(
          {
            modulo: opciones.numero,
            carpeta,
            esquemaValido: Boolean(modulo),
            ...grupos,
            advertencias,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(
        `Módulo ${opciones.numero} (${carpeta}): ${modulo ? 'el esquema es válido' : 'el esquema NO es válido'}`,
      );
      for (const [clave, titulo] of CATEGORIAS) {
        const lineas = grupos[clave];
        const nota = parcial && clave !== 'estructurales' ? ' [parcial: el esquema aún falla]' : '';
        console.log(`\n${titulo}: ${lineas.length}${nota}`);
        for (const linea of lineas) console.log(`  - ${linea}`);
      }
      if (opciones.advertencias) {
        console.log(`\nADVERTENCIAS: ${advertencias.length}`);
        for (const linea of advertencias) console.log(`  - ${linea}`);
      }
      console.log(
        `\nResumen: ${estructurales} estructural(es), ${deSvg} dependiente(s) de SVG. ${
          codigo === 0
            ? 'Todo en orden.'
            : codigo === 1
              ? 'Hay errores estructurales.'
              : 'Solo faltan dibujos.'
        }`,
      );
    }
  } finally {
    await servidor.close();
  }
  process.exit(codigo);
}

// Solo se ejecuta al invocarlo directamente (no al importar `clasificar` desde una prueba).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(70);
  });
}
