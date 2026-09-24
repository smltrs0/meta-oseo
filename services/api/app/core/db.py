"""Motor y sesión de base de datos (SQLite en desarrollo, PostgreSQL en producción)."""

import os
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, Request
from sqlalchemy import event, inspect
from sqlalchemy.engine import URL, Engine, make_url
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine

from app.core.settings import API_DIR


def resolve_database_url(database_url: str) -> URL:
    """Convierte la cadena de conexión en URL; una ruta SQLite relativa cuelga de `services/api`.

    Así `sqlite:///./data/ova.db` apunta al mismo archivo lo lance quien lo lance, y coincide
    con `services/api/data/` del .gitignore.
    """
    url = make_url(database_url)
    database = url.database
    is_file_database = (
        url.get_backend_name() == "sqlite"
        and database
        and database != ":memory:"
        and not database.startswith("file:")
    )
    if is_file_database and not Path(database).is_absolute():
        url = url.set(database=os.path.normpath(API_DIR / database))
    return url


def build_engine(database_url: str, **engine_kwargs: Any) -> Engine:
    """Crea el motor. No abre conexiones ni toca el disco hasta la primera consulta.

    - SQLite: `check_same_thread=False` (FastAPI atiende en varios hilos), `PRAGMA
      foreign_keys=ON` en cada conexión (SQLite las ignora por defecto) y creación perezosa
      del directorio del archivo (`data/`).
    - PostgreSQL (psycopg): `pool_pre_ping` para descartar conexiones caídas.
    """
    url = resolve_database_url(database_url)

    if url.get_backend_name() == "sqlite":
        in_memory = url.database in (None, "", ":memory:")
        engine_kwargs.setdefault("connect_args", {"check_same_thread": False})
        if in_memory:
            # Una base en memoria solo existe dentro de su conexión: compartirla entre hilos.
            engine_kwargs.setdefault("poolclass", StaticPool)
        engine = create_engine(url, **engine_kwargs)

        @event.listens_for(engine, "do_connect")
        def _ensure_directory(dialect: Any, conn_rec: Any, cargs: Any, cparams: dict[str, Any]):
            # El archivo llega como argumento posicional o con nombre según la versión.
            database = cparams.get("database") or (cargs[0] if cargs else None)
            if database and database != ":memory:" and not str(database).startswith("file:"):
                Path(database).parent.mkdir(parents=True, exist_ok=True)

        @event.listens_for(engine, "connect")
        def _enable_foreign_keys(dbapi_connection: Any, connection_record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine

    engine_kwargs.setdefault("pool_pre_ping", True)
    return create_engine(url, **engine_kwargs)


def ensure_schema(engine: Engine) -> None:
    """Falla con un mensaje claro si la base no tiene el esquema (falta `alembic upgrade head`)."""
    with engine.connect() as connection:
        tables = set(inspect(connection).get_table_names())
    if "achievements" not in tables or "users" not in tables:
        raise RuntimeError(
            "La base de datos no tiene el esquema de la API. "
            "Ejecuta `uv run alembic upgrade head` en services/api antes de arrancar."
        )


def dialect_insert(session: Session) -> Callable[..., Any]:
    """`insert()` del dialecto activo, con `on_conflict_do_nothing` / `on_conflict_do_update`.

    SQLite (desarrollo) y PostgreSQL (producción) comparten esa sintaxis, lo que permite
    operaciones atómicas e idempotentes sin depender de capturar `IntegrityError` a mitad de
    una transacción (los SAVEPOINT de pysqlite son frágiles).
    """
    dialect = session.get_bind().dialect.name
    if dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert as sqlite_insert

        return sqlite_insert
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as postgresql_insert

        return postgresql_insert
    raise NotImplementedError(f"Dialecto de base de datos no soportado: {dialect}")


def get_session(request: Request) -> Iterator[Session]:
    """Dependencia FastAPI: una sesión por petición sobre el motor de la app."""
    # expire_on_commit=False: tras `commit()` los objetos siguen legibles sin otra consulta.
    with Session(request.app.state.engine, expire_on_commit=False) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
