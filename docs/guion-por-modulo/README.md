# De guion a `content.json`: cómo se convierte

Los guiones de esta carpeta (`m1_…md` a `m6_…md`) son la **fuente de verdad del contenido**. Cada uno se
convierte, con una herramienta determinista, en el `content.json` de su módulo
(`apps/web/src/modules/m{n}_{slug}/content.json`), que es lo que lee la aplicación. Así el contenido de los
seis módulos (unos 150 KB de JSON cada uno) no se teclea a mano y el docente puede corregir un guion y
regenerar.

> Todos los guiones y sus `content.json` son un **borrador pendiente de validación del docente**
> (`estado_revision.estado = "borrador"`). Esta carpeta no cambia los guiones: solo se leen.

```text
docs/guion-por-modulo/m3_construyendo_hueso.md          (el guion: se edita aquí)
        │   tools/guiones/convertir.py                  (Python, determinista)
        ▼
apps/web/src/modules/m3_construyendo_hueso/content.json (generado)
        │   apps/web/scripts/validar-modulo.mjs         (esquema y auditorías reales del proyecto)
        ▼
errores estructurales  ·  errores que solo dependen de los SVG
```

## Regenerar

Desde la raíz del repositorio. `uv` no está en el PATH de Git Bash: antepónlo
(`export PATH="/c/Users/Samuel/AppData/Roaming/Python/Python314/Scripts:$PATH"`). PyYAML se pide a `uv` sin tocar
el proyecto (`--no-project`).

```bash
uv run --no-project --with pyyaml python tools/guiones/convertir.py 3            # un módulo
uv run --no-project --with pyyaml python tools/guiones/convertir.py todos        # los seis
uv run --no-project --with pyyaml python tools/guiones/convertir.py todos --comprobar   # compara, NO escribe
```

| Opción | Efecto |
|---|---|
| `--comprobar` | No escribe. Compara lo que se generaría con el `content.json` actual y sale con código 1 si difiere o no existe. Sirve para saber si el guion cambió o si alguien editó el JSON a mano |
| `--detalle` | Lista cada corrección automática (por defecto se resumen por tipo) |
| `--silencioso` | Solo el resumen, sin el informe |
| `--estricto` | Código 1 si el informe tiene elementos «A REVISAR» |
| `--guiones`, `--web`, `--salida` | Otras carpetas (pruebas) |

**Determinista:** mismo guion (y mismos SVG en `apps/web/public/images/`, de donde se lee el `viewBox`), mismos
bytes. Claves en orden estable, UTF-8, saltos `\n`, sin marcas de tiempo (lo comprueban las pruebas, también con
distinta semilla de hash).

**Formato de prettier.** Los `content.json` se escriben ya con el formato que prettier deja igual
(`tools/guiones/conversor/formato_json.py`), porque `pnpm format:check` revisa esos archivos. Así un
`prettier --write` posterior no los cambia y `--comprobar` sigue detectando solo cambios reales.

**Cuidado al refinar a mano.** Regenerar **sobrescribe** el `content.json`. Cuando alguien empiece a refinar un
módulo directamente en el JSON, debe avisar antes de regenerar (`--comprobar` dice si difiere). Lo que se
quiera conservar en el largo plazo se corrige en el guion.

### El informe

Cada conversión imprime un informe con la **ubicación exacta** (`archivo.md:línea · actividad · campo`) de todo lo
que decidió el convertidor. Nada se descarta en silencio:

- **A REVISAR:** lo que el convertidor no pudo decidir con seguridad (un texto que excede el límite del esquema,
  una sección con demasiados bloques, un dato que falta). El valor se emite **tal cual, sin recortar**, y el
  esquema lo marcará; hay que resolverlo con el docente o a mano.
- **CORREGIDO AUTOMÁTICAMENTE:** reglas deterministas y sin pérdida de contenido (ver la tabla siguiente). Con
  `--detalle` sale cada una con su ubicación.
- **OMITIDO:** datos del guion que el esquema no tiene dónde guardar (por ejemplo `interaccion`,
  `zona_anatomica`, `que_se_anima`, `cambia_en_escena`), agrupados por campo.

Además el convertidor comprueba que **no se pierda ni una palabra** del «#### Contenido» de cada sección
(`tools/guiones/conversor/cobertura.py`): si faltara alguna, sale como «A REVISAR».

## Validar

`apps/web/scripts/validar-modulo.mjs` valida **un** módulo con el esquema y las auditorías reales de
`apps/web/src/content` (esquema, nombre de carpeta, existencia y reglas de sus SVG). Es lo mismo que
`src/content/modulos_reales.test.ts` pero sin recorrer los demás módulos. No instala nada: carga los `.ts` con
Vite, que ya es dependencia.

```bash
pnpm --filter @ova/web exec node scripts/validar-modulo.mjs 3
pnpm --filter @ova/web exec node scripts/validar-modulo.mjs 3 --advertencias   # + términos del glosario sin enlazar, etc.
pnpm --filter @ova/web exec node scripts/validar-modulo.mjs 3 --json           # para otras herramientas
pnpm --filter @ova/web exec node scripts/validar-modulo.mjs 3 --archivo ruta/a/otro.json
```

Cada error sale en **una línea con su ruta y el id del elemento** (`secciones[3]{m2_4_osteoclasto}.bloques[11]{…}`),
agrupado en cuatro categorías para separar lo que se resuelve en el contenido de lo que depende de los dibujos:

| Categoría | Quién la resuelve |
|---|---|
| Errores estructurales (esquema, ids, textos, puntaje…) | Quien refina el contenido |
| SVG que no existen | Quien produce los dibujos (`apps/web/public/images/m{n}/`) |
| Capas o grupos que faltan en un SVG | Quien produce los dibujos |
| Otros problemas de SVG (viewBox, reglas de seguridad, tamaño) | Quien produce los dibujos |

Código de salida de `node scripts/validar-modulo.mjs` (pnpm lo convierte en 1 cuando no es 0): **0** todo bien,
**1** hay errores estructurales, **2** solo faltan dibujos o capas, **64** argumentos incorrectos. Cuando el
esquema falla, la auditoría de SVG se intenta igualmente sobre el JSON sin validar («parcial»).

## Pruebas del convertidor

```bash
uv run --no-project --with pyyaml --with pytest python -m pytest tools/guiones/tests -q
uvx ruff check tools/guiones --config tools/guiones/ruff.toml        # y: ruff format --check
```

Usan un guion sintético mínimo (`tests/guion_sintetico.py`) con un bloque de cada clase y una actividad de cada
tipo; cubren los casos de error, el determinismo, la ausencia de `[verificar]` y la conversión de los seis
guiones reales. Una prueba pasa la salida sintética por el **esquema real** (`validar-modulo.mjs`), así que un
cambio del esquema que rompa el convertidor se detecta.

## Qué hace la conversión

| Guion | `content.json` |
|---|---|
| Ficha | `subtitulo` = «Foco»; `duracion_estimada_min` = minutos de la ficha (punto medio si hay rango); `resumen` = Foco + primera oración de «Conexión con el hueso mandibular» |
| Objetivos, glosario, referencias | Tal cual (referencias con `verificada: false`, sin URL si el guion no la trae). Un término de más de 60 caracteres con su expansión entre paréntesis pasa la expansión al inicio de la definición |
| Sección (`### Seccion N.M: …`, `id`) | `secciones[]`; contenido → bloques, actividades al final |
| Párrafos y listas | Bloques `texto`, empaquetados hasta ~1800 caracteres y partidos solo entre párrafos. Un título en negrita solo en su línea abre un bloque con `titulo` |
| `> Clinico:`, `Dato:`, `Atencion:`, `Recuerda:` (con o sin tilde) | Bloques `callout` con su `variante` (la primera letra pasa a mayúscula) |
| Tabla Markdown | Bloque `tabla`. Si no cabe (celda de más de 200 caracteres, criterio de más de 60, encabezado de más de 40, más de 6 columnas o solo 2 columnas), pasa a texto con listas **sin perder nada** |
| `![alt](m1_id_svg)` | Bloque `imagen` (`/images/m1/m1_id_svg.svg`; el guion solo trae una descripción y sirve de `alt` y de `pie`) |
| «Para profundizar (plegable…)», «(profundización para posgrado)», «para quien quiera profundizar» | `nivel: "posgrado"` en ese bloque |
| `[verificar]` | Se quita del texto. Cada marca queda en `estado_revision.pendientes` con el **id del bloque o elemento** donde estaba; `notas` apunta a la sección 12 del guion. Nunca aparece en el texto del estudiante |
| Actividades yaml | La configuración de su tipo (mapeo de nombres: `acierto/error` → `correcta/incorrecta`, `ordenar_pasos` → `ordenar`, `izquierda/derecha` → `columna_a/columna_b`, `nombre` → `etiqueta`, `hotspots` → `nodos`, `distractores` → `rechazo`, `correcta: falso` → booleano; ids de opción y de paso prefijados con el de su pregunta) |
| Evaluación final | `aprobacion_min` con el umbral que propone la ficha del guion (60 o 70 %), si lo dice |
| Banco de preguntas y ganchos del mentor, registro de revisión | **No se transcriben** (alimentan al mentor y al RAG, no son contenido del módulo); las notas de verificación se resumen en `estado_revision` |

### Decisiones provisionales del convertidor

El guion no trae estos datos; el convertidor los deduce con una regla explícita y los anota en el informe. Quien
refine el módulo debe confirmarlos:

| Dato | Regla | Cómo corregirlo |
|---|---|---|
| `viewBox` de cada SVG | El del archivo si ya existe en `public/images/m{n}/`; si no, `0 0 800 600` (`0 0 1000 900` en el módulo 2) | Regenerar cuando el SVG exista |
| `alt` de multicapa, video y arrastre | «Texto alternativo sugerido» del guion o la columna «Qué muestra» de la tabla de ilustraciones (acortado por oraciones si pasa de 300) | Editar el `alt` |
| `ancla` de los hotspots 3D (la mandíbula es una sola malla) | Tabla provisional `ANCLAS_MANDIBULA` en `tools/guiones/conversor/recursos.py`, deducida de la descripción anatómica del guion | Ajustar al inspeccionar el modelo (F0-08 / F1-12) |
| `posicion` de los receptores del arrastre | Rejilla que cumple 52 px de separación y 22 px de margen (el guion solo la da en el módulo 1) | Alinear con las zonas del SVG cuando exista |
| `animacion` del efecto | La del guion; si falta, se deduce de palabras del texto del efecto (inhibición, cristal, reabsorción…) | Cambiarla en el JSON |
| `forma` de las moléculas | Por orden (círculo, hexágono, triángulo, rombo, cuadrado) | Cambiarla |
| Títulos de las columnas de una relación | «Concepto» y «Descripción» (el guion no los trae) | Poner los propios |
| `pista` de un `identificar` sin pista | «Toca la estructura: {nombre}» (así lo describe el guion del módulo 3) | Redactar una pista sin dar el nombre |
| Explicación de cada par de una relación | La explicación del guion o el texto de la derecha (convención que fija el propio guion) | Redactarla |
| Capas visibles de un paso de animación | `capas_visibles` / `cambia_escena.mostrar`; si solo hay texto, las capas de la tabla que la escena nombra | Revisar contra el dibujo |
| `concepto` escrito como id | Se pasa a texto y se recuperan las tildes de las palabras tal como las escribe el guion | Editarlo |
| Ids repetidos en el módulo | Capa repetida en otra ilustración: prefijo con el nombre de su figura (la ilustración que ya la tiene dibujada conserva el id). Molécula repetida: sufijo `_2` | Los SVG deben usar los ids nuevos (tabla de abajo) |
| Instrucciones de más de 400 caracteres | Se quitan las indicaciones de teclado/dedo/ratón; si no basta, las oraciones del medio pasan a un bloque de texto justo antes de la actividad | Revisar el bloque `…_contexto` |
| Avisos o tablas que no caben | Avisos partidos por párrafos; tablas a listas | — |
| Etiqueta de receptor o molécula de más de 40 caracteres | Se corta antes de la última preposición que deje 40 caracteres (o queda la sigla entre paréntesis) y el nombre completo pasa al inicio de la descripción | Poner la etiqueta corta que se prefiera |
| Sección con más de 15 bloques | Se unen textos y avisos consecutivos de la misma variante; después, un aviso pasa a párrafo del texto anterior (con su etiqueta en negrita); si no basta, «A REVISAR» | Dividir la sección |

Lo que **no** se hace todavía: enlazar los términos del glosario dentro de los textos (`[término](glosario:id)`);
`validar-modulo.mjs --advertencias` lista los que faltan.

## Estado por módulo (2026-09-24)

Resultado de convertir los seis guiones y validarlos. Queda **un solo error estructural** en los seis módulos, y
es de texto que excede un límite del esquema sin que el convertidor pueda decidir qué palabras sobran (nunca
recorta). Lo que depende de los SVG cambia mientras se dibujan: vuelve a ejecutar el validador para verlo al día.

| Módulo | Esquema | Errores estructurales | Depende de SVG (dibujos aún no producidos o por ajustar) |
|---|---|---|---|
| 1. Conociendo el hueso | válido | 0 | Falta `m1_hormonas_oseas_escena` |
| 2. Descubriendo sus células | no válido | 1 (ver abajo) | Faltan `m2_osteocito_lagunar` y `m2_ligamento_periodontal`; en el primero, las capas renombradas (ver «Capas renombradas») |
| 3. Construyendo hueso | válido | 0 | En `m3_sensores_mecanicos.svg` faltan los grupos renombrados `sensores_mecanicos_canal_piezo1` y `sensores_mecanicos_cilio_primario` (ver «Capas renombradas») |
| 4. Transformando la matriz | válido | 0 | Ninguno hoy (vigilar `zona_hueco` de `m4_fibrilla_mineralizada`, ver «Capas renombradas») |
| 5. Renovando el hueso | válido | 0 | Faltan `m5_movimiento_ortodontico_pdl`, `m5_reparacion_fractura_fases`, `m5_cicatrizacion_alveolo_fases`, `m5_equilibrio_remodelado_alteraciones` |
| 6. El paso del tiempo | válido | 0 | Faltan `m6_escena_estrogeno_rankl`, `m6_hueso_normal_osteoporotico`, `m6_reborde_alveolar_cascada`, `m6_atm_cambios_degenerativos`, `m6_prevencion_mapa` |

Comprobado además: las 112 actividades de los guiones están en los JSON (mismos tipos, puntajes, obligatoriedad y
cantidad de preguntas, capas, pares, pasos y nodos); los puntajes suman lo que declara cada ficha (440, 380, 700,
660, 790 y 440); ninguna palabra del contenido de las secciones se pierde; ningún `[verificar]` llega al texto; y
`prettier --check` acepta los seis archivos.

### Errores estructurales restantes (accionables)

| Módulo | Ubicación en el JSON | Ubicación en el guion | Problema y qué hacer |
|---|---|---|---|
| 2 | `objetivos[1]` | `m2_descubriendo_sus_celulas.md:18` | 224 caracteres (máximo 220): «Ordenar las etapas de los linajes osteoblástico (de célula madre mesenquimal a osteocito) y osteoclástico (…), indicando el factor de transcripción o la señal que impulsa cada paso.» Acortarlo (por ejemplo «…, indicando qué impulsa cada paso») o partirlo en dos objetivos, con el docente |

Al resolverlo, el esquema del módulo 2 queda válido y aparecen, si los hay, los errores de referencias cruzadas
(suma de puntos, enlaces al glosario), que hoy no se muestran porque el esquema se detiene antes.

### Correcciones automáticas que conviene conocer

Son deterministas y no pierden texto (con `--detalle` salen todas con su ubicación en el guion):

- **Módulos 2, 4, 5 y 6:** nueve etiquetas de receptor o molécula de más de 40 caracteres se acortaron y el
  nombre completo pasó al inicio de la `descripcion` (por ejemplo «Etapa 1: célula mesenquimal» y, en la
  descripción, «Etapa 1: célula mesenquimal sin factores osteoblásticos. …»; «TRAP» con «Fosfatasa ácida
  resistente al tartrato. …»).
- **Módulos 3 (3.6 y 3.7) y 6 (6.1 y 6.4):** cuatro instrucciones de 418 a 595 caracteres (máximo 400). Se
  quitaron las indicaciones de teclado, dedo o ratón y las oraciones que solo explican la alternativa sin 3D; en
  el 6.1 además una oración de contexto pasó a un bloque de texto (`t_m6_1_arrastre_estrogenos_contexto`) justo antes
  de la actividad.
- **Secciones con muchos bloques** (módulo 1: 1.3 y 1.5; módulo 5: 5.1 y 5.6; módulo 6: 6.1, 6.3 y 6.4): los
  bloques de texto consecutivos se unen (el título del segundo pasa a un subtítulo `####` dentro del primero) y
  los avisos seguidos de la misma variante se unen, para no pasar de 15 bloques con las actividades.
- **Módulo 5 (5.7):** la sección tenía 17 bloques (máximo 15): dos avisos de posgrado pasaron a párrafos del
  bloque «Para profundizar» anterior, con su etiqueta en negrita (**Caso clínico.**, **Atención.**).
- **Módulo 6:** un término del glosario de más de 60 caracteres (ONM…): la expansión pasó a la definición.
- Tablas que no caben en el bloque `tabla` (celda de más de 200 caracteres, criterio de más de 60, encabezado de
  más de 40, dos columnas) pasaron a texto con listas, en los módulos 1, 3, 4, 5 y 6.
- Módulos 3 (`mol_rankl_2`, `mol_noggin_2`) y 5 (`mol_esclerostina_2`, `mol_rankl_2`): moléculas con el mismo id
  en dos actividades; la segunda lleva sufijo `_2`.

### Capas renombradas (para quien dibuja)

Una capa (`<g id>`) es única en todo el módulo (docs/content-schema.md, sección 3). Cuando dos ilustraciones
distintas usaban el mismo id, el convertidor conservó el id en la que ya lo tenía dibujado (o en la primera) y
prefijó la otra con el nombre de su figura. **El `<g id>` del SVG debe llamarse como el nuevo id.** Si el SVG ya
existe y el validador dice «Falta la capa…», es esto.

| Módulo | SVG | Id del guion | Id nuevo en `content.json` (y en el SVG) |
|---|---|---|---|
| 2 | `m2_osteocito_lagunar` | `uniones_comunicantes` | `osteocito_lagunar_uniones_comunicantes` |
| 2 | `m2_osteocito_lagunar` | `matriz_mineralizada` | `osteocito_lagunar_matriz_mineralizada` |
| 3 | `m3_sensores_mecanicos` (ya dibujado) | `canal_piezo1` | `sensores_mecanicos_canal_piezo1` |
| 3 | `m3_sensores_mecanicos` (ya dibujado) | `cilio_primario` | `sensores_mecanicos_cilio_primario` |
| 4 | `m4_fibrilla_mineralizada` | `zona_hueco` | `fibrilla_mineralizada_zona_hueco` |

Si prefieren conservar el id del guion en el SVG y renombrar en la otra ilustración, basta regenerar: el
convertidor deja el id a la ilustración que ya lo tiene dibujado.

## Para quien refina un módulo

1. `python tools/guiones/convertir.py {n}` y leer el informe (A REVISAR primero).
2. `pnpm --filter @ova/web exec node scripts/validar-modulo.mjs {n} --advertencias`.
3. Resolver los estructurales (arriba), luego los pendientes de `estado_revision.pendientes` con el docente
   (cada uno lleva el id del bloque o elemento con la duda y la sección 12 del guion tiene el detalle).
4. Registrar la entrega en `docs/revisiones.md` (CLAUDE.md). Mientras el docente no lo apruebe, el estado sigue
   en `borrador`.

## Módulos pulidos a mano: el convertidor no los sobrescribe

Tras la conversión, cada módulo se termina a mano (enlaces al glosario, figuras rotuladas, posiciones
de los receptores del arrastre, ajustes de textos). Ese trabajo vive solo en `content.json`. Por eso
`convertir.py` **se niega a escribir** un `content.json` que difiera de lo que generaría el guion: imprime
`NO SE ESCRIBIÓ` y sale con código 3. Para ver la diferencia usa `--comprobar`; para sobrescribir a
propósito y perder esas ediciones usa `--forzar`.

Regla práctica: una vez terminado un módulo, `content.json` es la fuente de verdad del contenido que ve el
estudiante. Si el docente corrige el guion, hay que llevar el cambio también a `content.json` (o regenerar
con `--forzar` y repetir el pulido).
