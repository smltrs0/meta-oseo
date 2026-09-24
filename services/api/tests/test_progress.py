"""Progreso por módulo (F1-06)."""

import re
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import func
from sqlmodel import select

from app.models.achievement import UserAchievement
from app.models.progress import ProgressModulo

ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

DEFAULT_MODULE = {
    "seccion_actual": None,
    "completado": False,
    "tiempo_total_seg": 0,
    "updated_at": None,
}


def put(client, auth, modulo, body):
    return client.put(f"/api/progress/{modulo}", headers=auth["headers"], json=body)


def test_progreso_por_defecto_tiene_exactamente_seis_modulos(client, auth):
    response = client.get("/api/progress", headers=auth["headers"])
    assert response.status_code == 200
    data = response.json()
    assert set(data) == {"modulos", "puntaje_total", "logros"}
    assert data["puntaje_total"] == 0
    assert data["logros"] == []
    assert [m["modulo"] for m in data["modulos"]] == [1, 2, 3, 4, 5, 6]
    for modulo in data["modulos"]:
        assert {k: v for k, v in modulo.items() if k != "modulo"} == DEFAULT_MODULE


def test_put_actualiza_seccion_y_suma_tiempo(client, auth):
    first = put(client, auth, 3, {"seccion_actual": "osteoblastos", "tiempo_delta_seg": 45})
    assert first.status_code == 200
    body = first.json()
    assert set(body) == {"modulo", "logros_nuevos"}
    assert body["logros_nuevos"] == []
    assert body["modulo"]["modulo"] == 3
    assert body["modulo"]["seccion_actual"] == "osteoblastos"
    assert body["modulo"]["tiempo_total_seg"] == 45
    assert body["modulo"]["completado"] is False
    assert ISO_UTC.match(body["modulo"]["updated_at"])

    second = put(client, auth, 3, {"tiempo_delta_seg": 30})
    assert second.json()["modulo"]["tiempo_total_seg"] == 75
    # sin `seccion_actual` en el cuerpo se conserva la anterior
    assert second.json()["modulo"]["seccion_actual"] == "osteoblastos"

    third = put(client, auth, 3, {"seccion_actual": "mecanotransduccion", "tiempo_delta_seg": 0})
    assert third.json()["modulo"]["tiempo_total_seg"] == 75
    assert third.json()["modulo"]["seccion_actual"] == "mecanotransduccion"

    progress = client.get("/api/progress", headers=auth["headers"]).json()
    module_3 = progress["modulos"][2]
    assert module_3["tiempo_total_seg"] == 75
    assert module_3["seccion_actual"] == "mecanotransduccion"
    assert progress["modulos"][0] == {"modulo": 1, **DEFAULT_MODULE}


def test_put_con_cuerpo_vacio_crea_la_fila_con_valores_por_defecto(client, auth):
    response = put(client, auth, 2, {})
    assert response.status_code == 200
    module = response.json()["modulo"]
    assert module["modulo"] == 2
    assert module["completado"] is False
    assert module["tiempo_total_seg"] == 0
    assert module["seccion_actual"] is None
    assert ISO_UTC.match(module["updated_at"])


def test_put_ignora_campos_desconocidos(client, auth):
    response = put(client, auth, 1, {"tiempo_total_seg": 9999, "modulo": 5, "completado": None})
    assert response.status_code == 200
    assert response.json()["modulo"]["modulo"] == 1
    assert response.json()["modulo"]["tiempo_total_seg"] == 0


@pytest.mark.parametrize("modulo", [1, 6])
def test_modulos_en_los_limites_son_validos(client, auth, modulo):
    assert put(client, auth, modulo, {}).status_code == 200


@pytest.mark.parametrize("modulo", [0, 7, -1, 100, "abc", "1.5"])
def test_modulo_fuera_de_rango_devuelve_422(client, auth, modulo):
    response = client.put(f"/api/progress/{modulo}", headers=auth["headers"], json={})
    assert response.status_code == 422


@pytest.mark.parametrize("delta", [-1, 3601, 10**9, "mucho", 1.5])
def test_tiempo_delta_fuera_de_rango_devuelve_422(client, auth, delta):
    assert put(client, auth, 1, {"tiempo_delta_seg": delta}).status_code == 422


@pytest.mark.parametrize("delta", [0, 3600])
def test_tiempo_delta_en_los_limites_es_valido(client, auth, delta):
    response = put(client, auth, 1, {"tiempo_delta_seg": delta})
    assert response.status_code == 200
    assert response.json()["modulo"]["tiempo_total_seg"] == delta


def test_seccion_actual_admite_64_caracteres_y_rechaza_65(client, auth):
    assert put(client, auth, 1, {"seccion_actual": "s" * 64}).status_code == 200
    assert put(client, auth, 1, {"seccion_actual": "s" * 65}).status_code == 422


def test_seccion_actual_con_nul_devuelve_422_y_no_500(client, auth):
    assert put(client, auth, 1, {"seccion_actual": "a\x00b"}).status_code == 422


def test_cuerpo_invalido_devuelve_422(client, auth):
    response = client.put("/api/progress/1", headers=auth["headers"], content="[1, 2]")
    assert response.status_code == 422


def test_el_completado_es_monotono(client, auth):
    assert put(client, auth, 1, {"completado": False}).json()["modulo"]["completado"] is False
    assert put(client, auth, 1, {"completado": True}).json()["modulo"]["completado"] is True
    assert put(client, auth, 1, {"completado": False}).json()["modulo"]["completado"] is True
    assert put(client, auth, 1, {}).json()["modulo"]["completado"] is True
    assert put(client, auth, 1, {"completado": None}).json()["modulo"]["completado"] is True
    module_1 = client.get("/api/progress", headers=auth["headers"]).json()["modulos"][0]
    assert module_1["completado"] is True


def test_completar_el_modulo_otorga_el_logro_una_sola_vez(client, auth):
    first = put(client, auth, 1, {"completado": True, "tiempo_delta_seg": 10})
    assert first.json()["logros_nuevos"] == ["primer_hueso"]
    again = put(client, auth, 1, {"completado": True})
    assert again.json()["logros_nuevos"] == []
    reverted = put(client, auth, 1, {"completado": False})
    assert reverted.json()["logros_nuevos"] == []

    progress = client.get("/api/progress", headers=auth["headers"]).json()
    assert progress["logros"] == ["primer_hueso"]


def test_cada_modulo_otorga_su_logro(client, auth):
    expected = {
        1: "primer_hueso",
        2: "celula_por_celula",
        3: "constructor",
        4: "mineralizador",
        5: "remodelador",
        6: "cronista",
    }
    for modulo, codigo in expected.items():
        assert put(client, auth, modulo, {"completado": True}).json()["logros_nuevos"] == [codigo]
    progress = client.get("/api/progress", headers=auth["headers"]).json()
    assert progress["logros"] == list(expected.values())
    assert all(m["completado"] for m in progress["modulos"])


def test_sin_completar_no_hay_logros(client, auth):
    body = put(client, auth, 2, {"tiempo_delta_seg": 100, "seccion_actual": "intro"}).json()
    assert body["logros_nuevos"] == []
    assert client.get("/api/progress", headers=auth["headers"]).json()["logros"] == []


def test_el_progreso_es_por_usuario(client, auth, register):
    other = register(tipo_identificacion="CE", numero_identificacion="A1B2C3D4")
    put(client, auth, 1, {"completado": True, "tiempo_delta_seg": 50})
    other_progress = client.get("/api/progress", headers=other["headers"]).json()
    assert other_progress["logros"] == []
    assert other_progress["modulos"][0] == {"modulo": 1, **DEFAULT_MODULE}
    # y el otro usuario puede completar el mismo módulo y recibir su propio logro
    assert put(client, other, 1, {"completado": True}).json()["logros_nuevos"] == ["primer_hueso"]


def test_la_fila_es_unica_por_usuario_y_modulo(client, auth, db_session):
    for _ in range(3):
        put(client, auth, 4, {"tiempo_delta_seg": 5})
    count = db_session.exec(
        select(func.count()).select_from(ProgressModulo).where(ProgressModulo.modulo == 4)
    ).one()
    assert count == 1


def test_peticiones_concurrentes_no_duplican_logros_ni_pierden_tiempo(client, auth, db_session):
    workers = 8

    def complete(_):
        return put(client, auth, 3, {"completado": True, "tiempo_delta_seg": 10})

    with ThreadPoolExecutor(max_workers=workers) as pool:
        responses = list(pool.map(complete, range(workers)))

    assert [r.status_code for r in responses] == [200] * workers
    new_achievements = [code for r in responses for code in r.json()["logros_nuevos"]]
    assert new_achievements == ["constructor"]  # exactamente una petición lo ve como nuevo

    granted = db_session.exec(
        select(func.count())
        .select_from(UserAchievement)
        .where(UserAchievement.codigo == "constructor")
    ).one()
    assert granted == 1
    module = client.get("/api/progress", headers=auth["headers"]).json()["modulos"][2]
    assert module["tiempo_total_seg"] == 10 * workers
    rows = db_session.exec(
        select(func.count()).select_from(ProgressModulo).where(ProgressModulo.modulo == 3)
    ).one()
    assert rows == 1


def test_registros_concurrentes_del_mismo_documento_dejan_un_solo_usuario(client):
    body = {
        "nombre": "Ana",
        "apellido": "Pérez",
        "tipo_identificacion": "CC",
        "numero_identificacion": "5550001",
    }

    def register(_):
        return client.post("/api/auth/register", json=body)

    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = sorted(r.status_code for r in pool.map(register, range(8)))
    assert codes == [201] + [409] * 7


@pytest.mark.parametrize("literal", ["NaN", "Infinity"])
def test_tiempo_no_finito_devuelve_422_y_no_500(client, auth, literal):
    response = client.put(
        "/api/progress/1",
        headers={**auth["headers"], "Content-Type": "application/json"},
        content=f'{{"tiempo_delta_seg":{literal}}}',
    )
    assert response.status_code == 422
