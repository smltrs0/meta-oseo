"""GET /api/activities/results: resumen por actividad del usuario."""

import re

from tests.test_activities import post_result

ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def get_results(client, auth, **params):
    return client.get("/api/activities/results", headers=auth["headers"], params=params)


def test_sin_resultados_devuelve_lista_vacia(client, auth):
    response = get_results(client, auth)
    assert response.status_code == 200
    assert response.json() == {"resultados": []}


def test_requiere_autenticacion(client):
    response = client.get("/api/activities/results")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "token_invalido"
    assert client.get("/api/activities/results?modulo=1").status_code == 401


def test_forma_de_la_fila_del_contrato(client, auth):
    post_result(client, auth, puntaje=27, intentos=2)
    filas = get_results(client, auth).json()["resultados"]
    assert len(filas) == 1
    fila = filas[0]
    assert set(fila) == {
        "activity_id",
        "modulo",
        "tipo",
        "mejor_puntaje",
        "intentos",
        "completada",
        "ultimo_intento_en",
    }  # sin `detalle`
    assert fila["activity_id"] == "m1_capas_hueso"
    assert fila["modulo"] == 1
    assert fila["tipo"] == "multicapa"
    assert fila["mejor_puntaje"] == 27
    assert fila["intentos"] == 2
    assert fila["completada"] is True
    assert ISO_UTC.match(fila["ultimo_intento_en"])


def test_varios_intentos_dan_mejor_puntaje_e_intentos_maximos(client, auth):
    post_result(client, auth, puntaje=40, intentos=1)
    post_result(client, auth, puntaje=90, intentos=2)
    post_result(client, auth, puntaje=60, intentos=3)
    (fila,) = get_results(client, auth).json()["resultados"]
    assert fila["mejor_puntaje"] == 90  # no el último
    assert fila["intentos"] == 3
    assert fila["completada"] is True


def test_intentos_reportado_es_el_maximo_aunque_no_sea_el_ultimo(client, auth):
    post_result(client, auth, puntaje=10, intentos=5)
    post_result(client, auth, puntaje=20, intentos=2)
    (fila,) = get_results(client, auth).json()["resultados"]
    assert fila["intentos"] == 5


def test_actividad_solo_con_intentos_incompletos(client, auth):
    post_result(client, auth, puntaje=70, intentos=1, completada=False)
    post_result(client, auth, puntaje=80, intentos=2, completada=False)
    (fila,) = get_results(client, auth).json()["resultados"]
    assert fila["completada"] is False
    assert fila["mejor_puntaje"] == 0  # los intentos sin completar no puntúan
    assert fila["intentos"] == 2


def test_un_intento_incompleto_no_pisa_el_mejor_puntaje_completado(client, auth):
    post_result(client, auth, puntaje=50, intentos=1, completada=True)
    post_result(client, auth, puntaje=95, intentos=2, completada=False)
    (fila,) = get_results(client, auth).json()["resultados"]
    assert fila["completada"] is True
    assert fila["mejor_puntaje"] == 50
    assert fila["intentos"] == 2


def test_una_fila_por_actividad_ordenadas_por_modulo_e_id(client, auth):
    post_result(client, auth, "m2_b", modulo=2, tipo="quiz", puntaje=10)
    post_result(client, auth, "m1_z", modulo=1, tipo="quiz", puntaje=10)
    post_result(client, auth, "m1_a", modulo=1, tipo="multicapa", puntaje=10)
    post_result(client, auth, "m1_a", modulo=1, tipo="multicapa", puntaje=20, intentos=2)
    filas = get_results(client, auth).json()["resultados"]
    assert [fila["activity_id"] for fila in filas] == ["m1_a", "m1_z", "m2_b"]


def test_filtro_por_modulo(client, auth):
    post_result(client, auth, "m1_a", modulo=1, tipo="quiz", puntaje=10)
    post_result(client, auth, "m2_a", modulo=2, tipo="quiz", puntaje=20)
    post_result(client, auth, "m2_b", modulo=2, tipo="multicapa", puntaje=30)
    dos = get_results(client, auth, modulo=2).json()["resultados"]
    assert [fila["activity_id"] for fila in dos] == ["m2_a", "m2_b"]
    assert all(fila["modulo"] == 2 for fila in dos)
    assert get_results(client, auth, modulo=3).json() == {"resultados": []}
    assert len(get_results(client, auth).json()["resultados"]) == 3


def test_filtro_por_modulo_invalido_es_422(client, auth):
    for valor in ("0", "7", "abc", "-1"):
        assert get_results(client, auth, modulo=valor).status_code == 422


def test_aislamiento_entre_usuarios(client, auth, register):
    otra = register(numero_identificacion="9988776655", nombre="Luis")
    post_result(client, auth, puntaje=80)
    post_result(client, otra, "m3_solo_luis", modulo=3, tipo="quiz", puntaje=15)
    ana = get_results(client, auth).json()["resultados"]
    luis = get_results(client, otra).json()["resultados"]
    assert [fila["activity_id"] for fila in ana] == ["m1_capas_hueso"]
    assert [fila["activity_id"] for fila in luis] == ["m3_solo_luis"]
    assert luis[0]["mejor_puntaje"] == 15


def test_no_devuelve_el_detalle_aunque_se_haya_guardado(client, auth):
    post_result(client, auth, detalle={"secreto": "x" * 100})
    texto = get_results(client, auth).text
    assert "secreto" not in texto
    assert "detalle" not in texto


def test_coincide_con_el_puntaje_total_del_progreso(client, auth):
    post_result(client, auth, "m1_a", modulo=1, tipo="quiz", puntaje=30)
    post_result(client, auth, "m1_a", modulo=1, tipo="quiz", puntaje=50, intentos=2)
    post_result(client, auth, "m1_b", modulo=1, tipo="multicapa", puntaje=25)
    filas = get_results(client, auth).json()["resultados"]
    total = client.get("/api/progress", headers=auth["headers"]).json()["puntaje_total"]
    assert sum(fila["mejor_puntaje"] for fila in filas) == total == 75
