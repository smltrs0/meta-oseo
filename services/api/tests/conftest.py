"""Fixtures compartidas de las pruebas.

Cada prueba recibe una base de datos limpia con el esquema creado por `alembic upgrade head`
(así las migraciones se ejercitan en toda la suite):

- Por defecto, SQLite: un archivo temporal copiado de una plantilla migrada una sola vez.
- Con `TEST_DATABASE_URL=postgresql+psycopg://...`, PostgreSQL real: el esquema se recrea una
  vez por sesión con `alembic upgrade head` y se vacían las tablas antes de cada prueba. Por
  seguridad el nombre de la base debe empezar por `ova_` (la instancia local de Laragon tiene
  bases de otros proyectos que jamás deben tocarse).
"""

import os
import shutil
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

# Aislar la suite del entorno del desarrollador: estas variables tienen prioridad sobre el `.env`
# de la raíz y deben fijarse ANTES de importar `app.main` (crea una app con la configuración
# global al importarse).
for _name in (
    "DATABASE_URL",
    "SECRET_KEY",
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    "ALLOWED_ORIGINS",
    "TRUST_PROXY",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "MENTOR_EFFORT",
    "MENTOR_MAX_TOKENS",
):
    os.environ.pop(_name, None)
os.environ["ENV"] = "dev"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import MetaData, text  # noqa: E402
from sqlalchemy.engine import Engine, make_url  # noqa: E402
from sqlmodel import Session, SQLModel  # noqa: E402

from app.core.db import build_engine  # noqa: E402
from app.core.settings import API_DIR, Settings  # noqa: E402
from app.main import create_app  # noqa: E402

TEST_SECRET_KEY = "clave-solo-para-pruebas-de-la-api-ova-0123456789"
SAFE_DATABASE_PREFIX = "ova_"


def alembic_config(database_url: str) -> Config:
    """Configuración de Alembic apuntando a `database_url` (sin tocar el logging de pytest)."""
    config = Config(str(API_DIR / "alembic.ini"))
    config.attributes["database_url"] = database_url
    config.attributes["configure_logger"] = False
    return config


def _sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


@pytest.fixture(scope="session")
def external_database_url() -> str | None:
    """`TEST_DATABASE_URL` (PostgreSQL real), validada; `None` si se usa SQLite."""
    raw = os.environ.get("TEST_DATABASE_URL", "").strip()
    if not raw:
        return None
    url = make_url(raw)
    if url.get_backend_name() == "sqlite":
        return raw
    name = url.database or ""
    if not name.startswith(SAFE_DATABASE_PREFIX):
        pytest.exit(
            f"TEST_DATABASE_URL apunta a la base {name!r}: solo se permiten bases con prefijo "
            f"{SAFE_DATABASE_PREFIX!r} para no tocar otros proyectos.",
            returncode=2,
        )
    if url.get_backend_name() == "postgresql":
        raw = "postgresql+psycopg://" + raw.split("://", 1)[1]
    return raw


@pytest.fixture(scope="session")
def database_template(
    external_database_url: str | None, tmp_path_factory: pytest.TempPathFactory
) -> Callable[[Path], str]:
    """Devuelve una función que entrega la URL de una base limpia y migrada para cada prueba."""
    if external_database_url and not external_database_url.startswith("sqlite"):
        # PostgreSQL real: recrear el esquema una vez y vaciar las tablas antes de cada prueba.
        engine = build_engine(external_database_url)
        metadata = MetaData()
        metadata.reflect(bind=engine)
        metadata.drop_all(bind=engine)  # solo las tablas que existan en ESTA base ova_*
        engine.dispose()
        command.upgrade(alembic_config(external_database_url), "head")

        def reset_postgres(_: Path) -> str:
            reset_engine = build_engine(external_database_url)
            # También `achievements`: el arranque de la app (lifespan) la vuelve a sembrar.
            tables = ", ".join(f'"{table.name}"' for table in SQLModel.metadata.sorted_tables)
            with reset_engine.begin() as connection:
                connection.execute(text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE"))
            reset_engine.dispose()
            return external_database_url

        return reset_postgres

    template = tmp_path_factory.mktemp("plantilla") / "plantilla.db"
    command.upgrade(alembic_config(_sqlite_url(template)), "head")

    def copy_sqlite(directory: Path) -> str:
        target = directory / "prueba.db"
        shutil.copyfile(template, target)
        return _sqlite_url(target)

    return copy_sqlite


@pytest.fixture
def database_url(database_template: Callable[[Path], str], tmp_path: Path) -> str:
    return database_template(tmp_path)


@pytest.fixture
def engine(database_url: str) -> Iterator[Engine]:
    engine = build_engine(database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def settings(database_url: str) -> Settings:
    """Configuración de pruebas: sin `.env`, clave propia y la base temporal."""
    return Settings(
        _env_file=None,
        env="dev",
        secret_key=TEST_SECRET_KEY,
        database_url=database_url,
        allowed_origins=["http://localhost:5173"],
    )


@pytest.fixture
def make_app(engine: Engine, settings: Settings) -> Callable[..., FastAPI]:
    """Fábrica de apps con la base de la prueba; admite ajustes de configuración."""

    def factory(**overrides: Any) -> FastAPI:
        return create_app(settings.model_copy(update=overrides), engine=engine)

    return factory


@pytest.fixture
def app(make_app: Callable[..., FastAPI]) -> FastAPI:
    return make_app()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    """Cliente con el ciclo de vida activo (esquema verificado y logros sembrados)."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_session(engine: Engine, client: TestClient) -> Iterator[Session]:
    """Sesión directa a la base de la prueba (para preparar o comprobar datos)."""
    with Session(engine, expire_on_commit=False) as session:
        yield session


ANA = {
    "nombre": "Ana",
    "apellido": "Pérez",
    "tipo_identificacion": "CC",
    "numero_identificacion": "1023456789",
}


@pytest.fixture
def register(client: TestClient) -> Callable[..., dict[str, Any]]:
    """Registra un usuario y devuelve `{"headers", "user", "token"}`."""

    def do_register(**overrides: str) -> dict[str, Any]:
        body = {**ANA, **overrides}
        response = client.post("/api/auth/register", json=body)
        assert response.status_code == 201, response.text
        data = response.json()
        return {
            "headers": {"Authorization": f"Bearer {data['access_token']}"},
            "user": data["user"],
            "token": data["access_token"],
        }

    return do_register


@pytest.fixture
def auth(register: Callable[..., dict[str, Any]]) -> dict[str, Any]:
    """Usuario Ana ya registrado."""
    return register()
