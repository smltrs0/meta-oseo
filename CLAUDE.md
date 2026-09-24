# OVA — "Metabolismo óseo: un viaje interactivo desde la célula hasta el hueso"

Objeto Virtual de Aprendizaje para ciencias de la salud. Seis módulos temáticos con
actividades interactivas obligatorias, mentor de IA, gamificación y certificado.
100 % móvil. Vue 3 + TresJS en el frontend; un único backend FastAPI + Claude.

## Documentos de contexto (leer en este orden)

1. [TODO.md](TODO.md) — sección "Estado actual" y "Siguiente tarea". Es la fuente de verdad del avance.
2. [PLAN.md](PLAN.md) — stack, estructura, contrato `ContextoPedagogico`, motor de actividades, fases.
3. [docs/briefing-pedagogico.md](docs/briefing-pedagogico.md) — requisitos del docente. No se edita sin su acuerdo.
4. [docs/referencias.md](docs/referencias.md) — repos de GitHub a reutilizar antes de escribir desde cero.

## Reglas de trabajo

- Trabajar por ID de tarea (`F1-03`). Antes de empezar, verificar que sus dependencias estén `[x]`.
- Al terminar una tarea: marcarla `[x]` en TODO.md, actualizar "Estado actual" y "Siguiente tarea".
- Cambios de stack o de contrato se anotan en "Decisiones tomadas" de TODO.md y se reflejan en PLAN.md.
- El tipo `ContextoPedagogico` (PLAN §3) está congelado desde F1-09. Cambiarlo exige actualizar PLAN.md, la store Pinia y el schema de FastAPI a la vez.
- Antes de crear un componente 3D o de RAG, revisar referencias.md por si ya existe algo portable.
- El contenido de cada módulo vive en `content.json`, no en código. Los componentes de actividad (`activities/`) son genéricos y se reutilizan en los seis módulos.
- 3D solo en mandíbula y células. Imágenes multicapa, arrastre molecular y relación de columnas van en SVG/2D y deben funcionar con touch.
- Toda entrega al docente se registra en `docs/revisiones.md` con fecha, versión, cambios pedidos y aprobación.
- Nombres de nodos GLB, ids de capas SVG, rutas y tablas en snake_case en español. Código en inglés, comentarios y docs en español.

## Stack fijo

- `apps/web`: Vue 3, Vite, TypeScript, Pinia, Vue Router, Tailwind, shadcn-vue, `@tresjs/core`, `@tresjs/cientos`, GSAP, `@vueuse/motion`, `@formkit/drag-and-drop`, `@ai-sdk/vue`.
- `services/api`: Python 3.12, FastAPI, SQLModel + Alembic, JWT con `python-jose`, WeasyPrint, SDK `anthropic`, ChromaDB en dev / pgvector en prod. SQLite en dev / PostgreSQL 16 en prod. Gestión de dependencias con `uv`. Modelo `claude-opus-5`, thinking adaptativo, streaming.
- Registro de usuario: nombre, apellido, tipo de identificación, número de identificación. Sin contraseña hasta F6-08. No añadir campos sin acordarlo.
- No introducir Laravel, PHP ni un segundo backend. Todo lo de servidor va en `services/api`.

## Comandos

Pendientes hasta que exista el monorepo (F1-01). Al crearlo, documentar aquí:
`pnpm dev`, `uv run uvicorn app.main:app --reload`, `uv run alembic upgrade head`, `uv run python -m app.rag.ingest`.
