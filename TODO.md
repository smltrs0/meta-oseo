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

**Fase activa:** F1 (esqueleto técnico). F0 espera el material del docente.
**Hecho y verificado de forma independiente:** F1-01; F1-03 a F1-06 (backend núcleo: 289 pruebas en SQLite y en PostgreSQL 18, 47 comprobaciones en vivo); F1-08 y F1-09 (base Vue: typecheck, lint, 142 pruebas y build correctos).
**En curso (agentes):** F1-07 (mentor SSE), F1-10 y F1-11 (menú y HUD), F1-12 (escena 3D), F1-13 (chat del frontend).
**Siguiente tarea:** al terminar esos agentes: F1-02 (Docker con pgvector), F1-15 (CI), F1-14 de extremo a extremo con el backend real, revisión adversarial y verificación en navegador móvil.
**Bloqueos:** ninguno técnico. Falta material del docente para el Módulo 1 (F0-02).
**Última actualización:** 2026-09-23.

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
| F1-02 | [ ] | `docker-compose.yml` con web, api, postgres (perfil prod) | F1-01 | SQLite en dev sin Docker |
| F1-03 | [x] | FastAPI en `services/api` con `uv`: `main.py`, `core/settings.py`, `core/db.py` (SQLModel, SQLite/PostgreSQL por env), `/health`, CORS | F1-01 | Base: fastapi-claude-ai-streaming-api |
| F1-04 | [x] | Modelos SQLModel + Alembic: `users` (nombre, apellido, tipo_identificacion, numero_identificacion, nivel, rol; único sobre el par tipo+número), `progress_modulos`, `activity_results`, `achievements`, `user_achievements`, `certificates`, `chat_sessions`, `chat_messages` (tokens), `usage_events` | F1-03 | |
| F1-05 | [x] | Auth mínima: `POST /auth/register` (nombre, apellido, tipo y número de identificación) y `POST /auth/login` (tipo + número) → JWT; dependencia `get_current_user`; `GET /me` | F1-04 | Sin contraseña en esta etapa (PLAN §1) |
| F1-06 | [x] | Endpoints de progreso: `GET/PUT /progress`, `POST /activities/{id}/result`, `GET /achievements` | F1-05 | |
| F1-07 | [ ] | Cliente Anthropic en `app/ai/`: `claude-opus-5`, thinking adaptativo, streaming SSE en `POST /chat` sin contexto aún, protegido con JWT | F1-05 | |
| F1-08 | [x] | Vue 3 + Vite + TS en `apps/web`: Tailwind, shadcn-vue, Vue Router (ruta por módulo), Pinia; layout móvil primero | F1-01 | 2026-09-23. Typecheck, lint, 142 pruebas, build y arranque de Vite verificados. Falta la revisión visual en móvil real (llega con F1-12). `AppShell` monta los stubs de `MenuCircular`, `HudPuntaje` y `MentorPanel` |
| F1-09 | [x] | Store Pinia `contextoPedagogico` con el tipo del PLAN §3, congelado | F1-08 | Cambios exigen actualizar PLAN, store y schema FastAPI. 2026-09-23: `apps/web/src/stores/contextoPedagogico.ts`, con `toPayload()` validado contra el contrato en pruebas |
| F1-10 | [ ] | Componente `MenuCircular` lateral: 6 módulos, estado bloqueado/activo/completado, touch | F1-08 | SVG a medida |
| F1-11 | [ ] | `HudPuntaje`: puntaje, módulo actual, siguiente logro | F1-09 | |
| F1-12 | [ ] | Escena TresJS "hola mandíbula": `useGLTF` + Draco, `OrbitControls`, probada en teléfono real | F1-08 | STL crudo si F0-09 no está |
| F1-13 | [ ] | Composable `useMentor` con `fetch` + `ReadableStream` sobre el SSE de `/api/chat`; panel de chat deslizable en móvil | F1-08, F1-07 | Protocolo decidido: SSE propio (ver api-contract.md) |
| F1-14 | [~] | Pantalla de registro/login en la SPA: nombre, apellido, tipo de identificación (select), número; guardar JWT; interceptor fetch | F1-08, F1-05 | Una sola pantalla: si el número existe, entra; si no, pide nombre y apellido. 2026-09-23: SPA lista y probada con fetch simulado (vista, store, guard, cliente). Falta la prueba de extremo a extremo contra el backend real |
| F1-15 | [ ] | CI: lint + test en ambos paquetes (ruff + pytest, eslint + vitest) | F1-03, F1-08 | |

**Entregable F1:** registro, menú circular, mandíbula rotando en móvil, chat con streaming.

## F2 — Motor de actividades + Módulo 1

| ID | Estado | Tarea | Depende de | Notas |
|---|---|---|---|---|
| F2-01 | [ ] | Esquema TypeScript de `content.json` por módulo: secciones, bloques, actividades | F1-09 | Validar con zod |
| F2-02 | [ ] | `ActivityLayers`: SVG multicapa, hover/tap por `id`, texto por capa, completa al visitar capas requeridas | F2-01, F0-11 | |
| F2-03 | [ ] | `ActivityMatch`: relación de columnas, tap-tap y arrastre, feedback inmediato | F2-01 | |
| F2-04 | [ ] | `ActivityMedia`: video + texto sincronizado, completa al terminar | F2-01 | |
| F2-05 | [ ] | `ActivityScene3D`: GLB con nodos, tap por nodo → ficha, completa al visitar nodos | F2-01, F1-12, F0-09 | Usar `gltfvue` |
| F2-06 | [ ] | Tween de cámara GSAP `enfocarEstructura(nodo)` | F2-05 | La usará la IA en F3 |
| F2-07 | [ ] | Store `gamificacion`: puntos por actividad, penalización por intentos, logros, persistencia vía `/activities/{id}/result` | F1-06, F0-13 | |
| F2-08 | [ ] | Página de módulo genérica que renderiza `content.json` y bloquea avance hasta completar actividades | F2-02, F2-03, F2-04, F2-05 | |
| F2-09 | [ ] | Módulo 1 completo: `content.json`, SVGs, textos, actividades, puntajes | F2-08, F0-02 | |
| F2-10 | [ ] | Registrar interacciones y tiempo por sección en `ContextoPedagogico` y en `usage_events` | F1-09, F1-06 | |
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
| F4-01 | [ ] | `ActivityDrag`: moléculas arrastrables a receptores, táctil, animación GSAP del efecto biológico, penaliza intentos | F2-01 | `@formkit/drag-and-drop` o `@vueuse/gesture` |
| F4-02 | [ ] | `ActivityQuiz`: preguntas estáticas o generadas, feedback inmediato con explicación | F2-01 | |
| F4-03 | [ ] | `/quiz`: contexto + tiempo → 3 preguntas con `output_config.format` y justificación por opción | F3-04 | |
| F4-04 | [ ] | Escena 3D de células (`ActivityScene3D` con GLB de F0-10) | F2-05, F0-10 | |
| F4-05 | [ ] | Módulo 2 completo | F4-04, F2-08, F0-03 | |
| F4-06 | [ ] | Componente Mol* embebido | F0-14 | |
| F4-07 | [ ] | Módulo 3 completo (mecanotransducción, arrastre molecular) | F4-01, F4-02, F4-06, F0-03 | Alta densidad |
| F4-08 | [ ] | Ciclo de revisión 2 (M2, M3, mentor) | F4-05, F4-07, F3-08 | |

## F5 — Módulos 4, 5 y 6 + certificado

| ID | Estado | Tarea | Depende de | Notas |
|---|---|---|---|---|
| F5-01 | [ ] | Módulo 4 "Transformando la matriz" | F2-08, F4-01, F0-04 | Alta densidad |
| F5-02 | [ ] | Módulo 5 "Renovando el hueso": remodelado sobre mandíbula 3D con etapas | F2-05, F2-06, F0-04 | Alta densidad |
| F5-03 | [ ] | Módulo 6 "El paso del tiempo" | F2-08, F0-04 | |
| F5-04 | [ ] | Logros transversales y pantalla de logros | F2-07 | |
| F5-05 | [ ] | Certificado PDF (WeasyPrint) con nombre, apellido, identificación, código de verificación y ruta pública `/verify/{codigo}` | F5-01, F5-02, F5-03, F1-04 | |
| F5-06 | [ ] | Ciclo de revisión 3 (M4–M6, certificado) | F5-05 | |

## F6 — Pulido, pruebas y despliegue

| ID | Estado | Tarea | Depende de | Notas |
|---|---|---|---|---|
| F6-01 | [ ] | Accesibilidad: teclado en actividades, contraste, aria, lectores de pantalla | F2-08 | |
| F6-02 | [ ] | Rendimiento móvil: lazy load por módulo, `<Suspense>`, medir en gama media | F5-03 | |
| F6-03 | [ ] | Panel docente: progreso por cohorte, actividades más falladas, uso del mentor, rol `docente` | F2-10, F3-09 | |
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

## Descartado

| ID | Qué | Por qué |
|---|---|---|
| — | React Three Fiber | Reemplazado por TresJS (2026-09-23) |
| — | Estructura por tipo de osificación (intramembranosa/endocondral) | El briefing organiza por módulos temáticos (2026-09-23) |
| — | Laravel + Sanctum + MySQL | Reemplazado por FastAPI + SQLModel + PostgreSQL (2026-09-23) |
