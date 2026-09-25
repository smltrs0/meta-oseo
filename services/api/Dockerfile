# syntax=docker/dockerfile:1
#
# Imagen de la API del OVA (FastAPI). Contexto de construcción: services/api
# (lo fija docker-compose.yml). Dos etapas: la primera resuelve las dependencias con uv y la
# segunda es la imagen final, sin uv, sin cachés y sin el .env.

# ---- Etapa 1: dependencias ---------------------------------------------------------------
FROM python:3.14-slim AS deps

# uv desde su imagen oficial. Versión fijada: la misma con la que se generó uv.lock.
COPY --from=ghcr.io/astral-sh/uv:0.12.18 /uv /usr/local/bin/uv

# - UV_PYTHON_DOWNLOADS=never: usar el Python 3.14 de la imagen, no descargar otro.
# - UV_NO_CACHE=1: no dejar la caché de uv en ninguna capa.
# - UV_COMPILE_BYTECODE=1: compilar a .pyc aquí (la imagen final no escribe bytecode).
# - UV_PROJECT_ENVIRONMENT: el entorno virtual vive fuera del código, así se copia entero.
ENV UV_PYTHON_DOWNLOADS=never \
    UV_NO_CACHE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv

# La ruta importa: app/core/settings.py calcula REPO_ROOT como API_DIR.parents[1], así que
# el código debe colgar de al menos dos niveles (aquí /srv/ova/services/api, el mismo diseño
# que el monorepo). En /app fallaría con IndexError al importar la configuración.
WORKDIR /srv/ova/services/api

# El proyecto tiene `package = false`: uv solo instala dependencias, no hace falta el código.
# Por eso esta capa solo se reconstruye cuando cambian pyproject.toml, uv.lock o .python-version.
COPY pyproject.toml uv.lock .python-version ./
# --locked: falla si uv.lock no coincide con pyproject.toml (nunca re-resuelve en la imagen).
# --no-dev: sin pytest, ruff ni httpx2.
RUN uv sync --locked --no-dev


# ---- Etapa 2: imagen final -----------------------------------------------------------------
FROM python:3.14-slim AS runtime

# PYTHONUNBUFFERED: los registros llegan a `docker logs` sin retraso.
# PYTHONDONTWRITEBYTECODE: el usuario sin privilegios no escribe en el árbol de código.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:${PATH}"

# Usuario sin privilegios y sin shell. El código queda propiedad de root (solo lectura para él).
RUN groupadd --system --gid 10001 ova \
 && useradd --system --uid 10001 --gid ova --no-create-home --shell /usr/sbin/nologin ova

WORKDIR /srv/ova/services/api

COPY --from=deps /opt/venv /opt/venv
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
# El script se normaliza a LF: en Windows, con core.autocrlf, el checkout lo deja en CRLF y el
# kernel no podría ejecutar "#!/bin/sh\r".
COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh

# Nada de esto entra a la imagen (ver .dockerignore): .env, .venv, data/, corpus/, tests/.
# Cuando llegue el RAG (F3-01) habrá que decidir cómo se entrega el corpus (volumen o COPY).

USER ova
EXPOSE 8000

# Migra el esquema y arranca uvicorn. El healthcheck vive en docker-compose.yml.
ENTRYPOINT ["docker-entrypoint.sh"]
