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

**Fase activa:** F0 y F1 en paralelo.
**Siguiente tarea:** F1-01 (crear monorepo).
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
| F0-06 | [ ] | Recolectar documentos del curso en `services/ai/corpus/` con permiso de uso | — | gitignored |
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
| F1-01 | [ ] | Crear monorepo: `apps/web`, `services/api`, `services/ai`, pnpm workspace, `.gitignore`, `README.md` | — | |
| F1-02 | [ ] | `docker-compose.yml` con web, api, ai, mysql (perfil prod) | F1-01 | SQLite en dev |
| F1-03 | [ ] | Laravel 11 en `services/api` desde `muradyanvano/laravel-vue-spa-starter-kit`; Sanctum con tokens; registro con datos mínimos del estudiante | F1-01 | Quitar el frontend que trae |
| F1-04 | [ ] | Migraciones: `users`, `progress`, `activity_results`, `achievements`, `user_achievements`, `certificates`, `chat_sessions`, `chat_messages` (tokens), `usage_events` | F1-03 | |
| F1-05 | [ ] | Endpoints: auth, `/me`, `/progress`, `/activities/{id}/result`, `/achievements`, `/internal/validate-token` | F1-04 | |
| F1-06 | [ ] | FastAPI en `services/ai`: `/health`, settings, `auth.py` valida token contra Laravel | F1-01 | |
| F1-07 | [ ] | Cliente Anthropic: `claude-opus-5`, thinking adaptativo, streaming SSE en `/chat` sin contexto aún | F1-06 | Base: fastapi-claude-ai-streaming-api |
| F1-08 | [ ] | Vue 3 + Vite + TS en `apps/web`: Tailwind, shadcn-vue, Vue Router (ruta por módulo), Pinia; layout móvil primero | F1-01 | |
| F1-09 | [ ] | Store Pinia `contextoPedagogico` con el tipo del PLAN §3, congelado | F1-08 | Cambios exigen actualizar PLAN, store y schema FastAPI |
| F1-10 | [ ] | Componente `MenuCircular` lateral: 6 módulos, estado bloqueado/activo/completado, touch | F1-08 | SVG a medida |
| F1-11 | [ ] | `HudPuntaje`: puntaje, módulo actual, siguiente logro | F1-09 | |
| F1-12 | [ ] | Escena TresJS "hola mandíbula": `useGLTF` + Draco, `OrbitControls`, probada en teléfono real | F1-08 | STL crudo si F0-09 no está |
| F1-13 | [ ] | Composable `useMentor` con `@ai-sdk/vue` `useChat` → FastAPI `/chat`; panel de chat deslizable en móvil | F1-08, F1-07 | Decidir protocolo de stream |
| F1-14 | [ ] | Registro/login en la SPA con Sanctum, token, interceptor | F1-08, F1-05 | |
| F1-15 | [ ] | CI: lint + test en los tres paquetes | F1-03, F1-06, F1-08 | |

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
| F2-07 | [ ] | Store `gamificacion`: puntos por actividad, penalización por intentos, logros, persistencia en Laravel | F1-05, F0-13 | |
| F2-08 | [ ] | Página de módulo genérica que renderiza `content.json` y bloquea avance hasta completar actividades | F2-02, F2-03, F2-04, F2-05 | |
| F2-09 | [ ] | Módulo 1 completo: `content.json`, SVGs, textos, actividades, puntajes | F2-08, F0-02 | |
| F2-10 | [ ] | Registrar interacciones y tiempo por sección en `ContextoPedagogico` y en `usage_events` | F1-09, F1-05 | |
| F2-11 | [ ] | Ciclo de revisión 1 con el docente sobre Módulo 1 | F2-09, F0-15 | Anotar en revisiones.md |

**Entregable F2:** Módulo 1 jugable de principio a fin, con puntaje, en móvil y desktop.

## F3 — Mentor de IA contextual

| ID | Estado | Tarea | Depende de | Notas |
|---|---|---|---|---|
| F3-01 | [ ] | `ingest.py`: documentos → chunks → embeddings → ChromaDB, con metadato `modulo` | F0-06, F1-06 | Base: RaG-CHBT |
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
| F5-05 | [ ] | Certificado PDF (dompdf) con código de verificación y ruta pública `/verify/{codigo}` | F5-01, F5-02, F5-03, F1-04 | |
| F5-06 | [ ] | Ciclo de revisión 3 (M4–M6, certificado) | F5-05 | |

## F6 — Pulido, pruebas y despliegue

| ID | Estado | Tarea | Depende de | Notas |
|---|---|---|---|---|
| F6-01 | [ ] | Accesibilidad: teclado en actividades, contraste, aria, lectores de pantalla | F2-08 | |
| F6-02 | [ ] | Rendimiento móvil: lazy load por módulo, `<Suspense>`, medir en gama media | F5-03 | |
| F6-03 | [ ] | Panel docente: progreso por cohorte, actividades más falladas, uso del mentor, rol `docente` | F2-10, F3-09 | |
| F6-04 | [ ] | Prueba con 5–10 estudiantes; hallazgos en `docs/pruebas.md` | F5-06 | |
| F6-05 | [ ] | Frontend en Vercel/Netlify | F1-15 | |
| F6-06 | [ ] | Laravel + MySQL y FastAPI en VPS con Docker; HTTPS, CORS, secretos | F1-02 | |
| F6-07 | [ ] | Alerta de costo de tokens por día | F3-09 | |
| F6-08 | [ ] | Aprobación final del docente y publicación | F6-04, F6-05, F6-06 | |

---

## Decisiones tomadas (log)

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-09-23 | Vue 3 + TresJS en lugar de React + R3F | Preferencia del equipo; TresJS cubre GLTF, Draco, eventos por mesh y Html. |
| 2026-09-23 | Solo FastAPI habla con Anthropic | Una sola clave, un solo punto de logging de tokens. |
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
