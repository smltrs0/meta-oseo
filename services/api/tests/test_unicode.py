"""Entradas Unicode que la base de datos no puede guardar: 422, nunca 500.

Python acepta al leer JSON los sustitutos sueltos ("\\ud800") y NaN/Infinity, y PostgreSQL no
admite U+0000 en columnas de texto. Sin validación explícita serían errores 500.
"""

import pytest
from sqlmodel import select

from app.core.text import ensure_storable, printable_utf8
from app.models.activity import ActivityResult

JSON = {"Content-Type": "application/json"}
LONE_SURROGATE = "\\ud800"  # escape JSON de un sustituto suelto (dentro de un literal JSON)


def raw_register(client, nombre="Ana", numero="123456", tipo="CC"):
    body = (
        f'{{"nombre":"{nombre}","apellido":"Pérez",'
        f'"tipo_identificacion":"{tipo}","numero_identificacion":"{numero}"}}'
    )
    return client.post("/api/auth/register", content=body.encode("utf-8"), headers=JSON)


@pytest.mark.parametrize(
    "campo",
    [
        {"nombre": LONE_SURROGATE},
        {"numero": LONE_SURROGATE},
        {"tipo": LONE_SURROGATE},
        {"nombre": "Ana\\u0000"},
    ],
)
def test_registro_con_texto_no_guardable_devuelve_422(client, campo):
    response = raw_register(client, **campo)
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)


def test_login_con_sustituto_suelto_devuelve_422(client):
    response = client.post(
        "/api/auth/login",
        content=f'{{"tipo_identificacion":"CC","numero_identificacion":"{LONE_SURROGATE}"}}'.encode(),
        headers=JSON,
    )
    assert response.status_code == 422


def test_seccion_actual_con_sustituto_suelto_devuelve_422(client, auth):
    response = client.put(
        "/api/progress/1",
        content=f'{{"seccion_actual":"{LONE_SURROGATE}"}}'.encode(),
        headers={**auth["headers"], **JSON},
    )
    assert response.status_code == 422


def test_detalle_con_sustituto_suelto_devuelve_422(client, auth):
    response = client.post(
        "/api/activities/m1_x/result",
        content=(
            '{"modulo":1,"tipo":"quiz","puntaje":1,"intentos":1,"completada":true,'
            f'"detalle":{{"a":"{LONE_SURROGATE}"}}}}'
        ).encode(),
        headers={**auth["headers"], **JSON},
    )
    assert response.status_code == 422


def test_detalle_con_nul_dentro_de_un_texto_se_guarda(client, auth, db_session):
    """El JSON escapa U+0000 como texto, así que la columna JSON lo admite en ambas bases."""
    response = client.post(
        "/api/activities/m1_x/result",
        content=(
            b'{"modulo":1,"tipo":"quiz","puntaje":1,"intentos":1,"completada":true,'
            b'"detalle":{"a":"x\\u0000y"}}'
        ),
        headers={**auth["headers"], **JSON},
    )
    assert response.status_code == 200
    row = db_session.exec(select(ActivityResult)).one()
    assert row.detalle == {"a": "x\x00y"}


def test_ensure_storable():
    assert ensure_storable("Ana María ñ 🙂") == "Ana María ñ 🙂"
    with pytest.raises(ValueError, match="nulo"):
        ensure_storable("a\x00b")
    with pytest.raises(ValueError, match="Unicode"):
        ensure_storable("a\ud800b")


def test_printable_utf8_reemplaza_los_sustitutos_sueltos():
    assert printable_utf8("a\ud800b") == "a�b"
    assert printable_utf8("normal ñ") == "normal ñ"
