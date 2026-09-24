"""Migraciones: `alembic upgrade head` frente a `SQLModel.metadata` (deriva) y restricciones."""

import os
import subprocess
import sys

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import func, inspect
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, select

from app.core.clock import utcnow
from app.core.db import build_engine
from app.core.settings import API_DIR
from app.models import (
    Achievement,
    ActivityResult,
    ProgressModulo,
    User,
    UserAchievement,
)
from tests.conftest import alembic_config

EXPECTED_TABLES = {
    "users",
    "progress_modulos",
    "activity_results",
    "achievements",
    "user_achievements",
    "usage_events",
    "certificates",
    "chat_sessions",
    "chat_messages",
}


def test_las_tablas_migradas_son_las_del_modelo(engine):
    tables = set(inspect(engine).get_table_names()) - {"alembic_version"}
    assert tables == set(SQLModel.metadata.tables)
    assert tables == EXPECTED_TABLES


def test_sin_deriva_entre_alembic_y_sqlmodel(engine):
    """Si el modelo cambia sin migración (o al revés), esta prueba falla."""
    with engine.connect() as connection:
        context = MigrationContext.configure(
            connection, opts={"compare_type": True, "compare_server_default": True}
        )
        differences = compare_metadata(context, SQLModel.metadata)
    assert differences == []


def test_las_columnas_del_contrato_existen(engine):
    inspector = inspect(engine)
    columns = {t: {c["name"] for c in inspector.get_columns(t)} for t in EXPECTED_TABLES}
    assert columns["users"] == {
        "id",
        "nombre",
        "apellido",
        "tipo_identificacion",
        "numero_identificacion",
        "nivel",
        "rol",
        "created_at",
    }
    assert columns["usage_events"] == {
        "id",
        "user_id",
        "kind",
        "model",
        "input_tokens",
        "output_tokens",
        "cache_read_tokens",
        "cache_creation_tokens",
        "created_at",
    }
    assert {"user_id", "modulo", "seccion_actual", "completado", "tiempo_total_seg"} <= columns[
        "progress_modulos"
    ]


def test_indice_unico_sobre_tipo_y_numero(engine):
    indexes = inspect(engine).get_indexes("users")
    unique = [i for i in indexes if i["unique"]]
    assert [i["column_names"] for i in unique] == [["tipo_identificacion", "numero_identificacion"]]


def _user(numero="123456", tipo="CC") -> User:
    return User(
        nombre="A",
        apellido="B",
        tipo_identificacion=tipo,
        numero_identificacion=numero,
        created_at=utcnow(),
    )


def test_el_par_tipo_numero_es_unico_en_la_base(engine):
    with Session(engine) as session:
        session.add(_user())
        session.commit()
        session.add(_user())
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        session.add(_user(tipo="PA"))  # mismo número, otro tipo: permitido
        session.commit()


def test_progreso_es_unico_por_usuario_y_modulo(engine):
    with Session(engine) as session:
        user = _user()
        session.add(user)
        session.commit()
        session.add(ProgressModulo(user_id=user.id, modulo=1, updated_at=utcnow()))
        session.commit()
        session.add(ProgressModulo(user_id=user.id, modulo=1, updated_at=utcnow()))
        with pytest.raises(IntegrityError):
            session.commit()


def test_logro_es_unico_por_usuario_y_codigo(engine):
    with Session(engine) as session:
        user = _user()
        session.add(user)
        session.add(Achievement(codigo="x", nombre="X", descripcion="d", modulo=1))
        session.commit()
        session.add(UserAchievement(user_id=user.id, codigo="x", obtenido_en=utcnow()))
        session.commit()
        session.add(UserAchievement(user_id=user.id, codigo="x", obtenido_en=utcnow()))
        with pytest.raises(IntegrityError):
            session.commit()


def test_las_claves_foraneas_se_hacen_cumplir(engine):
    with Session(engine) as session:
        session.add(
            ActivityResult(
                user_id=9999,
                activity_id="a",
                modulo=1,
                tipo="quiz",
                puntaje=1,
                intentos=1,
                completada=True,
                created_at=utcnow(),
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_borrar_un_usuario_borra_sus_datos_en_cascada(engine):
    with Session(engine) as session:
        user = _user()
        session.add(user)
        session.commit()
        session.add(ProgressModulo(user_id=user.id, modulo=2, updated_at=utcnow()))
        session.add(
            ActivityResult(
                user_id=user.id,
                activity_id="a",
                modulo=1,
                tipo="quiz",
                puntaje=1,
                intentos=1,
                completada=True,
                created_at=utcnow(),
            )
        )
        session.commit()
        session.delete(user)
        session.commit()
        for model in (ProgressModulo, ActivityResult):
            assert session.exec(select(func.count()).select_from(model)).one() == 0


def test_ida_y_vuelta_de_la_migracion_en_sqlite(tmp_path):
    url = f"sqlite:///{(tmp_path / 'ciclo.db').as_posix()}"
    config = alembic_config(url)
    command.upgrade(config, "head")
    command.downgrade(config, "base")
    engine = build_engine(url)
    try:
        assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
    finally:
        engine.dispose()
    command.upgrade(config, "head")
    engine = build_engine(url)
    try:
        assert set(inspect(engine).get_table_names()) == EXPECTED_TABLES | {"alembic_version"}
    finally:
        engine.dispose()


def test_upgrade_sobre_base_vacia_es_repetible(tmp_path):
    """`upgrade head` dos veces seguidas no falla (la segunda no hace nada)."""
    url = f"sqlite:///{(tmp_path / 'doble.db').as_posix()}"
    config = alembic_config(url)
    command.upgrade(config, "head")
    command.upgrade(config, "head")


def test_alembic_lee_la_url_de_la_configuracion_de_la_app(tmp_path):
    """`alembic upgrade head` (sin nada en alembic.ini) usa DATABASE_URL, igual que la API."""
    database = tmp_path / "por_entorno.db"
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=API_DIR,
        env={**os.environ, "DATABASE_URL": f"sqlite:///{database.as_posix()}"},
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    engine = build_engine(f"sqlite:///{database.as_posix()}")
    try:
        assert set(inspect(engine).get_table_names()) == EXPECTED_TABLES | {"alembic_version"}
    finally:
        engine.dispose()
    ini_lines = (API_DIR / "alembic.ini").read_text(encoding="utf-8").splitlines()
    assert not [line for line in ini_lines if line.strip().startswith("sqlalchemy.url")]
