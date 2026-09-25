"""Migraciones: `alembic upgrade head` frente a `SQLModel.metadata` (deriva) y restricciones."""

import os
import subprocess
import sys

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import func, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, select

from app.core.clock import utcnow
from app.core.db import build_engine
from app.core.settings import API_DIR
from app.models import (
    Achievement,
    ActivityResult,
    Certificate,
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
        # PYTHONUTF8: Alembic imprime el título de cada migración (con acentos) y en Windows
        # la salida por defecto es cp1252, que el `encoding="utf-8"` de abajo no decodificaría.
        env={
            **os.environ,
            "DATABASE_URL": f"sqlite:///{database.as_posix()}",
            "PYTHONUTF8": "1",
        },
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


def _certificate(user_id: int, codigo: str) -> Certificate:
    return Certificate(
        user_id=user_id,
        codigo=codigo,
        nombre="Ana",
        apellido="Pérez",
        tipo_identificacion="CC",
        numero_identificacion="1023456789",
        puntaje_total=10,
        created_at=utcnow(),
    )


def test_certificates_tiene_la_instantanea_y_un_indice_unico_por_usuario(engine):
    inspector = inspect(engine)
    columnas = {c["name"]: c for c in inspector.get_columns("certificates")}
    assert set(columnas) == {
        "id",
        "user_id",
        "codigo",
        "nombre",
        "apellido",
        "tipo_identificacion",
        "numero_identificacion",
        "puntaje_total",
        "puntaje_obligatorias",
        "puntaje_maximo",
        "created_at",
    }
    for nombre in ("nombre", "apellido", "tipo_identificacion", "numero_identificacion"):
        assert columnas[nombre]["nullable"] is False
        assert columnas[nombre]["default"] is None  # el valor por defecto de la migración se quitó
    assert columnas["puntaje_obligatorias"]["nullable"] is True
    assert columnas["puntaje_maximo"]["nullable"] is True
    unicos = {
        tuple(i["column_names"]) for i in inspector.get_indexes("certificates") if i["unique"]
    }
    assert unicos == {("user_id",), ("codigo",)}


def test_un_usuario_no_puede_tener_dos_certificados(engine):
    with Session(engine) as session:
        user = _user()
        session.add(user)
        session.commit()
        session.add(_certificate(user.id, "OVA-2222-3333"))
        session.commit()
        session.add(_certificate(user.id, "OVA-4444-5555"))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        otro = _user(numero="654321")
        session.add(otro)
        session.commit()
        session.add(_certificate(otro.id, "OVA-2222-3333"))  # código repetido
        with pytest.raises(IntegrityError):
            session.commit()


def test_migrar_conserva_las_filas_de_certificados_previas(tmp_path):
    """De la revisión inicial a `head` con una fila ya guardada, y de vuelta sin perderla."""
    url = f"sqlite:///{(tmp_path / 'datos.db').as_posix()}"
    config = alembic_config(url)
    command.upgrade(config, "044fa6bcf84f")
    engine = build_engine(url)
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users (id, nombre, apellido, tipo_identificacion, "
                    "numero_identificacion, nivel, rol, created_at) VALUES "
                    "(1, 'A', 'B', 'CC', '123456', 'pregrado', 'estudiante', '2026-09-23 00:00:00')"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO certificates (user_id, codigo, puntaje_total, created_at) "
                    "VALUES (1, 'OVA-2222-3333', 50, '2026-09-23 00:00:00')"
                )
            )
        command.upgrade(config, "head")
        with engine.connect() as connection:
            fila = connection.execute(
                text(
                    "SELECT codigo, nombre, apellido, puntaje_total, puntaje_maximo "
                    "FROM certificates"
                )
            ).one()
        assert tuple(fila) == ("OVA-2222-3333", "", "", 50, None)
        command.downgrade(config, "044fa6bcf84f")
        with engine.connect() as connection:
            columnas = {c["name"] for c in inspect(connection).get_columns("certificates")}
            fila = connection.execute(text("SELECT codigo, puntaje_total FROM certificates")).one()
        assert columnas == {"id", "user_id", "codigo", "puntaje_total", "created_at"}
        assert tuple(fila) == ("OVA-2222-3333", 50)
    finally:
        engine.dispose()
