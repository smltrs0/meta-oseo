# TODO — Arnés de pendientes del OVA "Metabolismo óseo"

Fuente de verdad del estado del proyecto. Se actualiza al terminar cada tarea.
Detalle de fases en [PLAN.md](PLAN.md). Pedagogía en [docs/briefing-pedagogico.md](docs/briefing-pedagogico.md). Repos en [docs/referencias.md](docs/referencias.md).

## Cómo usar este archivo

- Cada tarea tiene un ID estable (`F1-03`). Se referencia por ID en commits y conversaciones.
- Estados: `[ ]` pendiente · `[~]` en curso · `[x]` hecha · `[-]` descartada (anotar por qué).
- `Depende de` lista los IDs que deben estar `[x]` antes de empezar.
- Al terminar una tarea: marcarla, anotar fecha y una línea de resultado si dejó algo no obvio.
- Al empezar una sesión: leer "Estado actual" y "Siguiente tarea", no todo el archivo.

## Estado actual

**Objetivo (indicado por el usuario, 2026-09-23):** entregar el OVA COMPLETO: los 6 módulos interactivos, mentor de IA, gamificación y certificado, listo para dárselo al docente. Ya no se limita al Módulo 1 piloto. Como el docente no ha entregado material, el contenido lo redactamos nosotros a partir del briefing y queda como **borrador pendiente de validación del docente**. Los videos reales no existen: se usan explicaciones animadas y queda el espacio para los del docente.
**Plan de oleadas:** (A) esquema de contenido y contrato de actividades; (B) motor y las 6 actividades; (C) los 6 módulos en paralelo; (D) mentor con RAG sobre el contenido de los módulos, quiz generativo y herramientas; (E) certificado, panel docente, accesibilidad y rendimiento, documentación de entrega; (F) revisión adversarial, extremo a extremo en navegador móvil y correcciones.
**Fase activa:** Fase 1 completa (con verificación visual pendiente). Oleada A (esquema) en su etapa de revisión; guiones de los 6 módulos hechos; backend de resultados/certificado y del panel docente en curso.
**Hecho y verificado de forma independiente (2026-09-24):**
- Backend: 492 pruebas en SQLite y PostgreSQL 18, ruff limpio. F1-03 a F1-07 (núcleo, auth, progreso, logros, mentor SSE con Anthropic simulado; interruptor `MENTOR_SERVER_FALLBACK`).
- Frontend: typecheck, lint, formato y 957 pruebas correctos; build correcto sin el modo de desarrollo. F1-08, F1-09, esquema de contenido (`apps/web/src/content`, `docs/content-schema.md`).
- Guiones de los 6 módulos (`docs/guion-por-modulo/`): redactados, revisados por un revisor científico independiente y ajustados; 2 900 puntos obligatorios en total; ~270 marcas `[verificar]` para el docente. Comprobación estructural independiente sin errores.
- Infra: `docker-compose.yml`, Dockerfiles, nginx y CI escritos y validados en estático (nadie los ha construido ni ejecutado: F6-10).
**En curso:** revisión y ajuste del esquema (3 revisores + ajuste); F5-05 certificado y F2 resultados por actividad con validación en servidor; F6-03 backend del panel docente.
**Pendiente sin ver en pantalla:** F1-10 a F1-13 (menú, HUD, escena, chat): probados por unidades, sin verificación visual en teléfono ni con clave real de Anthropic.
**Siguiente:** oleada B (6 componentes de actividad y página de módulo) y oleada C (un agente por módulo: contenido en datos, SVG y verificación), con ajuste previo de la constante de puntaje por módulo (100 a 600 no admite los 660 a 790 de los módulos 3, 4 y 5).
**Bloqueos:** ninguno técnico. El límite de uso de la cuenta se agota tras unas 3 horas de trabajo intensivo en paralelo.
**Última actualización:** 2026-09-24.

---

## F0 — Contenido y assets

| ID | Estado | Tarea | Depende de | Notas |
|---|---|---|---|---|
| F0-01 | [ ] | Definir plantilla `docs/guion-por-modulo/_plantilla.md`: secciones, texto, imágenes, actividades (tipo + configuración), preguntas, puntaje | — | Enviar al docente |
| F0-02 | [ ] | Guion del Módulo 1 "Conociendo el hueso" con el docente | F0-01 | Piloto |
| F0-03 | [ ] | Guiones de Módulos 2 y 3 | F0-01 | M3 es de alta densidad |
| F0-04 | [ ] | Guiones de Módulos 4, 5 y 6 | F0-01 | M4 y M5 alta densidad |
| F0-05 | [ ] | Inventario de imágenes y videos existentes del docente; lista de lo que falta producir | F0-02 | |
| F0-06 | [ ] | Recolectar documentos del curso en `services/api/corpus/` con permiso de uso | — | gitignored |
| F0-07 | [ ] | Descargar mandíbula BodyParts3D (FJ6399) y huesos adyacentes | — | Ver referencias.md |
| F0-08 | [ ] | Blender: separar cóndilo, rama, ángulo, cuerpo, sínfisis, coronoides, foramen mentoniano como nodos con nombre | F0-07 | snake_case en español |
| F0-09 | [ ] | Exportar GLB con Draco vía `gltf-transform`, < 3 MB por pensar en móvil | F0-08 | |
| F0-10 | [ ] | Modelos GLB low-poly de osteoblasto, osteoclasto, osteocito, célula osteoprogenitora | F0-03 | Buscar CC primero |
| F0-11 | [ ] | Convertir imágenes clave del M1 a SVG multicapa con `id` por estructura | F0-05 | Base de `ActivityLayers` |
| F0-12 | [ ] | `docs/contexto-3d.md`: nodo GLB / capa SVG → concepto → texto ficha → prompt | F0-02, F0-08 | Contrato 3D ↔ IA |
| F0-13 | [ ] | Tabla de puntajes y logros acordada con el docente | F0-02 | Ver PLAN §5 |
| F0-14 | [ ] | IDs PDB de moléculas clave (RANKL, OPG, RUNX2, BMP-2, esclerostina) | F0-03 | Para Mol* |
| F0-15 | [ ] | Crear `docs/revisiones.md` con el formato de ciclo de aprobación | — | Fecha, versión, cambios, aprobación |

## F1 — Esqueleto técnico

| ID | Estado | Tarea | Depende de | Notas |
|---|---|---|---|---|
| F1-01 | [x] | Crear monorepo: `apps/web`, `services/api`, pnpm workspace, `.gitignore`, `README.md` | — | |
| F1-02 | [~] | `docker-compose.yml` con web, api, postgres (perfil prod) | F1-01 | SQLite en dev sin Docker. 2026-09-23: escrito y validado en estático; sin construir ni ejecutar (se verifica en F6-10). Incluye `Dockerfile` de api y web, `nginx.conf` (SPA, caché, CSP, proxy `/api` con SSE), `docker/initdb/01-extensiones.sql` y `.dockerignore`. Solo se publica el 8080 (la base no, por el 5432 de Laragon); `SECRET_KEY` obligatoria |
| F1-03 | [x] | FastAPI en `services/api` con `uv`: `main.py`, `core/settings.py`, `core/db.py` (SQLModel, SQLite/PostgreSQL por env), `/health`, CORS | F1-01 | Base: fastapi-claude-ai-streaming-api |
| F1-04 | [x] | Modelos SQLModel + Alembic: `users` (nombre, apellido, tipo_identificacion, numero_identificacion, nivel, rol; único sobre el par tipo+número), `progress_modulos`, `activity_results`, `achievements`, `user_achievements`, `certificates`, `chat_sessions`, `chat_messages` (tokens), `usage_events` | F1-03 | |
| F1-05 | [x] | Auth mínima: `POST /auth/register` (nombre, apellido, tipo y número de identificación) y `POST /auth/login` (tipo + número) → JWT; dependencia `get_current_user`; `GET /me` | F1-04 | Sin contraseña en esta etapa (PLAN §1) |
| F1-06 | [x] | Endpoints de progreso: `GET/PUT /progress`, `POST /activities/{id}/result`, `GET /achievements` | F1-05 | |
| F1-07 | [x] | Cliente Anthropic en `app/ai/`: `claude-opus-5`, thinking adaptativo, streaming SSE en `POST /chat` sin contexto aún, protegido con JWT | F1-05 | 2026-09-23. `app/ai/`, `routers/mentor.py`, `schemas/chat.py` y `schemas/contexto.py`; fallback del servidor `fallbacks="default"` (beta `server-side-fallback-2026-07-01`); 202 pruebas nuevas con Anthropic simulado (`httpx2.MockTransport`). Verificado con uvicorn contra un Anthropic falso local (streaming, ping, desconexión que cancela y registra el consumo). **Sin llamada real a Anthropic** (no hay clave): probar con clave real antes de mostrarlo. Dependencia: `httpx2` pasa a runtime (el SDK 1.x usa `httpx2`, no `httpx`) |
| F1-08 | [x] | Vue 3 + Vite + TS en `apps/web`: Tailwind, shadcn-vue, Vue Router (ruta por módulo), Pinia; layout móvil primero | F1-01 | 2026-09-23. Typecheck, lint, 142 pruebas, build y arranque de Vite verificados. Falta la revisión visual en móvil real (llega con F1-12). `AppShell` monta los stubs de `MenuCircular`, `HudPuntaje` y `MentorPanel` |
| F1-09 | [x] | Store Pinia `contextoPedagogico` con el tipo del PLAN §3, congelado | F1-08 | Cambios exigen actualizar PLAN, store y schema FastAPI. 2026-09-23: `apps/web/src/stores/contextoPedagogico.ts`, con `toPayload()` validado contra el contrato en pruebas |
| F1-10 | [~] | Componente `MenuCircular` lateral: 6 módulos, estado bloqueado/activo/completado, touch | F1-08 | SVG a medida. 2026-09-23: `MenuCircular.vue` + `components/menu/` (geometría radial pura, estados, `NodoModulo`, animación GSAP con carga perezosa). Escritorio: semicírculo desde el borde izquierdo; móvil: cuarto de círculo desde un botón flotante. Enlaces reales, `<nav>` con botón `aria-expanded` (no `role="menu"`: es navegación), flechas/Inicio/Fin/Escape y `prefers-reduced-motion`. Bloqueo implementado tras `BLOQUEO_SECUENCIAL` (probado con la constante en `true`; el guard de ruta llega con F2-08). Pruebas y contrastes verificados; falta la revisión visual en navegador y móvil real |
| F1-11 | [~] | `HudPuntaje`: puntaje, módulo actual, siguiente logro | F1-09 | 2026-09-23: `HudPuntaje.vue` + `components/hud/`. Píldora de dos líneas en móvil y barra en escritorio; contador animado con moderación (solo cambios con datos ya cargados), anuncio `aria-live="polite"` agrupado y sin repetir la carga inicial, estados de carga y error con reintento, pide el progreso al montarse sin duplicar peticiones. Módulo actual sale de la ruta (el store de contexto no distingue "inicio"). Pruebas verificadas; falta la revisión visual en navegador y móvil real |
| F1-12 | [~] | Escena TresJS "hola mandíbula": `useGLTF` + Draco, `OrbitControls`, probada en teléfono real | F1-08 | STL crudo si F0-09 no está. 2026-09-23: `scenes/MandibulaScene.vue` (+ `stl.ts`, `encuadre.ts`, `webgl.ts`), `views/DemoMandibulaView.vue` y `docs/atribuciones.md`. STL de BodyParts3D FJ6399 (1,1 MB, 23 020 triángulos, CC BY-SA 2.1 JP: obliga a compartir igual el GLB derivado de F0-08/F0-09). Giro y zoom táctiles sin paneo, autorotación que se detiene al tocar y respeta `prefers-reduced-motion`, DPR 1 a 2, clic/toque por malla que llama a `setEstructura("mandibula")`, y mensajes de error si no hay WebGL 2, falla la descarga o se pierde el contexto. Verificado en Chrome a 1280x800 y 390x844 con emulación táctil (hueso visible, clic/toque, arrastre, límites de zoom, sin errores en consola, 20 ciclos de montar y desmontar sin fugas de contextos WebGL) y con 60 pruebas unitarias. Falta: probar en teléfono real (incluido el pellizco con dos dedos) y sustituir el STL por el GLB con Draco cuando exista F0-09. El chunk de la ruta pasa de 843 a 928 kB (249 kB con gzip) |
| F1-13 | [~] | Composable `useMentor` con `fetch` + `ReadableStream` sobre el SSE de `/api/chat`; panel de chat deslizable en móvil | F1-08, F1-07 | Protocolo decidido: SSE propio (ver api-contract.md). 2026-09-23: `ai/sse.ts` (parser), `ai/useMentor.ts`, `ai/markdown.ts` + `ai/sanitizar.ts` (markdown-it sin HTML crudo + DOMPurify) y `components/mentor/` (móvil: hoja inferior modal ajustada al teclado; escritorio: panel lateral no modal). Verificado con streams simulados y con un servidor HTTP real de pruebas (fragmentación, cancelación, corte). Falta la prueba de extremo a extremo con el backend real (F1-07) y la revisión visual en navegador y móvil real. DOMPurify no funciona bajo happy-dom: su capa se prueba con jsdom si está instalado (sugerido como devDependency) |
| F1-14 | [~] | Pantalla de registro/login en la SPA: nombre, apellido, tipo de identificación (select), número; guardar JWT; interceptor fetch | F1-08, F1-05 | Una sola pantalla: si el número existe, entra; si no, pide nombre y apellido. 2026-09-23: SPA lista y probada con fetch simulado (vista, store, guard, cliente). Falta la prueba de extremo a extremo contra el backend real |
| F1-15 | [x] | CI: lint + test en ambos paquetes (ruff + pytest, eslint + vitest) | F1-03, F1-08 | 2026-09-23: `.github/workflows/ci.yml` (api en SQLite y en PostgreSQL pgvector `ova_test`; web con typecheck, lint, test, build y comprobación de que el build no contiene `VITE_DEV_BYPASS_AUTH`). Validado con actionlint y `yaml.safe_load`; los comandos son los de CLAUDE.md. Aún no corrió en GitHub |

**Entregable F1:** registro, menú circular, mandíbula rotando en móvil, chat con streaming.

## F2 — Motor de actividades + Módulo 1

| ID | Estado | Tarea | Depende de | Notas |
|---|---|---|---|---|
| F2-01 | [~] | Esquema TypeScript de `content.json` por módulo: secciones, bloques, actividades | F1-09 | Validar con zod. 2026-09-24: esquema zod entregado (`apps/web/src/content/schema.ts`, guía `docs/content-schema.md`), aún en revisión. Herramientas de contenido: `tools/guiones/convertir.py` (guion a `content.json`, determinista, 75 pruebas) y `apps/web/scripts/validar-modulo.mjs` (valida un módulo con el esquema y las auditorías reales); uso en `docs/guion-por-modulo/README.md` |
| F2-02 | [~] | `ActivityLayers`: SVG multicapa, hover/tap por `id`, texto por capa, completa al visitar capas requeridas | F2-01, F0-11 | 2026-09-24: `activities/multicapa/ActividadMulticapa.vue` (+ `svgCapas.ts`, `logica.ts`, `TextoLinea.vue`). Modos `explorar` e `identificar`; SVG por `fetch` e inline, saneado, con zonas táctiles clonadas y lista de capas siempre disponible; contrato de `activities/types.ts` y batería `pruebasDeContratoActividad` cumplidos. 128 pruebas propias, mutaciones comprobadas; chunk de 26,6 KB (9,4 KB gzip). Falta la revisión visual en navegador y móvil real, y probarlo con los SVG reales de F0-11 (hoy solo con los de `__fixtures__/svg/`) |
| F2-03 | [~] | `ActivityMatch`: relación de columnas, tap-tap y arrastre, feedback inmediato | F2-01 | Componente `activities/relacion-columnas/ActividadRelacionColumnas.vue` con 176 pruebas verdes; falta la verificación visual en navegador (móvil y escritorio) |
| F2-04 | [~] | `ActivityMedia`: video + texto sincronizado, completa al terminar | F2-01 | Componente `activities/video-texto/ActividadVideoTexto.vue` (paneles `PanelAnimacion` y `PanelVideo`) con 186 pruebas verdes, incluida la batería de contrato; typecheck, lint y formato limpios; chunk de build de 22,6 kB. Falta la verificación visual en navegador (móvil y escritorio) |
| F2-05 | [~] | `ActivityScene3D`: GLB con nodos, tap por nodo → ficha, completa al visitar nodos | F2-01, F1-12, F0-09 | 2026-09-24: componente `activities/exploracion-3d/ActividadExploracion3d.vue` (lista de partes siempre operativa; visor perezoso en `scenes/EscenaExploracion.vue` con puntos de interés por `ancla`, vistas con nombre, zoom y transición que respeta reduced-motion; `CamaraExploracion.vue`, `anclas.ts`, `glb.ts`). 105 pruebas en la actividad (batería de contrato incluida) y 166 en `scenes/` y la demo; pruebas de mutación deliberada sin supervivientes. Chunk de la actividad 11,3 kB, escena 61,5 kB y three/TresJS 926 kB (248 kB gzip), solo tras montar la actividad. Usa el STL provisional (F1-12) con anclas aproximadas y busca por nombre en un GLB cuando exista: **F0-09 y F0-10 siguen pendientes** (sin GLB, `celulas` muestra el error del visor y se completa con la lista). Falta la verificación visual en navegador (móvil y escritorio) y con WebGL real |
| F2-06 | [ ] | Tween de cámara GSAP `enfocarEstructura(nodo)` | F2-05 | La usará la IA en F3 |
| F2-07 | [ ] | Store `gamificacion`: puntos por actividad, penalización por intentos, logros, persistencia vía `/activities/{id}/result` | F1-06, F0-13 | |
| F2-08 | [~] | Página de módulo genérica que renderiza `content.json` y bloquea avance hasta completar actividades | F2-02, F2-03, F2-04, F2-05 | 2026-09-24: `views/ModuloView.vue` y `components/modulo/` (cabecera con nota "Contenido en revisión", índice/selector de secciones, bloques texto/callout/imagen/tabla/actividad, glosario en hoja inferior, referencias, avisos de logro, panel de módulo completado con enlace a `/certificado`), `activities/registro.ts` (`import.meta.glob` por convención, con reserva "aún no está disponible") y `stores/actividades.ts` (estado previo del servidor con respaldo local, `POST /activities/{id}/result` con cola de reintento persistida, 422 sin bloqueo, `PUT /progress/{n}` con manejo de 409). `BLOQUEO_SECUENCIAL` vale `true` por defecto (`VITE_BLOQUEO_SECUENCIAL=false` lo desactiva) y `router/guardModulo.ts` explica el bloqueo en vez de rebotar. Pruebas con actividades de reserva y el módulo de muestra. Falta la verificación visual en teléfono y escritorio con los componentes de actividad reales. |
| F2-09 | [x] | Módulo 1 completo: `content.json`, SVGs, textos, actividades, puntajes | F2-08, F0-02 | 2026-09-24: `content.json` de M1 (5 secciones, 18 actividades, 440 puntos: 370 obligatorios y 70 opcionales, 35 pendientes para el docente) con 0 errores de esquema, de recursos y de SVG (los 10 SVG de `public/images/m1/` existen con todas sus capas). Retoques a mano sobre lo generado (anotados en `estado_revision.notas`; regenerar con el convertidor los borra): 29 enlaces al glosario, figuras de 1.4 y 1.5 con su variante rotulada y `ancho`/`alto` de las figuras. Pruebas permanentes en `src/modules/m1_conociendo_el_hueso/`: `contenido.test.ts` (cobertura contra el guion), `integracion.test.ts` (`ModuloView` real con el contenido real y las seis actividades reales: completa las 18, comprueba bloqueo por secuencia, glosario y cuerpos exactos de `POST`/`PUT`) e `ilustraciones.test.ts`. Pendiente fuera de esta fila: verificación visual en navegador y revisión del docente (F2-11) |
| F2-10 | [~] | Registrar interacciones y tiempo por sección en `ContextoPedagogico` y en `usage_events` | F1-09, F1-06 | 2026-09-24: `ModuloView` mantiene vivo el `ContextoPedagogico` (módulo, sección, `actividadActual`, `interaccionesRecientes` con máximo 10, estructura y molécula seleccionadas, `tiempoEnSeccionSeg`) y `useTiempoModulo` envía `tiempo_delta_seg` cada 30 s con la pestaña visible y `seccion_actual`. Las interacciones no viajan a la API (el contrato no tiene endpoint de eventos de uso: `usage_events` solo registra el consumo del mentor); el tiempo llega a `tiempo_total_seg` del módulo. Falta verificación visual. |
| F2-11 | [ ] | Ciclo de revisión 1 con el docente sobre Módulo 1 | F2-09, F0-15 | Anotar en revisiones.md |

**Entregable F2:** Módulo 1 jugable de principio a fin, con puntaje, en móvil y desktop.

## F3 — Mentor de IA contextual

| ID | Estado | Tarea | Depende de | Notas |
|---|---|---|---|---|
| F3-01 | [ ] | `ingest.py`: documentos → chunks → embeddings → ChromaDB (dev) / pgvector (prod), con metadato `modulo` | F0-06, F1-03 | Base: RaG-CHBT |
| F3-02 | [ ] | `rag/retrieve.py`: top-k con filtro por módulo | F3-01 | |
| F3-03 | [ ] | System prompt v1 `prompts/mentor.md`: rol, tono simple y directo, reglas, no resolver actividades | F0-02 | Versionar |
| F3-04 | [ ] | `/chat` completo: system + contexto + chunks + historial; prompt caching del bloque estable | F3-02, F3-03, F1-07 | Verificar `cache_read_input_tokens` > 0 |
| F3-05 | [ ] | Citas (documento + página) y render en UI | F3-04 | |
| F3-06 | [ ] | `/explain`: "Explícame esto" desde capa/nodo/molécula seleccionada, analogía según `nivel` | F3-04, F2-02, F2-05 | |
| F3-07 | [ ] | `/progress-hint`: el mentor lee `progreso` y sugiere refuerzo al entrar a un módulo | F3-04, F2-07 | Monitoreo del briefing |
| F3-08 | [ ] | Tool use: `enfocar_estructura`, `ir_a_seccion`, `abrir_actividad`; frontend ejecuta | F3-04, F2-06, F2-08 | |
| F3-09 | [ ] | Guardar `chat_sessions`/`chat_messages` con tokens | F3-04, F1-04 | |
| F3-10 | [ ] | Límites por sesión y por día por estudiante | F3-09 | |
| F3-11 | [ ] | Disclaimer y feedback 👍/👎 por respuesta | F3-04 | |

**Entregable F3:** el mentor responde sobre lo que el estudiante ve y cita el material del curso.

## F4 — Módulos 2 y 3 + arrastre molecular + quiz IA

| ID | Estado | Tarea | Depende de | Notas |
|---|---|---|---|---|
| F4-01 | [~] | `ActivityDrag`: moléculas arrastrables a receptores, táctil, animación GSAP del efecto biológico, penaliza intentos | F2-01 | 2026-09-24: `activities/arrastre-molecular/ActividadArrastreMolecular.vue` (+ `logica.ts`, `geometria.ts`, `useArrastreMolecular.ts`, `partes/`). Pointer Events propios (ratón, lápiz y dedo) sin dependencias, radio de captura de 56 px, soltar en el vacío sin fallo, un receptor con varias moléculas (efecto de la última), rechazo por distractor, alternativa completa por teclado y lector de pantalla (elegir molécula y luego receptor, con anuncios `aria-live`). Efecto biológico con los nueve presets en CSS (`@keyframes`, sin GSAP: no hacía falta) y sin movimiento con `prefers-reduced-motion`. Batería `pruebasDeContratoActividad` cumplida (también con la variante de competencia); 177 pruebas propias, 17 mutaciones deliberadas detectadas; chunk de 33,2 kB (11,5 kB gzip) + 8,1 kB de CSS. Falta la verificación visual en navegador y en móvil real (arrastre táctil, zonas de 44 px, contraste en claro y oscuro) y probarlo con los fondos SVG reales de F0-11 |
| F4-02 | [~] | `ActivityQuiz`: preguntas estáticas o generadas, feedback inmediato con explicación | F2-01 | Componente `activities/quiz/ActividadQuiz.vue` listo (opción múltiple, V/F, ordenar; 182 pruebas, mutaciones verificadas). Pendiente: verificación visual y enchufe de IA real (`ia.ts`). |
| F4-03 | [ ] | `/quiz`: contexto + tiempo → 3 preguntas con `output_config.format` y justificación por opción | F3-04 | |
| F4-04 | [ ] | Escena 3D de células (`ActivityScene3D` con GLB de F0-10) | F2-05, F0-10 | |
| F4-05 | [~] | Módulo 2 completo | F4-04, F2-08, F0-03 | 2026-09-24: `content.json` de M2 "Descubriendo sus células" (5 secciones, 13 actividades: 4 multicapa, 4 quiz con 23 preguntas, 1 relación, 2 video-texto, 1 arrastre y 1 exploración 3D; 380 puntos, 340 obligatorios; 22 pendientes para el docente) con 0 errores de esquema, de recursos y de SVG (los 6 SVG de `public/images/m2/` existen con todas sus capas). Retoques a mano sobre lo generado (anotados en `estado_revision.notas`; regenerar con el convertidor los borra): 34 de los 38 términos del glosario enlazados (los otros 4 solo aparecen en tablas o dentro de actividades) y receptores del arrastre alineados con las zonas de acople del SVG del árbol de linajes. Pruebas permanentes en `src/modules/m2_descubriendo_sus_celulas/`: `contenido.test.ts` (cobertura contra el guion), `integracion.test.ts` (`ModuloView` real con el contenido real y las seis actividades reales: completa las 13, comprueba bloqueo por secuencia, glosario, avisos de posgrado, ids únicos, consola limpia y cuerpos exactos de `POST`/`PUT`) e `ilustraciones.test.ts`. En `[~]` porque sus dependencias siguen abiertas (F4-04 escena 3D de células, F0-03 validación del guion por el docente, F2-08); el 3D de la mandíbula (`m2_3d_origen_mandibula`) se prueba solo con la lista de nodos porque happy-dom no tiene WebGL. Pendiente además: verificación visual en navegador y revisión del docente |
| F4-06 | [ ] | Componente Mol* embebido | F0-14 | |
| F4-07 | [x] | Módulo 3 completo (mecanotransducción, arrastre molecular) | F4-01, F4-02, F4-06, F0-03 | Alta densidad. 2026-09-24: `content.json` de M3 (8 secciones, 21 actividades: 6 multicapa, 8 quiz, 3 relación, 1 video-texto, 2 arrastre y 1 exploración 3D; 34 preguntas; 700 puntos, 650 obligatorios; 60 pendientes para el docente) con 0 errores de esquema, de recursos y de SVG (los 8 SVG de `public/images/m3/` existen con todas sus capas). Retoques a mano sobre lo generado (anotados en `estado_revision.notas`; regenerar con el convertidor los borra; el script que los reaplica está en `.verify/finalizador-m3/enlazar_glosario.py`): 42 de los 46 términos del glosario enlazados (Smad, Noggin, Cilio primario y Frizzled solo están en tablas y actividades) y, en `m3_sensores_mecanicos.svg`, los grupos `canal_piezo1` y `cilio_primario` renombrados a `sensores_mecanicos_canal_piezo1` y `sensores_mecanicos_cilio_primario` (ids únicos del módulo). Pruebas permanentes en `src/modules/m3_construyendo_hueso/`: `contenido.test.ts` (cobertura contra el guion: ids, tipos, puntajes, respuestas correctas y explicaciones de las 34 preguntas), `integracion.test.ts` (`ModuloView` real con el contenido real y las seis actividades reales: completa las 21, comprueba bloqueo por secuencia y que las opcionales no bloquean, glosario, ids únicos, consola limpia y cuerpos exactos de `POST`/`PUT`) e `ilustraciones.test.ts`. Dependencias F4-06 (Mol*) y F0-03 (validación del guion) siguen abiertas pero este módulo no usa Mol*. Pendiente fuera de esta fila: verificación visual en navegador (incluidas las `ancla` provisionales de los nodos 3D de la mandíbula) y revisión del docente (F4-08) |
| F4-08 | [ ] | Ciclo de revisión 2 (M2, M3, mentor) | F4-05, F4-07, F3-08 | |

## F5 — Módulos 4, 5 y 6 + certificado

| ID | Estado | Tarea | Depende de | Notas |
|---|---|---|---|---|
| F5-01 | [~] | Módulo 4 "Transformando la matriz" | F2-08, F4-01, F0-04 | Alta densidad. 2026-09-24: `content.json` de M4 (8 secciones, 20 actividades: 5 multicapa, 9 quiz, 3 relación, 1 video-texto, 1 arrastre y 1 exploración 3D; 660 puntos, 510 obligatorios; 48 pendientes para el docente) con 0 errores de esquema, de recursos y de SVG (los 7 SVG de `public/images/m4/` existen con todas sus capas). Retoques a mano sobre lo generado (anotados en `estado_revision.notas`; regenerar con el convertidor los borra): las 7 líneas `[Figura: id \| pie]` del guion pasaron a bloques `imagen` (el convertidor las dejaba como texto literal), 40 de los 42 términos del glosario enlazados (BSAP y «mineralización primaria» solo aparecen como fila o título de tabla) y receptores del arrastre alineados con los sitios del SVG de la vesícula. Pruebas permanentes en `src/modules/m4_transformando_la_matriz/`: `contenido.test.ts` (cobertura contra el guion), `integracion.test.ts` (`ModuloView` real con el contenido real y las seis actividades reales: completa las 20, comprueba bloqueo por secuencia, glosario, ids únicos, consola limpia y cuerpos exactos de `POST`/`PUT`) e `ilustraciones.test.ts`. En `[~]` por un hallazgo de otra pieza: `tools/guiones` no reconoce `[Figura: id \| pie]` (ver informe de la ejecución). Pendiente además: verificación visual en navegador y revisión del docente |
| F5-02 | [~] | Módulo 5 "Renovando el hueso": remodelado sobre mandíbula 3D con etapas | F2-05, F2-06, F0-04 | Alta densidad. 2026-09-24: `content.json` de M5 (8 secciones, 26 actividades: 7 multicapa, 10 quiz con 39 preguntas, 3 relación, 3 video-texto, 2 arrastre y 1 exploración 3D; 790 puntos, 700 obligatorios; 68 pendientes para el docente) con 0 errores de esquema, de recursos y de SVG (los 10 SVG de `public/images/m5/` existen con todas sus capas). Retoques a mano sobre lo generado (anotados en `estado_revision.notas`; regenerar con el convertidor los borra): 39 de los 42 términos del glosario enlazados (osteona, hemiosteona y cono de corte/cierre solo salen en dibujos, actividades o tablas), alt de las dos escenas de arrastre sin ids de figura, receptores del arrastre sobre los sitios dibujados, títulos propios en las tres relaciones y `visibles`/`resaltadas` de los pasos de las tres animaciones (el convertidor los deducía sin la capa de fondo, y `visibles` oculta todo lo demás). Pruebas permanentes en `src/modules/m5_renovando_el_hueso/`: `contenido.test.ts` (cobertura contra el guion), `integracion.test.ts` (`ModuloView` real con el contenido real y las seis actividades reales: completa las 26, bloqueo por secuencia, glosario, nivel de posgrado, consola limpia y cuerpos exactos de `POST`/`PUT`) e `ilustraciones.test.ts`. En `[~]` por un hallazgo de otra pieza: seis SVG repiten `<g id="fondo_escena">` y quedan ids duplicados cuando dos se dibujan en la misma sección (5.5 y 5.6); la prueba lo tolera con una excepción documentada. Pendiente además: `ancla` de los 9 hotspots 3D (tabla provisional), verificación visual en navegador y revisión del docente |
| F5-03 | [ ] | Módulo 6 "El paso del tiempo" | F2-08, F0-04 | |
| F5-04 | [ ] | Logros transversales y pantalla de logros | F2-07 | |
| F5-05 | [ ] | Certificado PDF (reportlab) con nombre, apellido, identificación, código de verificación y ruta pública `/verify/{codigo}` | F5-01, F5-02, F5-03, F1-04 | **Backend [x]** (2026-09-24): `GET /api/certificate/status`, `POST /api/certificate` (idempotente), `GET /api/certificate/pdf`, `GET /api/verify/{codigo}` (público, con límite y enmascarado); migración `a3c81e5d7b02`; validación de resultados y progreso contra el manifiesto de actividades (`python -m app.scripts.build_manifest`); contrato en `docs/api-contract.md` §Certificado. **Falta el frontend**: botón de descarga, vista pública `/verify/:codigo` (la URL del PDF y del QR apunta a ella) y generar y versionar el manifiesto cuando existan los `content.json` reales. |
| F5-06 | [ ] | Ciclo de revisión 3 (M4–M6, certificado) | F5-05 | |

## F6 — Pulido, pruebas y despliegue

| ID | Estado | Tarea | Depende de | Notas |
|---|---|---|---|---|
| F6-01 | [ ] | Accesibilidad: teclado en actividades, contraste, aria, lectores de pantalla | F2-08 | |
| F6-02 | [ ] | Rendimiento móvil: lazy load por módulo, `<Suspense>`, medir en gama media | F5-03 | |
| F6-03 | [ ] | Panel docente: progreso por cohorte, actividades más falladas, uso del mentor, rol `docente` | F2-10, F3-09 | **Backend [x]** (2026-09-24): `/api/teacher/*` (resumen, estudiantes, detalle, actividades, uso del mentor con costo estimado, CSV), 585 pruebas en SQLite y PostgreSQL; contrato en `docs/api-contract.md` §Docente. **Falta el frontend** (vistas del panel) y el uso real del mentor (F3-09 llena `chat_*`). |
| F6-04 | [ ] | Prueba con 5–10 estudiantes; hallazgos en `docs/pruebas.md` | F5-06 | |
| F6-05 | [ ] | Frontend en Vercel/Netlify | F1-15 | |
| F6-06 | [ ] | FastAPI + PostgreSQL en VPS con Docker (o Railway/Fly.io); HTTPS, CORS, secretos | F1-02 | |
| F6-07 | [ ] | Alerta de costo de tokens por día | F3-09 | |
| F6-08 | [ ] | Endurecer acceso antes del público: OTP por correo o contraseña sobre el registro mínimo | F1-05 | Decisión con el docente |
| F6-10 | [ ] | **Recordar al usuario** (pedido explícito): montar todo en Docker con la imagen `pgvector/pgvector:pg16`, ejecutar `CREATE EXTENSION vector;`, migrar el RAG de ChromaDB a pgvector | F1-02, F3-01 | Recordarlo al llegar a F6-04 o al declarar el proyecto terminado. Laragon no trae pgvector |
| F6-09 | [ ] | Aprobación final del docente y publicación | F6-04, F6-05, F6-06, F6-08 | |

---

## Decisiones tomadas (log)

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-09-23 | Vue 3 + TresJS en lugar de React + R3F | Preferencia del equipo; TresJS cubre GLTF, Draco, eventos por mesh y Html. |
| 2026-09-23 | Un solo backend en FastAPI; se descarta Laravel | Laravel es pesado para el alcance; todo el equipo en Python. Elimina la validación cruzada de tokens. |
| 2026-09-23 | SQLModel + Alembic; SQLite en dev, PostgreSQL con pgvector en prod | Reemplaza MySQL; pgvector permite RAG en la misma base. |
| 2026-09-23 | Python 3.14 (el instalado en la máquina) en lugar de 3.12 | Indicado por el equipo. `uv` usa el intérprete del sistema sin descargar otro. |
| 2026-09-23 | Chat por SSE propio con `fetch`, sin `@ai-sdk/vue` | Emular el protocolo de stream del AI SDK en FastAPI es frágil y los eventos `tool_use` de cámara 3D (F3-08) necesitan control propio. |
| 2026-09-23 | Unicidad de usuario sobre el par tipo+número de identificación | Un mismo número puede repetirse entre tipos distintos (CC vs. PA). |
| 2026-09-23 | PyJWT en lugar de `python-jose` | `python-jose` no tiene mantenimiento activo. |
| 2026-09-23 | Contrato de API en `docs/api-contract.md` | Permite construir frontend y backend en paralelo sin desincronizarse. |
| 2026-09-23 | Registro mínimo: nombre, apellido, tipo y número de identificación, sin contraseña | Pedido del equipo para arrancar. Riesgo de suplantación aceptado en piloto; se endurece en F6-08. |
| 2026-09-23 | Mandíbula base de BodyParts3D | Única fuente abierta con licencia clara; refinar en Blender. |
| 2026-09-23 | Alcance según briefing: 6 módulos, gamificación, certificado, móvil 100 % | Reemplaza el alcance inicial centrado en osteogénesis. |
| 2026-09-23 | 3D solo en mandíbula y células; resto en SVG/2D | Requisito de móvil al 100 %. |
| 2026-09-23 | Módulo 1 como piloto | Menor densidad; valida navegación, gamificación y mentor antes de los módulos pesados. |
| 2026-09-23 | Motor de actividades genérico + `content.json` por módulo | Seis módulos comparten los mismos tipos de interacción. |
| 2026-09-24 | Panel docente: identificación enmascarada (últimos 3 caracteres), completa solo con búsqueda exacta; CSV enmascarado salvo `?identificacion=completa` | Dato personal; el docente que ya conoce el número no pierde función y no se puede reconstruir por fragmentos. Contrato en `docs/api-contract.md` §Docente. |
| 2026-09-24 | Certificado con **reportlab** (Python puro) y fuentes DejaVu en lugar de WeasyPrint | WeasyPrint necesita GTK/Pango en Windows y complica la imagen; reportlab no tiene dependencias de sistema, trae QR y da control total del diseño. Licencias en `docs/atribuciones.md`. |
| 2026-09-24 | Validación en servidor contra un manifiesto de actividades generado de los `content.json` (`app/data/actividades_manifest.json`, se versiona y viaja en la imagen) | La imagen de la API no ve `apps/web`. Sin manifiesto la API se comporta como en Fase 1. |
| 2026-09-24 | Certificado elegible con los 6 módulos completados y, con manifiesto, el 70 % (`CERT_MIN_PORCENTAJE`) del máximo de las actividades **obligatorias** | Cumple el briefing (reconocimiento final) sin que una actividad opcional compense una obligatoria fallada. Umbral por confirmar con el docente. |
| 2026-09-24 | Costo del mentor estimado con `PRECIO_ENTRADA_USD_POR_MTOK` / `PRECIO_SALIDA_USD_POR_MTOK` (por defecto 5 y 25, tarifas de `claude-opus-5`) | Configurable sin tocar código; es una estimación, no la factura. Verificar las tarifas antes de presupuestar. |
| 2026-09-24 | `BLOQUEO_SECUENCIAL` vale `true` por defecto; `VITE_BLOQUEO_SECUENCIAL=false` lo desactiva para demos y pruebas | Requisito del briefing: el estudiante debe actuar para avanzar. Un módulo o sección completados nunca se vuelven a cerrar; lo bloqueado se explica en la página (F2-08). |

## Descartado

| ID | Qué | Por qué |
|---|---|---|
| — | React Three Fiber | Reemplazado por TresJS (2026-09-23) |
| — | Estructura por tipo de osificación (intramembranosa/endocondral) | El briefing organiza por módulos temáticos (2026-09-23) |
| — | Laravel + Sanctum + MySQL | Reemplazado por FastAPI + SQLModel + PostgreSQL (2026-09-23) |
