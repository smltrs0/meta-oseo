# OVA — Metabolismo óseo: un viaje interactivo desde la célula hasta el hueso

Objeto Virtual de Aprendizaje para ciencias de la salud. Seis módulos con actividades interactivas,
mentor de IA, gamificación y certificado. Funciona en móvil.

- `apps/web`: Vue 3 + Vite + TypeScript + TresJS.
- `services/api`: FastAPI (único backend), SQLModel, Alembic, SDK de Anthropic.

Documentos: [PLAN.md](PLAN.md) · [TODO.md](TODO.md) · [docs/api-contract.md](docs/api-contract.md) ·
[docs/briefing-pedagogico.md](docs/briefing-pedagogico.md) · [docs/referencias.md](docs/referencias.md).

## Requisitos

Node 22+, `pnpm`, Python 3.14+, `uv`, Docker (solo para el perfil de producción).

## Desarrollo local

```bash
cp .env.example .env            # y completar ANTHROPIC_API_KEY si se quiere probar el mentor

# Backend (http://localhost:8000, docs en /api/docs)
cd services/api
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# Frontend (http://localhost:5173, proxifica /api al backend)
pnpm install
pnpm dev:web
```

En Windows, si `uv` no está en el PATH, usar `python -m uv` o anteponer
`C:\Users\<usuario>\AppData\Roaming\Python\Python314\Scripts`.

## Producción con Docker

```bash
docker compose up --build
```

Levanta PostgreSQL 16 (con pgvector), la API y nginx sirviendo la SPA y proxificando `/api`.

## Estado del proyecto

El avance vive en [TODO.md](TODO.md).
