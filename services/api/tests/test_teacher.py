"""API del panel docente (F6-03): permisos, resumen, estudiantes, actividades y mentor.

Los datos de `seed_cohort` están calculados a mano; ver su docstring. El reloj del router se fija
en `NOW` para que las ventanas de 7 y 30 días y los días del mentor sean deterministas.
"""

import pytest

from app.models.enums import Rol
from app.models.user import User
from tests.test_teacher_support import NOW, add_user, seed_cohort

ENDPOINTS = [
    "/api/teacher/overview",
    "/api/teacher/students",
    "/api/teacher/students/1",
    "/api/teacher/activities/stats",
    "/api/teacher/mentor/usage",
    "/api/teacher/export/progress.csv",
]


@pytest.fixture(autouse=True)
def fixed_now(monkeypatch):
    monkeypatch.setattr("app.routers.teacher.utcnow", lambda: NOW)


@pytest.fixture
def docente(register, db_session):
    """Usuario registrado por la API y promovido a docente (como haría `promote_docente`)."""
    session = register(nombre="Doris", apellido="Docente", numero_identificacion="9000000009")
    user = db_session.get(User, session["user"]["id"])
    user.rol = Rol.docente.value
    db_session.add(user)
    db_session.commit()
    session["id"] = user.id
    return session


@pytest.fixture
def cohort(db_session, docente):
    return seed_cohort(db_session, docente_id=docente["id"])


def get(client, docente, path, **params):
    return client.get(f"/api/teacher{path}", headers=docente["headers"], params=params)


# --- Permisos --------------------------------------------------------------------------------


@pytest.mark.parametrize("path", ENDPOINTS)
def test_sin_token_responde_401(client, path):
    response = client.get(path)
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "token_invalido"


@pytest.mark.parametrize("path", ENDPOINTS)
def test_token_invalido_responde_401(client, path):
    response = client.get(path, headers={"Authorization": "Bearer no-es-un-jwt"})
    assert response.status_code == 401


@pytest.mark.parametrize("path", ENDPOINTS)
def test_estudiante_recibe_403_no_autorizado(client, auth, path):
    response = client.get(path, headers=auth["headers"])
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "no_autorizado"


def test_docente_accede_a_todas_las_rutas(client, docente, cohort):
    for path in ENDPOINTS:
        response = client.get(
            path.replace("students/1", f"students/{cohort['ana']}"), headers=docente["headers"]
        )
        assert response.status_code == 200, path


def test_promover_a_docente_por_script_da_acceso(client, register, db_session):
    """Un estudiante recién registrado no entra; tras promoverlo, sí (mismo token)."""
    session = register(numero_identificacion="8000000008")
    assert client.get("/api/teacher/overview", headers=session["headers"]).status_code == 403
    user = db_session.get(User, session["user"]["id"])
    user.rol = Rol.docente.value
    db_session.add(user)
    db_session.commit()
    assert client.get("/api/teacher/overview", headers=session["headers"]).status_code == 200


# --- Resumen ---------------------------------------------------------------------------------


def test_overview_con_datos_calculados_a_mano(client, docente, cohort):
    data = get(client, docente, "/overview").json()
    assert data["generado_en"] == "2026-09-24T15:00:00Z"
    # El docente no cuenta: 5 estudiantes.
    assert data["estudiantes"] == 5
    # Activos: Ana (hoy) y Elena (mentor hace 2 días) en 7 días; más Beto (20 d) y Diego (mentor
    # hace 10 d) en 30. Carla (hace 100 d) no.
    assert data["activos_7d"] == 2
    assert data["activos_30d"] == 4
    # Módulos completados: Ana 2, Beto 1, Carla 0, Diego 6, Elena 0.
    assert data["modulos_completados"] == [
        {"modulos_completados": 0, "estudiantes": 2},
        {"modulos_completados": 1, "estudiantes": 1},
        {"modulos_completados": 2, "estudiantes": 1},
        {"modulos_completados": 3, "estudiantes": 0},
        {"modulos_completados": 4, "estudiantes": 0},
        {"modulos_completados": 5, "estudiantes": 0},
        {"modulos_completados": 6, "estudiantes": 1},
    ]
    # Tiempo por módulo (solo estudiantes con fila): m1 = (600+400+100)/3, m2 = (300+50+100)/3, ...
    tiempos = {item["modulo"]: item for item in data["tiempo_por_modulo"]}
    assert tiempos[1]["estudiantes"] == 3
    assert tiempos[1]["tiempo_promedio_seg"] == pytest.approx(1100 / 3)
    assert tiempos[2]["tiempo_promedio_seg"] == pytest.approx(150.0)
    assert (tiempos[3]["tiempo_promedio_seg"], tiempos[3]["estudiantes"]) == (100.0, 2)
    for modulo in (4, 5, 6):
        assert (tiempos[modulo]["tiempo_promedio_seg"], tiempos[modulo]["estudiantes"]) == (
            100.0,
            1,
        )
    # Puntajes 260, 60, 0, 300, 0: promedio 124, mediana 60.
    assert data["puntaje"] == {"promedio": 124.0, "mediana": 60.0}


def test_mediana_con_cantidad_par_promedia_los_dos_centrales(client, docente, cohort, db_session):
    add_user(db_session, "Fabio", "Sanz", "6000000006")  # puntaje 0
    db_session.commit()
    data = get(client, docente, "/overview").json()
    # 6 estudiantes: 0, 0, 0, 60, 260, 300 -> mediana (0 + 60) / 2.
    assert data["estudiantes"] == 6
    assert data["puntaje"]["mediana"] == 30.0
    assert data["puntaje"]["promedio"] == pytest.approx(620 / 6)


def test_overview_sin_estudiantes(client, docente):
    data = get(client, docente, "/overview").json()
    assert data["estudiantes"] == 0
    assert (data["activos_7d"], data["activos_30d"]) == (0, 0)
    assert len(data["modulos_completados"]) == 7
    assert all(item["estudiantes"] == 0 for item in data["modulos_completados"])
    assert [item["modulo"] for item in data["tiempo_por_modulo"]] == [1, 2, 3, 4, 5, 6]
    assert all(item["tiempo_promedio_seg"] is None for item in data["tiempo_por_modulo"])
    assert data["puntaje"] == {"promedio": None, "mediana": None}


# --- Lista de estudiantes --------------------------------------------------------------------


def names(response):
    return [item["nombre"] for item in response.json()["estudiantes"]]


def test_lista_por_defecto_ordena_por_nombre_y_enmascara(client, docente, cohort):
    response = get(client, docente, "/students")
    assert response.status_code == 200
    data = response.json()
    assert (data["page"], data["page_size"], data["total"], data["total_pages"]) == (1, 25, 5, 1)
    assert names(response) == ["Ana", "Beto", "Carla", "Diego", "Elena"]
    ana = data["estudiantes"][0]
    assert ana == {
        "id": cohort["ana"],
        "nombre": "Ana",
        "apellido": "Pérez",
        "tipo_identificacion": "CC",
        "numero_identificacion": "*******789",
        "identificacion_completa": False,
        "nivel": "pregrado",
        "modulos_completados": 2,
        "puntaje_total": 260,
        "ultima_actividad": "2026-09-24T14:00:00Z",
        "tiempo_total_seg": 1000,
    }
    # Nadie muestra la identificación completa por defecto.
    for item in data["estudiantes"]:
        assert item["numero_identificacion"].startswith("*")
        assert item["numero_identificacion"].endswith(item["numero_identificacion"][-3:])
        assert not item["identificacion_completa"]
    carla = data["estudiantes"][2]
    assert (carla["modulos_completados"], carla["puntaje_total"], carla["tiempo_total_seg"]) == (
        0,
        0,
        0,
    )
    assert carla["ultima_actividad"] == "2026-06-16T15:00:00Z"  # 100 días antes de NOW
    assert carla["nivel"] == "posgrado"
    diego = data["estudiantes"][3]
    assert (diego["modulos_completados"], diego["puntaje_total"], diego["tiempo_total_seg"]) == (
        6,
        300,
        600,
    )


def test_el_docente_no_aparece_en_la_lista(client, docente, cohort):
    assert "Doris" not in names(get(client, docente, "/students", page_size=100))


def test_orden_por_puntaje_desc_con_desempate_por_nombre(client, docente, cohort):
    response = get(client, docente, "/students", orden="puntaje")
    assert names(response) == ["Diego", "Ana", "Beto", "Carla", "Elena"]
    assert [i["puntaje_total"] for i in response.json()["estudiantes"]] == [300, 260, 60, 0, 0]


def test_orden_por_ultima_actividad_y_sin_actividad_al_final(client, docente, cohort, db_session):
    add_user(db_session, "Fabio", "Sanz", "6000000006")  # sin ninguna actividad
    db_session.commit()
    response = get(client, docente, "/students", orden="ultima_actividad")
    assert names(response) == ["Ana", "Elena", "Diego", "Beto", "Carla", "Fabio"]
    assert response.json()["estudiantes"][-1]["ultima_actividad"] is None


def test_orden_invalido_responde_422(client, docente):
    assert get(client, docente, "/students", orden="edad").status_code == 422


def test_paginacion(client, docente, cohort):
    page1 = get(client, docente, "/students", page=1, page_size=2).json()
    assert (page1["total"], page1["total_pages"], page1["page_size"]) == (5, 3, 2)
    page3 = get(client, docente, "/students", page=3, page_size=2)
    assert names(page3) == ["Elena"]
    assert names(get(client, docente, "/students", page=2, page_size=2)) == ["Carla", "Diego"]
    # Más allá de la última página: lista vacía, total intacto.
    beyond = get(client, docente, "/students", page=4, page_size=2).json()
    assert beyond["estudiantes"] == [] and beyond["total"] == 5


@pytest.mark.parametrize(
    "params",
    [{"page": 0}, {"page": -1}, {"page_size": 0}, {"page_size": 101}, {"page": "a"}],
)
def test_paginacion_invalida_responde_422(client, docente, params):
    assert get(client, docente, "/students", **params).status_code == 422


def test_page_size_maximo_100_es_valido(client, docente):
    assert get(client, docente, "/students", page_size=100).status_code == 200


def test_filtro_por_nombre_y_apellido(client, docente, cohort):
    assert names(get(client, docente, "/students", q="ana")) == ["Ana"]
    assert names(get(client, docente, "/students", q="PÉREZ")) == ["Ana"]
    assert names(get(client, docente, "/students", q="ele")) == ["Elena"]
    assert names(get(client, docente, "/students", q="ana pérez")) == ["Ana"]
    assert names(get(client, docente, "/students", q="  ana   pérez ")) == ["Ana"]
    assert names(get(client, docente, "/students", q="ana gómez")) == []  # todas las palabras
    assert names(get(client, docente, "/students", q="o")) == ["Beto", "Diego"]  # Gómez, Mora
    assert get(client, docente, "/students", q="ana").json()["total"] == 1


def test_el_filtro_ajusta_total_y_paginas(client, docente, cohort):
    data = get(client, docente, "/students", q="a", page_size=2).json()
    # Ana, Carla, Elena (nombre) y Pérez... contienen "a" en nombre o apellido; Beto Gómez no;
    # Diego Mora sí (Mora).
    assert data["total"] == 4
    assert data["total_pages"] == 2


def test_comodines_de_like_se_tratan_como_texto(client, docente, cohort):
    assert get(client, docente, "/students", q="%").json()["total"] == 0
    assert get(client, docente, "/students", q="_").json()["total"] == 0
    assert get(client, docente, "/students", q="\\").json()["total"] == 0


def test_busqueda_exacta_por_numero_revela_la_identificacion(client, docente, cohort):
    for text in ("1023456789", "1.023.456-789", " 1023456789 "):
        data = get(client, docente, "/students", q=text).json()
        assert data["total"] == 1, text
        item = data["estudiantes"][0]
        assert item["nombre"] == "Ana"
        assert item["numero_identificacion"] == "1023456789"
        assert item["identificacion_completa"] is True


def test_busqueda_por_fragmento_de_numero_no_devuelve_nada(client, docente, cohort):
    """Solo igualdad exacta: un fragmento no sirve para reconstruir números por tanteo."""
    for fragment in ("789", "102345678", "0234567", "23456789"):
        assert get(client, docente, "/students", q=fragment).json()["total"] == 0, fragment


def test_texto_largo_o_vacio(client, docente, cohort):
    assert get(client, docente, "/students", q="x" * 101).status_code == 422
    assert get(client, docente, "/students", q="   ").json()["total"] == 5
    assert get(client, docente, "/students", q="").json()["total"] == 5


def test_lista_vacia_sin_estudiantes(client, docente):
    data = get(client, docente, "/students").json()
    assert data == {"estudiantes": [], "page": 1, "page_size": 25, "total": 0, "total_pages": 0}


def test_lista_no_hace_consultas_por_estudiante(client, docente, engine, db_session):
    """Sin N+1: la cantidad de sentencias no crece con el número de estudiantes de la página."""
    from tests.test_teacher_support import query_counter

    add_user(db_session, "Uno", "Uno", "1000000001")
    db_session.commit()
    statements = query_counter(engine)

    def count_for_request() -> int:
        statements.clear()
        assert get(client, docente, "/students", page_size=100, orden="puntaje").status_code == 200
        return len(statements)

    few = count_for_request()
    seed_cohort(db_session)
    for index in range(60):
        add_user(db_session, f"Est{index}", "Prueba", f"7{index:09d}")
    db_session.commit()
    many = count_for_request()
    assert get(client, docente, "/students", page_size=100).json()["total"] == 66
    assert few == many
    # Autenticación (usuario) + total + página: un puñado, no una por estudiante.
    assert many <= 5, statements


# --- Detalle ---------------------------------------------------------------------------------


def test_detalle_de_ana(client, docente, cohort):
    response = get(client, docente, f"/students/{cohort['ana']}")
    assert response.status_code == 200
    data = response.json()
    assert data["nombre"] == "Ana" and data["apellido"] == "Pérez"
    assert data["numero_identificacion"] == "*******789"
    assert data["identificacion_completa"] is False
    assert (data["modulos_completados"], data["puntaje_total"], data["tiempo_total_seg"]) == (
        2,
        260,
        1000,
    )
    assert data["ultima_actividad"] == "2026-09-24T14:00:00Z"
    assert data["created_at"] == "2026-03-08T15:00:00Z"
    assert [m["modulo"] for m in data["progreso"]] == [1, 2, 3, 4, 5, 6]
    assert data["progreso"][0] == {
        "modulo": 1,
        "seccion_actual": "fin",
        "completado": True,
        "tiempo_total_seg": 600,
        "updated_at": "2026-09-21T15:00:00Z",
    }
    assert data["progreso"][2]["completado"] is False
    assert data["progreso"][2]["seccion_actual"] == "mecanotransduccion"
    assert data["progreso"][5] == {
        "modulo": 6,
        "seccion_actual": None,
        "completado": False,
        "tiempo_total_seg": 0,
        "updated_at": None,
    }
    actividades = {a["activity_id"]: a for a in data["actividades"]}
    assert list(actividades) == ["m1_a", "m1_b", "m2_a"]
    m1_a = actividades["m1_a"]
    assert (m1_a["mejor_puntaje"], m1_a["puntaje_contabilizado"]) == (90, 90)
    assert (m1_a["intentos"], m1_a["registros"], m1_a["completada"]) == (3, 3, True)
    assert m1_a["modulo"] == 1 and m1_a["tipo"] == "quiz"
    assert m1_a["ultimo_intento"] == "2026-09-21T15:00:00Z"
    assert actividades["m2_a"]["mejor_puntaje"] == 100
    assert data["mentor"] == {
        "consultas": 2,
        "tokens_entrada": 3000,
        "tokens_salida": 1500,
        "tokens_cache_lectura": 0,
        "tokens_cache_escritura": 0,
        "costo_estimado_usd": 0.0525,
        "ultima_consulta": "2026-09-24T14:00:00Z",
    }


def test_detalle_de_intentos_sin_completar(client, docente, cohort):
    data = get(client, docente, f"/students/{cohort['beto']}").json()
    assert data["puntaje_total"] == 60
    actividades = {a["activity_id"]: a for a in data["actividades"]}
    # m1_a nunca se completó: hay mejor puntaje, pero no suma al total.
    assert actividades["m1_a"] == {
        "activity_id": "m1_a",
        "modulo": 1,
        "tipo": "quiz",
        "mejor_puntaje": 40,
        "puntaje_contabilizado": 0,
        "intentos": 2,
        "registros": 2,
        "completada": False,
        "ultimo_intento": "2026-09-04T15:00:00Z",
    }
    assert actividades["m1_b"]["completada"] is True
    assert data["mentor"]["consultas"] == 0
    assert data["mentor"]["ultima_consulta"] is None


def test_detalle_de_estudiante_sin_datos(client, docente, cohort):
    data = get(client, docente, f"/students/{cohort['carla']}").json()
    assert data["actividades"] == []
    assert len(data["progreso"]) == 6
    assert data["puntaje_total"] == 0 and data["modulos_completados"] == 0
    assert data["ultima_actividad"] == "2026-06-16T15:00:00Z"


def test_detalle_cuesta_una_cantidad_fija_de_consultas(client, docente, cohort, engine):
    from tests.test_teacher_support import query_counter

    statements = query_counter(engine)
    assert get(client, docente, f"/students/{cohort['ana']}").status_code == 200
    assert len(statements) <= 6, statements


def test_detalle_de_id_inexistente_o_de_docente_responde_404(client, docente, cohort):
    for student_id in (99999, docente["id"]):
        response = get(client, docente, f"/students/{student_id}")
        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "estudiante_no_encontrado"
    assert get(client, docente, "/students/0").status_code == 422
    assert get(client, docente, "/students/abc").status_code == 422


# --- Actividades -----------------------------------------------------------------------------


def test_estadisticas_por_actividad(client, docente, cohort):
    data = get(client, docente, "/activities/stats").json()
    # El docente también resolvió m1_a (999): no cuenta.
    assert data["actividades"] == [
        {
            "activity_id": "m1_a",
            "modulo": 1,
            "tipo": "quiz",
            "estudiantes_intentaron": 2,
            "estudiantes_completaron": 1,
            "tasa_finalizacion": 0.5,
            "intentos_promedio": 2.5,  # Ana 3, Beto 2
            "puntaje_promedio": 90.0,  # solo Ana la completó
        },
        {
            "activity_id": "m1_b",
            "modulo": 1,
            "tipo": "quiz",
            "estudiantes_intentaron": 2,
            "estudiantes_completaron": 2,
            "tasa_finalizacion": 1.0,
            "intentos_promedio": 1.5,  # Ana 1, Beto 2
            "puntaje_promedio": 65.0,  # (70 + 60) / 2
        },
        {
            "activity_id": "m2_a",
            "modulo": 2,
            "tipo": "quiz",
            "estudiantes_intentaron": 1,
            "estudiantes_completaron": 1,
            "tasa_finalizacion": 1.0,
            "intentos_promedio": 1.0,
            "puntaje_promedio": 100.0,
        },
        {
            "activity_id": "m6_a",
            "modulo": 6,
            "tipo": "quiz",
            "estudiantes_intentaron": 1,
            "estudiantes_completaron": 1,
            "tasa_finalizacion": 1.0,
            "intentos_promedio": 1.0,
            "puntaje_promedio": 300.0,
        },
    ]


def test_estadisticas_por_modulo(client, docente, cohort):
    por_modulo = {
        m["modulo"]: m for m in get(client, docente, "/activities/stats").json()["por_modulo"]
    }
    assert sorted(por_modulo) == [1, 2, 3, 4, 5, 6]
    # Módulo 1: 4 pares (Ana y Beto x m1_a y m1_b); 3 completados; intentos (3+1+2+2)/4;
    # puntaje (90+70+60)/3.
    assert por_modulo[1] == {
        "modulo": 1,
        "actividades": 2,
        "estudiantes_intentaron": 2,
        "tasa_finalizacion": 0.75,
        "intentos_promedio": 2.0,
        "puntaje_promedio": pytest.approx(73.3333, abs=1e-4),
    }
    assert por_modulo[2]["puntaje_promedio"] == 100.0
    assert por_modulo[6]["puntaje_promedio"] == 300.0
    for modulo in (3, 4, 5):
        assert por_modulo[modulo] == {
            "modulo": modulo,
            "actividades": 0,
            "estudiantes_intentaron": 0,
            "tasa_finalizacion": None,
            "intentos_promedio": None,
            "puntaje_promedio": None,
        }


def test_actividades_mas_dificiles(client, docente, cohort):
    data = get(client, docente, "/activities/stats").json()
    # Menor tasa primero; a igual tasa, más intentos; a igual, por id.
    assert [a["activity_id"] for a in data["mas_dificiles"]] == ["m1_a", "m1_b", "m2_a", "m6_a"]
    top2 = get(client, docente, "/activities/stats", limite=2).json()["mas_dificiles"]
    assert [a["activity_id"] for a in top2] == ["m1_a", "m1_b"]
    assert get(client, docente, "/activities/stats", limite=0).status_code == 422
    assert get(client, docente, "/activities/stats", limite=51).status_code == 422


def test_actividades_sin_datos(client, docente):
    data = get(client, docente, "/activities/stats").json()
    assert data["actividades"] == [] and data["mas_dificiles"] == []
    assert len(data["por_modulo"]) == 6


# --- Uso del mentor --------------------------------------------------------------------------


def test_uso_del_mentor_30_dias(client, docente, cohort):
    response = get(client, docente, "/mentor/usage")
    assert response.status_code == 200
    data = response.json()
    assert data["dias"] == 30
    assert data["desde"] == "2026-08-26T00:00:00Z"
    assert data["hasta"] == "2026-09-24T15:00:00Z"
    assert data["precios"]["entrada_usd_por_mtok"] == 5.0
    assert data["precios"]["salida_usd_por_mtok"] == 25.0
    # Eventos en la ventana: Ana x2, Elena, Diego (Carla queda fuera: hace 100 días; el docente
    # sí consumió, y su evento cuenta porque el mentor lo usa cualquiera).
    # Sin el docente: 4 consultas, 3 usuarios, entrada 7500, salida 3600, caché 10000/1000.
    # Costo: 7500*5 + 3600*25 + 10000*0.5 + 1000*6.25 = 138750 / 1e6.
    totales = data["totales"]
    docente_in = 999999
    assert totales["consultas"] == 5
    assert totales["usuarios"] == 4
    assert totales["tokens_entrada"] == 7500 + docente_in
    assert totales["tokens_salida"] == 3600 + docente_in
    assert totales["tokens_cache_lectura"] == 10000
    assert totales["tokens_cache_escritura"] == 1000
    expected = (7500 + docente_in) * 5 + (3600 + docente_in) * 25 + 5000 + 6250
    assert totales["costo_estimado_usd"] == pytest.approx(expected / 1e6, abs=1e-6)


def test_uso_del_mentor_por_dia_modelo_y_usuario(client, docente, cohort, db_session):
    # Quitar el evento del docente para trabajar con números redondos.
    from sqlalchemy import delete

    from app.models.usage import UsageEvent

    db_session.execute(delete(UsageEvent).where(UsageEvent.user_id == docente["id"]))
    db_session.commit()

    data = get(client, docente, "/mentor/usage").json()
    assert data["totales"] == {
        "consultas": 4,
        "usuarios": 3,
        "tokens_entrada": 7500,
        "tokens_salida": 3600,
        "tokens_cache_lectura": 10000,
        "tokens_cache_escritura": 1000,
        "costo_estimado_usd": 0.13875,
    }
    por_dia = data["por_dia"]
    assert len(por_dia) == 30
    assert por_dia[0]["fecha"] == "2026-08-26" and por_dia[-1]["fecha"] == "2026-09-24"
    activos = {d["fecha"]: d for d in por_dia if d["consultas"]}
    assert activos == {
        "2026-09-14": {
            "fecha": "2026-09-14",
            "consultas": 1,
            "tokens_entrada": 500,
            "tokens_salida": 100,
            "costo_estimado_usd": 0.005,
        },
        "2026-09-22": {
            "fecha": "2026-09-22",
            "consultas": 2,
            "tokens_entrada": 6000,
            "tokens_salida": 3000,
            "costo_estimado_usd": 0.11625,
        },
        "2026-09-24": {
            "fecha": "2026-09-24",
            "consultas": 1,
            "tokens_entrada": 1000,
            "tokens_salida": 500,
            "costo_estimado_usd": 0.0175,
        },
    }
    assert data["por_dia_modelo"] == [
        {
            "fecha": "2026-09-14",
            "modelo": "claude-opus-5",
            "consultas": 1,
            "tokens_entrada": 500,
            "tokens_salida": 100,
            "costo_estimado_usd": 0.005,
        },
        {
            "fecha": "2026-09-22",
            "modelo": "claude-opus-5",
            "consultas": 1,
            "tokens_entrada": 2000,
            "tokens_salida": 1000,
            "costo_estimado_usd": 0.035,
        },
        {
            "fecha": "2026-09-22",
            "modelo": "claude-sonnet-5",
            "consultas": 1,
            "tokens_entrada": 4000,
            "tokens_salida": 2000,
            "costo_estimado_usd": 0.08125,
        },
        {
            "fecha": "2026-09-24",
            "modelo": "claude-opus-5",
            "consultas": 1,
            "tokens_entrada": 1000,
            "tokens_salida": 500,
            "costo_estimado_usd": 0.0175,
        },
    ]
    assert data["por_modelo"] == [
        {
            "modelo": "claude-opus-5",
            "consultas": 3,
            "tokens_entrada": 3500,
            "tokens_salida": 1600,
            "tokens_cache_lectura": 0,
            "tokens_cache_escritura": 0,
            "costo_estimado_usd": 0.0575,
        },
        {
            "modelo": "claude-sonnet-5",
            "consultas": 1,
            "tokens_entrada": 4000,
            "tokens_salida": 2000,
            "tokens_cache_lectura": 10000,
            "tokens_cache_escritura": 1000,
            "costo_estimado_usd": 0.08125,
        },
    ]
    # Top por consumo (costo): Elena 0.08125, Ana 0.0525, Diego 0.005.
    assert [
        (u["nombre"], u["consultas"], u["costo_estimado_usd"]) for u in data["top_usuarios"]
    ] == [
        ("Elena", 1, 0.08125),
        ("Ana", 2, 0.0525),
        ("Diego", 1, 0.005),
    ]
    ana = data["top_usuarios"][1]
    assert (ana["tokens_entrada"], ana["tokens_salida"], ana["user_id"]) == (
        3000,
        1500,
        cohort["ana"],
    )
    assert (
        get(client, docente, "/mentor/usage", limite=1).json()["top_usuarios"][0]["nombre"]
        == "Elena"
    )


def test_ventana_de_un_dia_y_de_365(client, docente, cohort):
    hoy = get(client, docente, "/mentor/usage", dias=1).json()
    assert hoy["desde"] == "2026-09-24T00:00:00Z"
    assert [d["fecha"] for d in hoy["por_dia"]] == ["2026-09-24"]
    assert hoy["totales"]["consultas"] == 1
    assert hoy["totales"]["usuarios"] == 1
    anual = get(client, docente, "/mentor/usage", dias=365).json()
    assert len(anual["por_dia"]) == 365
    assert anual["totales"]["consultas"] == 6  # incluye a Carla (hace 100 días) y al docente


def test_el_dia_de_una_consulta_se_calcula_en_utc(client, docente, db_session):
    """Un evento a las 23:59 UTC pertenece a ese día; a las 00:00 UTC, al siguiente."""
    from datetime import UTC, datetime

    from tests.test_teacher_support import OPUS, add_usage

    user_id = add_user(db_session, "Nocturno", "Utc", "1111111111")
    add_usage(db_session, user_id, datetime(2026, 9, 23, 23, 59, 59, tzinfo=UTC), OPUS, 10, 1)
    add_usage(db_session, user_id, datetime(2026, 9, 24, 0, 0, 0, tzinfo=UTC), OPUS, 20, 2)
    db_session.commit()
    por_dia = {
        d["fecha"]: d for d in get(client, docente, "/mentor/usage", dias=3).json()["por_dia"]
    }
    assert por_dia["2026-09-23"]["tokens_entrada"] == 10
    assert por_dia["2026-09-24"]["tokens_entrada"] == 20
    assert por_dia["2026-09-22"]["consultas"] == 0


def test_precios_configurables_por_settings(make_app, register, db_session, client):
    from fastapi.testclient import TestClient

    from tests.test_teacher_support import OPUS, add_usage

    doc = register(numero_identificacion="9000000009")
    cohort_user = add_user(db_session, "Uso", "Mentor", "2222222222")
    add_usage(db_session, cohort_user, NOW, OPUS, 1_000_000, 1_000_000)
    user = db_session.get(User, doc["user"]["id"])
    user.rol = Rol.docente.value
    db_session.add(user)
    db_session.commit()

    def total_cost(**overrides):
        with TestClient(make_app(**overrides)) as other:
            data = other.get("/api/teacher/mentor/usage", headers=doc["headers"]).json()
        return data["totales"]["costo_estimado_usd"], data["precios"]

    # Por defecto (claude-opus-5): 5 USD entrada + 25 USD salida por millón de tokens.
    assert total_cost()[0] == 30.0
    cost, precios = total_cost(precio_entrada_usd_por_mtok=2.0, precio_salida_usd_por_mtok=10.0)
    assert cost == 12.0
    assert (precios["entrada_usd_por_mtok"], precios["salida_usd_por_mtok"]) == (2.0, 10.0)
    assert total_cost(precio_entrada_usd_por_mtok=0.0, precio_salida_usd_por_mtok=0.0)[0] == 0.0


def test_precios_por_defecto_y_variables_de_entorno(monkeypatch):
    from app.core.settings import Settings

    defaults = Settings(_env_file=None)
    assert (defaults.precio_entrada_usd_por_mtok, defaults.precio_salida_usd_por_mtok) == (
        5.0,
        25.0,
    )
    monkeypatch.setenv("PRECIO_ENTRADA_USD_POR_MTOK", "3.5")
    monkeypatch.setenv("PRECIO_SALIDA_USD_POR_MTOK", "17")
    configured = Settings(_env_file=None)
    assert (configured.precio_entrada_usd_por_mtok, configured.precio_salida_usd_por_mtok) == (
        3.5,
        17.0,
    )
    with pytest.raises(ValueError):
        Settings(_env_file=None, precio_entrada_usd_por_mtok=-1)


@pytest.mark.parametrize("params", [{"dias": 0}, {"dias": 366}, {"limite": 0}, {"limite": 51}])
def test_parametros_invalidos_del_mentor(client, docente, params):
    assert get(client, docente, "/mentor/usage", **params).status_code == 422


def test_uso_del_mentor_sin_consultas(client, docente):
    data = get(client, docente, "/mentor/usage", dias=7).json()
    assert data["totales"]["consultas"] == 0 and data["totales"]["costo_estimado_usd"] == 0.0
    assert len(data["por_dia"]) == 7 and all(d["consultas"] == 0 for d in data["por_dia"])
    assert data["por_modelo"] == [] and data["top_usuarios"] == [] and data["por_dia_modelo"] == []


# --- Enmascarado -----------------------------------------------------------------------------


def test_mascara_de_identificacion():
    from app.services.teacher import mask_identification

    assert mask_identification("1023456789") == "*******789"
    assert mask_identification("ABCD") == "*BCD"
    assert mask_identification("ab1") == "***"
    assert mask_identification("A" * 20) == "*" * 17 + "AAA"
