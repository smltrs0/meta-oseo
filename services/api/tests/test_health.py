"""Salud, documentación OpenAPI y CORS."""

import tomllib

from fastapi.testclient import TestClient

from app import __version__
from app.core.settings import API_DIR


def test_health_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "env": "dev", "version": __version__}


def test_version_coincide_con_pyproject():
    with (API_DIR / "pyproject.toml").open("rb") as file:
        assert tomllib.load(file)["project"]["version"] == __version__


def test_health_no_requiere_autenticacion(client):
    assert client.get("/api/health", headers={"Authorization": "Bearer basura"}).status_code == 200


def test_openapi_disponible_fuera_de_produccion(client):
    assert client.get("/api/docs").status_code == 200
    schema = client.get("/api/openapi.json")
    assert schema.status_code == 200
    paths = set(schema.json()["paths"])
    assert {
        "/api/health",
        "/api/auth/register",
        "/api/auth/login",
        "/api/me",
        "/api/progress",
        "/api/progress/{modulo}",
        "/api/activities/{activity_id}/result",
        "/api/achievements",
    } <= paths


def test_openapi_oculto_en_produccion(make_app):
    app = make_app(env="prod")
    with TestClient(app) as prod_client:
        assert prod_client.get("/api/docs").status_code == 404
        assert prod_client.get("/api/redoc").status_code == 404
        assert prod_client.get("/api/openapi.json").status_code == 404
        assert prod_client.get("/openapi.json").status_code == 404
        assert prod_client.get("/api/health").json()["env"] == "prod"


def test_cors_permite_origen_configurado(client):
    response = client.options(
        "/api/progress",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "PUT" in response.headers["access-control-allow-methods"]
    assert "access-control-allow-credentials" not in response.headers


def test_cors_rechaza_origen_no_configurado(client):
    response = client.options(
        "/api/progress",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in response.headers


def test_cors_en_respuesta_simple(client):
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
