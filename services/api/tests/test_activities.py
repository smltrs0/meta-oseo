"""Resultados de actividades y regla de puntaje (F1-06)."""

import json
import re

import pytest
from sqlalchemy import func
from sqlmodel import select

from app.models.activity import ActivityResult

ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def body(**overrides):
    return {
        "modulo": 1,
        "tipo": "multicapa",
        "puntaje": 80,
        "intentos": 2,
        "completada": True,
        **overrides,
    }


def post_result(client, auth, activity_id="m1_capas_hueso", **overrides):
    return client.post(
        f"/api/activities/{activity_id}/result", headers=auth["headers"], json=body(**overrides)
    )


def total(client, auth):
    return client.get("/api/progress", headers=auth["headers"]).json()["puntaje_total"]


def test_resultado_feliz_con_la_forma_del_contrato(client, auth):
    response = post_result(client, auth)
    assert response.status_code == 200
    data = response.json()
    assert set(data) == {"resultado", "puntaje_total", "logros_nuevos"}
    assert data["puntaje_total"] == 80
    assert data["logros_nuevos"] == []
    resultado = data["resultado"]
    assert set(resultado) == {
        "activity_id",
        "modulo",
        "tipo",
        "puntaje",
        "intentos",
        "completada",
        "created_at",
    }
    assert resultado["activity_id"] == "m1_capas_hueso"
    assert resultado["modulo"] == 1
    assert resultado["tipo"] == "multicapa"
    assert resultado["puntaje"] == 80
    assert resultado["intentos"] == 2
    assert resultado["completada"] is True
    assert ISO_UTC.match(resultado["created_at"])


def test_el_puntaje_total_del_progreso_refleja_las_actividades(client, auth):
    post_result(client, auth, "m1_a", puntaje=70)
    post_result(client, auth, "m1_b", puntaje=30)
    assert total(client, auth) == 100


def test_cuenta_el_mejor_puntaje_por_actividad(client, auth):
    assert post_result(client, auth, puntaje=80).json()["puntaje_total"] == 80
    assert post_result(client, auth, puntaje=50).json()["puntaje_total"] == 80  # peor: no baja
    assert post_result(client, auth, puntaje=100).json()["puntaje_total"] == 100  # mejor: sube
    assert total(client, auth) == 100


def test_actividad_repetida_no_acumula_puntos(client, auth):
    for _ in range(4):
        assert post_result(client, auth, puntaje=80).json()["puntaje_total"] == 80


def test_actividades_distintas_si_se_suman(client, auth):
    post_result(client, auth, "m1_capas_hueso", puntaje=80)
    data = post_result(client, auth, "m1_quiz", tipo="quiz", puntaje=50).json()
    assert data["puntaje_total"] == 130


def test_intento_incompleto_no_puntua(client, auth):
    data = post_result(client, auth, puntaje=90, completada=False).json()
    assert data["puntaje_total"] == 0
    assert data["resultado"]["completada"] is False
    assert data["resultado"]["puntaje"] == 90  # el historial conserva el intento tal cual


def test_un_incompleto_posterior_no_reemplaza_el_mejor_completado(client, auth):
    assert post_result(client, auth, puntaje=60).json()["puntaje_total"] == 60
    assert post_result(client, auth, puntaje=100, completada=False).json()["puntaje_total"] == 60
    assert post_result(client, auth, puntaje=70).json()["puntaje_total"] == 70


def test_completada_con_puntaje_cero_suma_cero(client, auth):
    assert post_result(client, auth, puntaje=0).json()["puntaje_total"] == 0


def test_cada_llamada_guarda_una_fila_de_historial(client, auth, db_session):
    post_result(client, auth, puntaje=10, completada=False)
    post_result(client, auth, puntaje=80)
    post_result(client, auth, puntaje=50)
    rows = db_session.exec(select(ActivityResult).order_by(ActivityResult.id)).all()
    assert [(r.puntaje, r.completada) for r in rows] == [(10, False), (80, True), (50, True)]
    assert {r.user_id for r in rows} == {auth["user"]["id"]}


def test_el_puntaje_es_por_usuario(client, auth, register):
    other = register(tipo_identificacion="TI", numero_identificacion="XYZ12345")
    post_result(client, auth, puntaje=90)
    assert total(client, other) == 0
    assert post_result(client, other, puntaje=20).json()["puntaje_total"] == 20
    assert total(client, auth) == 90


@pytest.mark.parametrize("activity_id", ["a", "m1_capas-hueso", "0" * 64, "x-y_z9"])
def test_activity_id_valido(client, auth, activity_id):
    assert post_result(client, auth, activity_id).status_code == 200


@pytest.mark.parametrize(
    "activity_id", ["M1_Capas", "a" * 65, "con espacio", "punto.punto", "ñandú", "hola!", "a%20b"]
)
def test_activity_id_invalido_devuelve_422(client, auth, activity_id):
    assert post_result(client, auth, activity_id).status_code == 422


@pytest.mark.parametrize(
    "tipo",
    [
        "multicapa",
        "arrastre-molecular",
        "relacion-columnas",
        "quiz",
        "video-texto",
        "exploracion-3d",
    ],
)
def test_los_seis_tipos_del_contrato_son_validos(client, auth, tipo):
    response = post_result(client, auth, f"act_{tipo}", tipo=tipo)
    assert response.status_code == 200
    assert response.json()["resultado"]["tipo"] == tipo


@pytest.mark.parametrize(
    "overrides",
    [
        {"tipo": "otro"},
        {"tipo": ""},
        {"puntaje": -1},
        {"puntaje": 1001},
        {"puntaje": 1.5},
        {"puntaje": "alto"},
        {"intentos": 0},
        {"intentos": 101},
        {"modulo": 0},
        {"modulo": 7},
        {"completada": "quizás"},
        {"detalle": [1, 2, 3]},
        {"detalle": "texto"},
    ],
)
def test_cuerpo_invalido_devuelve_422(client, auth, overrides):
    assert post_result(client, auth, **overrides).status_code == 422


@pytest.mark.parametrize("campo", ["modulo", "tipo", "puntaje", "intentos", "completada"])
def test_faltan_campos_obligatorios(client, auth, campo):
    payload = body()
    del payload[campo]
    response = client.post("/api/activities/m1_x/result", headers=auth["headers"], json=payload)
    assert response.status_code == 422


@pytest.mark.parametrize(("puntaje", "intentos"), [(0, 1), (1000, 100), (1000, 1), (0, 100)])
def test_limites_validos(client, auth, puntaje, intentos):
    response = post_result(client, auth, puntaje=puntaje, intentos=intentos)
    assert response.status_code == 200
    assert response.json()["puntaje_total"] == puntaje


def test_detalle_se_guarda_y_es_opcional(client, auth, db_session):
    detalle = {"capas": ["periostio", "endostio"], "tiempo": {"seg": 12}, "nota": "ñandú"}
    assert post_result(client, auth, "con_detalle", detalle=detalle).status_code == 200
    assert post_result(client, auth, "sin_detalle").status_code == 200
    assert post_result(client, auth, "detalle_nulo", detalle=None).status_code == 200
    rows = {
        r.activity_id: r.detalle
        for r in db_session.exec(select(ActivityResult).order_by(ActivityResult.id))
    }
    assert rows == {"con_detalle": detalle, "sin_detalle": None, "detalle_nulo": None}


def _detail_of_size(target_bytes: int, char: str = "a") -> dict:
    """Objeto cuyo JSON compacto mide exactamente `target_bytes` bytes en UTF-8."""
    overhead = len(json.dumps({"k": ""}, separators=(",", ":"), ensure_ascii=False).encode())
    unit = len(char.encode())
    count, remainder = divmod(target_bytes - overhead, unit)
    assert remainder == 0
    detail = {"k": char * count}
    assert (
        len(json.dumps(detail, separators=(",", ":"), ensure_ascii=False).encode()) == target_bytes
    )
    return detail


def test_detalle_de_4_kb_exactos_es_valido(client, auth):
    assert post_result(client, auth, detalle=_detail_of_size(4096)).status_code == 200


def test_detalle_mayor_de_4_kb_devuelve_422(client, auth):
    assert post_result(client, auth, detalle=_detail_of_size(4097)).status_code == 422
    assert post_result(client, auth, detalle=_detail_of_size(20_000)).status_code == 422


def test_el_limite_del_detalle_se_mide_en_bytes_no_en_caracteres(client, auth):
    # 1.300 "ñ" son 2.600 bytes: caben. 2.100 "ñ" son 4.200 bytes aunque sean pocos caracteres.
    assert post_result(client, auth, detalle=_detail_of_size(2600, "ñ")).status_code == 200
    assert post_result(client, auth, detalle=_detail_of_size(4200, "ñ")).status_code == 422


def test_un_detalle_rechazado_no_deja_fila(client, auth, db_session):
    post_result(client, auth, detalle=_detail_of_size(5000))
    count = db_session.exec(select(func.count()).select_from(ActivityResult)).one()
    assert count == 0


def test_detalle_con_nan_devuelve_422_y_no_500(client, auth):
    response = client.post(
        "/api/activities/m1_x/result",
        headers={**auth["headers"], "Content-Type": "application/json"},
        content='{"modulo":1,"tipo":"quiz","puntaje":1,"intentos":1,"completada":true,'
        '"detalle":{"x":NaN}}',
    )
    assert response.status_code == 422


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
def test_numeros_no_finitos_en_el_cuerpo_devuelven_422_y_no_500(client, auth, literal):
    response = client.post(
        "/api/activities/m1_x/result",
        headers={**auth["headers"], "Content-Type": "application/json"},
        content=f'{{"modulo":1,"tipo":"quiz","puntaje":{literal},"intentos":1,"completada":true}}',
    )
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
