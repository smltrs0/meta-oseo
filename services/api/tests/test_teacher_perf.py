"""Rendimiento del panel docente (F6-03) con unos miles de filas sembradas.

Se siembra por inserción masiva (`executemany`) y se comprueba que cada endpoint agrega en SQL:
las cifras deben coincidir con las calculadas a mano y el tiempo debe ser razonable. Los límites de
tiempo son holgados (evitan falsos rojos en CI) pero detectarían un recorrido fila a fila en Python.
"""

import csv
import io
import time
from datetime import timedelta

import pytest
from sqlalchemy import insert

from app.models.activity import ActivityResult
from app.models.enums import Rol
from app.models.progress import ProgressModulo
from app.models.usage import UsageEvent
from app.models.user import User
from tests.test_teacher_support import NOW, OPUS

STUDENTS = 3000
MAX_SECONDS = 15.0


@pytest.fixture(autouse=True)
def fixed_now(monkeypatch):
    monkeypatch.setattr("app.routers.teacher.utcnow", lambda: NOW)


@pytest.fixture
def docente(register, db_session):
    session = register(nombre="Doris", apellido="Docente", numero_identificacion="9000000009")
    user = db_session.get(User, session["user"]["id"])
    user.rol = Rol.docente.value
    db_session.add(user)
    db_session.commit()
    return session


@pytest.fixture
def big_cohort(engine, docente):
    """3000 estudiantes. El estudiante `i` (0..2999):

    - completa los módulos `1..(i % 7)` (i % 7 módulos; 0..6), con 60 s en cada módulo con fila;
    - resuelve 3 actividades `m1_a`, `m1_b`, `m2_a`: completada la primera con puntaje 10 * (i % 5),
      las otras dos sin completar (no suman);
    - 2 consultas al mentor, una hoy y otra hace 5 días.
    """
    users = [
        {
            "nombre": f"Nombre{i:04d}",
            "apellido": f"Apellido{i % 50:02d}",
            "tipo_identificacion": "CC",
            "numero_identificacion": f"{10_000_000 + i}",
            "nivel": "pregrado",
            "rol": Rol.estudiante.value,
            "created_at": NOW - timedelta(days=100),
        }
        for i in range(STUDENTS)
    ]
    with engine.begin() as connection:
        connection.execute(insert(User.__table__), users)
        ids = [
            row[0]
            for row in connection.execute(
                User.__table__.select()
                .with_only_columns(User.__table__.c.id)
                .where(User.__table__.c.rol == Rol.estudiante.value)
                .order_by(User.__table__.c.id)
            )
        ]
        progress, results, usage = [], [], []
        for index, user_id in enumerate(ids):
            done = index % 7
            for modulo in range(1, 7):
                if modulo <= done or modulo == 1:
                    progress.append(
                        {
                            "user_id": user_id,
                            "modulo": modulo,
                            "completado": modulo <= done,
                            "tiempo_total_seg": 60,
                            "updated_at": NOW - timedelta(days=index % 40),
                        }
                    )
            for activity_id, modulo, completed in (
                ("m1_a", 1, True),
                ("m1_b", 1, False),
                ("m2_a", 2, False),
            ):
                results.append(
                    {
                        "user_id": user_id,
                        "activity_id": activity_id,
                        "modulo": modulo,
                        "tipo": "quiz",
                        "puntaje": 10 * (index % 5),
                        "intentos": 1 + index % 3,
                        "completada": completed,
                        "created_at": NOW - timedelta(days=index % 40),
                    }
                )
            for days in (0, 5):
                usage.append(
                    {
                        "user_id": user_id,
                        "kind": "chat",
                        "model": OPUS,
                        "input_tokens": 100,
                        "output_tokens": 50,
                        "cache_read_tokens": 0,
                        "cache_creation_tokens": 0,
                        "created_at": NOW - timedelta(days=days, hours=1),
                    }
                )
        connection.execute(insert(ProgressModulo.__table__), progress)
        connection.execute(insert(ActivityResult.__table__), results)
        connection.execute(insert(UsageEvent.__table__), usage)
    if engine.dialect.name == "postgresql":
        # Tras una carga masiva, autovacuum aún no actualizó las estadísticas; sin ellas el
        # planificador elige planes pobres. En producción lo hace solo.
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            connection.exec_driver_sql("ANALYZE")
    return ids


def timed(client, docente, path, **params):
    start = time.perf_counter()
    response = client.get(f"/api/teacher{path}", headers=docente["headers"], params=params)
    elapsed = time.perf_counter() - start
    assert response.status_code == 200, response.text
    assert elapsed < MAX_SECONDS, f"{path} tardó {elapsed:.1f} s"
    print(f"{path} {params}: {elapsed:.2f} s")  # visible con `pytest -s`
    return response


def test_resumen_con_miles_de_estudiantes(client, docente, big_cohort):
    data = timed(client, docente, "/overview").json()
    assert data["estudiantes"] == STUDENTS
    # Todos tienen consulta hoy: todos activos.
    assert data["activos_7d"] == data["activos_30d"] == STUDENTS
    por_k = {b["modulos_completados"]: b["estudiantes"] for b in data["modulos_completados"]}
    esperado = {k: sum(1 for i in range(STUDENTS) if i % 7 == k) for k in range(7)}
    assert por_k == esperado
    # Puntaje: 10 * (i % 5), promedio 20 (3000 es múltiplo de 5), mediana 20.
    assert data["puntaje"] == {"promedio": 20.0, "mediana": 20.0}
    tiempos = {t["modulo"]: t for t in data["tiempo_por_modulo"]}
    assert tiempos[1]["estudiantes"] == STUDENTS  # todos tienen fila en el módulo 1
    assert tiempos[1]["tiempo_promedio_seg"] == 60.0
    assert tiempos[6]["estudiantes"] == esperado[6]


def test_lista_paginada_con_miles(client, docente, big_cohort):
    page = timed(client, docente, "/students", page=1, page_size=100).json()
    assert page["total"] == STUDENTS and page["total_pages"] == 30
    assert len(page["estudiantes"]) == 100
    por_puntaje = timed(
        client, docente, "/students", orden="puntaje", page=30, page_size=100
    ).json()
    assert len(por_puntaje["estudiantes"]) == 100
    assert [s["puntaje_total"] for s in por_puntaje["estudiantes"]] == [0] * 100  # cola: puntaje 0
    por_actividad = timed(
        client, docente, "/students", orden="ultima_actividad", page_size=100
    ).json()
    assert all(s["ultima_actividad"].startswith("2026-09-24") for s in por_actividad["estudiantes"])
    filtrado = timed(client, docente, "/students", q="Apellido07", page_size=100).json()
    assert filtrado["total"] == STUDENTS // 50
    unico = timed(client, docente, "/students", q=f"{10_000_000 + 1234}").json()
    assert unico["total"] == 1
    assert unico["estudiantes"][0]["numero_identificacion"] == "10001234"
    assert unico["estudiantes"][0]["identificacion_completa"] is True


def test_actividades_y_mentor_con_miles(client, docente, big_cohort):
    stats = timed(client, docente, "/activities/stats").json()
    by_id = {a["activity_id"]: a for a in stats["actividades"]}
    assert by_id["m1_a"]["estudiantes_intentaron"] == STUDENTS
    assert by_id["m1_a"]["estudiantes_completaron"] == STUDENTS
    assert by_id["m1_a"]["puntaje_promedio"] == 20.0
    assert by_id["m1_b"]["estudiantes_completaron"] == 0
    assert by_id["m1_b"]["tasa_finalizacion"] == 0.0
    assert by_id["m1_b"]["puntaje_promedio"] is None
    # Los dos sin completar son los más difíciles.
    assert {a["activity_id"] for a in stats["mas_dificiles"][:2]} == {"m1_b", "m2_a"}

    mentor = timed(client, docente, "/mentor/usage", dias=30, limite=50).json()
    assert mentor["totales"]["consultas"] == 2 * STUDENTS
    assert mentor["totales"]["usuarios"] == STUDENTS
    assert mentor["totales"]["tokens_entrada"] == 100 * 2 * STUDENTS
    assert len(mentor["top_usuarios"]) == 50


def test_csv_con_miles_de_filas(client, docente, big_cohort):
    start = time.perf_counter()
    response = client.get("/api/teacher/export/progress.csv", headers=docente["headers"])
    elapsed = time.perf_counter() - start
    assert response.status_code == 200
    assert elapsed < MAX_SECONDS, f"CSV tardó {elapsed:.1f} s"
    print(f"CSV: {elapsed:.2f} s, {len(response.content) / 1e6:.1f} MB")
    rows = list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"), newline="")))
    assert len(rows) == 1 + STUDENTS * 6
    assert len({row[0] for row in rows[1:]}) == STUDENTS
