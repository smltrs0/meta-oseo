"""Entorno de Alembic.

La URL de la base de datos sale de la configuración de la app (`DATABASE_URL` / `.env`), no de
alembic.ini, y el motor se construye con `build_engine`, así SQLite lleva `foreign_keys=ON` y
resuelve rutas relativas igual que la API. Para apuntar a otra base (p. ej. en pruebas) se puede
pasar `config.attributes["database_url"]` antes de llamar a `alembic.command`.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlmodel import SQLModel

import app.models  # noqa: F401  (registra todas las tablas en SQLModel.metadata)
from app.core.db import build_engine, resolve_database_url
from app.core.settings import get_settings

config = context.config
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    # disable_existing_loggers=False: no silenciar los loggers de la app ni de pytest.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = SQLModel.metadata


def _database_url() -> str:
    return config.attributes.get("database_url") or get_settings().database_url


def _configure(**kwargs) -> None:
    context.configure(
        target_metadata=target_metadata,
        compare_type=True,
        # SQLite no soporta la mayoría de ALTER TABLE: alembic los reescribe "por lotes".
        **kwargs,
    )


def run_migrations_offline() -> None:
    """Modo `--sql`: imprime el DDL sin conectarse."""
    url = resolve_database_url(_database_url()).render_as_string(hide_password=False)
    _configure(
        url=url,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=url.startswith("sqlite"),
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_with_connection(connection: Connection) -> None:
    _configure(
        connection=connection,
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:  # el llamador ya trae una conexión abierta
        _run_with_connection(connection)
        return
    engine = build_engine(_database_url(), poolclass=pool.NullPool)
    try:
        with engine.connect() as connection:
            _run_with_connection(connection)
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
