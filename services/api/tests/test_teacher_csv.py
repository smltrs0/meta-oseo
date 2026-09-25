"""Exportación CSV del panel docente (F6-03): formato, enmascarado e inyección de fórmulas."""

import csv
import io

import pytest

from app.models.enums import Rol
from app.models.user import User
from app.services.teacher_csv import FORMULA_PREFIXES, UTF8_BOM, csv_safe
from tests.test_teacher_support import NOW, add_user, seed_cohort

URL = "/api/teacher/export/progress.csv"
HEADER = [
    "id_estudiante",
    "nombre",
    "apellido",
    "tipo_identificacion",
    "numero_identificacion",
    "nivel",
    "modulo",
    "completado",
    "seccion_actual",
    "tiempo_total_seg",
    "puntaje_modulo",
    "actividades_completadas",
    "ultima_actualizacion",
    "puntaje_total",
]


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
    session["id"] = user.id
    return session


def download(client, docente, **params):
    response = client.get(URL, headers=docente["headers"], params=params)
    assert response.status_code == 200, response.text
    return response


def parse(response) -> list[list[str]]:
    # `utf-8-sig` descarta el BOM: es como lo abre Excel.
    return list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"), newline="")))


# --- csv_safe --------------------------------------------------------------------------------


@pytest.mark.parametrize("prefix", ["=", "+", "-", "@", "\t", "\r"])
def test_csv_safe_prefija_con_comilla_las_celdas_peligrosas(prefix):
    assert csv_safe(f"{prefix}SUM(1+1)") == f"'{prefix}SUM(1+1)"


@pytest.mark.parametrize(
    "value", ["Ana", "O'Brien", "", " =espacio antes", "a=b", "1+1", 12, -5, 0.5]
)
def test_csv_safe_no_toca_lo_demas(value):
    assert csv_safe(value) == value


def test_todos_los_prefijos_estan_cubiertos():
    assert set(FORMULA_PREFIXES) >= {"=", "+", "-", "@", "\t"}


# --- Endpoint --------------------------------------------------------------------------------


def test_cabeceras_y_bom(client, docente, db_session):
    seed_cohort(db_session)
    response = download(client, docente)
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert (
        response.headers["content-disposition"]
        == 'attachment; filename="progreso_ova_2026-09-24.csv"'
    )
    assert response.headers["cache-control"] == "no-store"
    assert response.content.startswith(UTF8_BOM.encode("utf-8"))  # b"\xef\xbb\xbf"
    assert response.content.startswith(b"\xef\xbb\xbf")
    # Un solo BOM, al inicio, y la cabecera exacta.
    assert response.content.count(b"\xef\xbb\xbf") == 1
    assert parse(response)[0] == HEADER
    assert b"\r\n" in response.content  # fin de línea CRLF, el de Excel


def test_una_fila_por_estudiante_y_modulo(client, docente, db_session):
    ids = seed_cohort(db_session, docente_id=docente["id"])
    rows = parse(download(client, docente))
    # 5 estudiantes x 6 módulos + cabecera. El docente no sale.
    assert len(rows) == 1 + 5 * 6
    assert all(len(row) == len(HEADER) for row in rows)
    assert "Doris" not in {row[1] for row in rows}
    assert [row[6] for row in rows[1:7]] == ["1", "2", "3", "4", "5", "6"]
    ana = [row for row in rows[1:] if row[0] == str(ids["ana"])]
    assert len(ana) == 6
    assert ana[0] == [
        str(ids["ana"]), "Ana", "Pérez", "CC", "*******789", "pregrado",
        "1", "si", "fin", "600", "160", "2", "2026-09-21T15:00:00Z", "260",
    ]  # fmt: skip
    # m1: mejores completados 90 (m1_a) + 70 (m1_b) = 160 en 2 actividades.
    assert ana[1][6:13] == ["2", "si", "", "300", "100", "1", "2026-09-21T15:00:00Z"]
    assert ana[2][6:13] == [
        "3",
        "no",
        "mecanotransduccion",
        "100",
        "0",
        "0",
        "2026-09-21T15:00:00Z",
    ]
    assert ana[3][6:13] == ["4", "no", "", "0", "0", "0", ""]
    assert {row[13] for row in ana} == {"260"}  # el total del estudiante se repite en cada fila


def test_estudiante_sin_datos_tiene_seis_filas_en_cero(client, docente, db_session):
    ids = seed_cohort(db_session)
    rows = [row for row in parse(download(client, docente)) if row[0] == str(ids["carla"])]
    assert len(rows) == 6
    for modulo, row in enumerate(rows, start=1):
        assert row[6:] == [str(modulo), "no", "", "0", "0", "0", "", "0"]
    assert rows[0][5] == "posgrado"


def test_diego_completo_y_puntaje_por_modulo(client, docente, db_session):
    ids = seed_cohort(db_session)
    rows = [row for row in parse(download(client, docente)) if row[0] == str(ids["diego"])]
    assert [row[7] for row in rows] == ["si"] * 6
    assert [row[10] for row in rows] == ["0", "0", "0", "0", "0", "300"]  # m6_a en el módulo 6
    assert {row[13] for row in rows} == {"300"}
    assert rows[0][3:5] == ["CE", "*******004"]


def test_identificacion_completa_solo_si_se_pide(client, docente, db_session):
    seed_cohort(db_session)
    masked = parse(download(client, docente))[1:]
    assert all(row[4].startswith("*") for row in masked)
    assert not any("1023456789" in ",".join(row) for row in masked)
    full = parse(download(client, docente, identificacion="completa"))[1:]
    assert {row[4] for row in full} == {
        "1023456789",
        "2000000002",
        "3000000003",
        "4000000004",
        "5000000005",
    }
    explicit = parse(download(client, docente, identificacion="enmascarada"))[1:]
    assert all(row[4].startswith("*") for row in explicit)
    assert (
        client.get(URL, headers=docente["headers"], params={"identificacion": "x"}).status_code
        == 422
    )


def test_csv_sin_estudiantes_solo_trae_la_cabecera(client, docente):
    response = download(client, docente)
    assert response.content.startswith(b"\xef\xbb\xbf")
    assert parse(response) == [HEADER]


def test_nombre_malicioso_no_es_una_formula(client, docente, register):
    """Un estudiante se registra con nombres que Excel ejecutaría como fórmula."""
    payloads = [
        ('=HYPERLINK("http://malo.example","clic")', "Uno"),
        ("+1+1", "Dos"),
        ("-2+3", "Tres"),
        ("@SUM(A1:A9)", "Cuatro"),
    ]
    for index, (nombre, apellido) in enumerate(payloads):
        register(nombre=nombre, apellido=apellido, numero_identificacion=f"70000000{index}")
    # El registro no admite tabuladores: ese caso se siembra directo en la base.
    from sqlmodel import Session

    with Session(client.app.state.engine) as session:
        add_user(session, "\t=cmd", "Tab", "7100000001")
        add_user(session, "Normal", "=1+1", "7100000002")
        session.commit()

    response = download(client, docente)
    rows = parse(response)[1:]
    nombres = {row[1] for row in rows}
    assert '\'=HYPERLINK("http://malo.example","clic")' in nombres
    assert {"'+1+1", "'-2+3", "'@SUM(A1:A9)", "'\t=cmd"} <= nombres
    assert "'=1+1" in {row[2] for row in rows}
    # Ninguna celda de texto empieza por un carácter de fórmula.
    for row in rows:
        for cell in row:
            assert not cell.startswith(FORMULA_PREFIXES), cell
    # Los nombres normales no cambian.
    assert "Normal" in nombres


def test_acentos_y_comas_se_exportan_bien(client, docente, db_session):
    add_user(db_session, 'José, el "Grande"', "Muñoz-Ñandú", "7200000002")
    db_session.commit()
    rows = parse(download(client, docente))
    assert rows[1][1] == 'José, el "Grande"'
    assert rows[1][2] == "Muñoz-Ñandú"
    assert 'José, el ""Grande""' in download(client, docente).content.decode("utf-8-sig")


def test_solo_docentes_descargan_el_csv(client, register, db_session):
    estudiante = register(numero_identificacion="8000000008")
    seed_cohort(db_session)
    response = client.get(URL, headers=estudiante["headers"])
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "no_autorizado"
    assert b"Ana" not in response.content
