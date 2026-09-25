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
cp .env.example .env            # y definir SECRET_KEY (obligatoria, 32+ caracteres) y POSTGRES_PASSWORD
docker compose up --build       # http://localhost:8080
```

Levanta PostgreSQL 16 (con pgvector), la API y nginx sirviendo la SPA y proxificando `/api`.
Solo se publica el puerto **8080** (nginx); la base y la API quedan dentro de la red de compose, así que
no chocan con el PostgreSQL local del 5432. Sin `SECRET_KEY`, compose se niega a arrancar. La API aplica
las migraciones (`alembic upgrade head`) al iniciar.

> Escrito y validado en estático (`docker compose config`); todavía no se ha construido ni ejecutado.
> Se verifica en F6-10 (ver [TODO.md](TODO.md)).

## Estado del proyecto

El avance vive en [TODO.md](TODO.md).
