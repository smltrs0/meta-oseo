#!/bin/sh
# Arranque del contenedor de la API: aplica las migraciones y lanza uvicorn.
# `set -e`: si la migración falla el contenedor termina (y compose lo reinicia) en lugar de
# servir una API sin esquema. `exec`: uvicorn pasa a ser el proceso principal (PID 1) y recibe
# SIGTERM de `docker stop`, así apaga con calma.
set -e

# Idempotente: sin cambios pendientes no hace nada. Pensado para UNA sola réplica de la API;
# con varias habría que migrar en un paso aparte para no competir por el mismo esquema.
alembic upgrade head

# --no-proxy-headers: uvicorn no reescribe la IP del cliente a partir de X-Forwarded-For.
# La API ya lo hace por su cuenta y solo si TRUST_PROXY=true (app/core/rate_limit.py), tomando
# el primer valor que nginx fija con `proxy_set_header X-Forwarded-For $remote_addr`
# (sobrescribe, no añade). Dejar los dos mecanismos activos daría dos fuentes de verdad.
# Un solo worker: el limitador de intentos vive en memoria de proceso (ver rate_limit.py).
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --no-proxy-headers
