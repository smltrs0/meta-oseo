"""Catálogo de logros y su siembra idempotente (F1-06)."""

import re

from sqlalchemy import func
from sqlmodel import select

from app.models.achievement import Achievement, UserAchievement
from app.services.achievements import (
    ACHIEVEMENT_CATALOG,
    grant_module_achievements,
    seed_achievements,
)

ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

EXPECTED_CODES = [
    "primer_hueso",
    "celula_por_celula",
    "constructor",
    "mineralizador",
    "remodelador",
    "cronista",
]


def test_catalogo_de_fase_1(client, auth):
    response = client.get("/api/achievements", headers=auth["headers"])
    assert response.status_code == 200
    logros = response.json()["logros"]
    assert [logro["codigo"] for logro in logros] == EXPECTED_CODES
    assert logros[0] == {
        "codigo": "primer_hueso",
        "nombre": "Primer hueso",
        "descripcion": "Completaste el módulo 1",
        "obtenido": False,
        "obtenido_en": None,
    }
    for numero, logro in enumerate(logros, start=1):
        assert logro["descripcion"] == f"Completaste el módulo {numero}"
        assert set(logro) == {"codigo", "nombre", "descripcion", "obtenido", "obtenido_en"}
        assert logro["obtenido"] is False


def test_logro_obtenido_al_completar_el_modulo(client, auth):
    client.put("/api/progress/2", headers=auth["headers"], json={"completado": True})
    logros = client.get("/api/achievements", headers=auth["headers"]).json()["logros"]
    by_code = {logro["codigo"]: logro for logro in logros}
    assert by_code["celula_por_celula"]["obtenido"] is True
    assert ISO_UTC.match(by_code["celula_por_celula"]["obtenido_en"])
    assert by_code["primer_hueso"]["obtenido"] is False
    assert by_code["primer_hueso"]["obtenido_en"] is None


def test_los_logros_son_por_usuario(client, auth, register):
    other = register(tipo_identificacion="CE", numero_identificacion="CE998877")
    client.put("/api/progress/1", headers=auth["headers"], json={"completado": True})
    logros = client.get("/api/achievements", headers=other["headers"]).json()["logros"]
    assert not any(logro["obtenido"] for logro in logros)


def test_el_catalogo_se_siembra_al_arrancar(client, db_session):
    codes = db_session.exec(select(Achievement.codigo).order_by(Achievement.modulo)).all()
    assert list(codes) == EXPECTED_CODES


def test_la_siembra_es_idempotente(client, db_session):
    for _ in range(3):
        seed_achievements(db_session)
    count = db_session.exec(select(func.count()).select_from(Achievement)).one()
    assert count == len(ACHIEVEMENT_CATALOG) == 6


def test_la_siembra_repone_los_textos_del_catalogo(client, db_session):
    row = db_session.get(Achievement, "constructor")
    row.nombre = "Editado a mano"
    row.modulo = None
    db_session.add(row)
    db_session.commit()
    seed_achievements(db_session)
    db_session.expire_all()
    restored = db_session.get(Achievement, "constructor")
    assert restored.nombre == "Constructor"
    assert restored.modulo == 3


def test_reiniciar_la_app_no_duplica_ni_borra_logros_obtenidos(make_app, register, client):
    from fastapi.testclient import TestClient

    user = register()
    client.put("/api/progress/1", headers=user["headers"], json={"completado": True})
    with TestClient(make_app()) as restarted:  # segundo arranque sobre la misma base
        logros = restarted.get("/api/achievements", headers=user["headers"]).json()["logros"]
    assert len(logros) == 6
    assert [logro["codigo"] for logro in logros if logro["obtenido"]] == ["primer_hueso"]


def test_grant_module_achievements_solo_devuelve_lo_recien_otorgado(client, auth, db_session):
    user_id = auth["user"]["id"]
    assert grant_module_achievements(db_session, user_id, 4) == ["mineralizador"]
    assert grant_module_achievements(db_session, user_id, 4) == []
    db_session.commit()
    count = db_session.exec(
        select(func.count()).select_from(UserAchievement).where(UserAchievement.user_id == user_id)
    ).one()
    assert count == 1


def test_modulo_sin_logro_en_el_catalogo_no_otorga_nada(client, auth, db_session):
    assert grant_module_achievements(db_session, auth["user"]["id"], 99) == []
