"""Registro, ingreso, token y perfil (F1-05)."""

import re
import warnings
from datetime import timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from app.core.security import JWT_ALGORITHM, create_access_token
from app.models.user import User
from tests.conftest import ANA, TEST_SECRET_KEY

ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def register_body(**overrides):
    return {**ANA, **overrides}


# --- registro ---------------------------------------------------------------------------------


def test_registro_feliz(client):
    response = client.post("/api/auth/register", json=register_body())
    assert response.status_code == 201
    data = response.json()
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 604800
    assert data["access_token"]
    user = data["user"]
    assert user["id"] >= 1
    assert user["nombre"] == "Ana"
    assert user["apellido"] == "Pérez"
    assert user["tipo_identificacion"] == "CC"
    assert user["numero_identificacion"] == "1023456789"
    assert user["nivel"] == "pregrado"
    assert user["rol"] == "estudiante"
    assert ISO_UTC.match(user["created_at"])
    assert set(user) == {
        "id",
        "nombre",
        "apellido",
        "tipo_identificacion",
        "numero_identificacion",
        "nivel",
        "rol",
        "created_at",
    }


def test_el_token_emitido_sirve_para_entrar(client):
    token = client.post("/api/auth/register", json=register_body()).json()["access_token"]
    response = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["nombre"] == "Ana"


def test_registro_duplicado_devuelve_409(client):
    assert client.post("/api/auth/register", json=register_body()).status_code == 201
    response = client.post("/api/auth/register", json=register_body(nombre="Otra"))
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "usuario_existente"
    assert detail["message"]


def test_mismo_numero_con_otro_tipo_es_otro_usuario(client):
    assert client.post("/api/auth/register", json=register_body()).status_code == 201
    other = client.post("/api/auth/register", json=register_body(tipo_identificacion="PA"))
    assert other.status_code == 201
    assert other.json()["user"]["tipo_identificacion"] == "PA"


def test_normaliza_el_numero_de_identificacion(client):
    response = client.post(
        "/api/auth/register", json=register_body(numero_identificacion="1.023.456-789")
    )
    assert response.status_code == 201
    assert response.json()["user"]["numero_identificacion"] == "1023456789"


def test_normaliza_a_mayusculas_y_quita_espacios(client):
    response = client.post(
        "/api/auth/register",
        json=register_body(tipo_identificacion="PA", numero_identificacion=" ab- 123.45 "),
    )
    assert response.status_code == 201
    assert response.json()["user"]["numero_identificacion"] == "AB12345"


def test_duplicado_detectado_tras_normalizar(client):
    assert (
        client.post(
            "/api/auth/register", json=register_body(numero_identificacion="1.023.456-789")
        ).status_code
        == 201
    )
    response = client.post("/api/auth/register", json=register_body())
    assert response.status_code == 409


@pytest.mark.parametrize("numero", ["1234", "A" * 20])
def test_numero_en_los_limites_es_valido(client, numero):
    response = client.post("/api/auth/register", json=register_body(numero_identificacion=numero))
    assert response.status_code == 201


@pytest.mark.parametrize(
    "numero",
    ["123", "1.2.3", "A" * 21, "", "   ", "12#456", "1234 5678 é", "ñandú123", "１２３４５"],
)
def test_numero_invalido_devuelve_422(client, numero):
    response = client.post("/api/auth/register", json=register_body(numero_identificacion=numero))
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)  # formato por defecto de FastAPI


@pytest.mark.parametrize("tipo", ["XX", "", "cedula", None, 5])
def test_tipo_de_identificacion_invalido_devuelve_422(client, tipo):
    response = client.post("/api/auth/register", json=register_body(tipo_identificacion=tipo))
    assert response.status_code == 422


@pytest.mark.parametrize("tipo", ["CC", "TI", "CE", "PA", "RC", "PEP", "PPT"])
def test_los_siete_tipos_del_contrato_son_validos(client, tipo):
    response = client.post("/api/auth/register", json=register_body(tipo_identificacion=tipo))
    assert response.status_code == 201
    assert response.json()["user"]["tipo_identificacion"] == tipo


@pytest.mark.parametrize("campo", ["nombre", "apellido"])
@pytest.mark.parametrize(
    "valor",
    ["", "   ", "\t", "Ana\x00", "Ana\nPérez", "Ana\tLu", "\x07Ana", "x" * 81, "Ana\x7f"],
)
def test_nombre_vacio_o_con_caracteres_de_control_devuelve_422(client, campo, valor):
    response = client.post("/api/auth/register", json=register_body(**{campo: valor}))
    assert response.status_code == 422


@pytest.mark.parametrize("campo", ["nombre", "apellido"])
def test_nombre_no_texto_devuelve_422(client, campo):
    for valor in (None, 12, ["Ana"], {"a": 1}):
        response = client.post("/api/auth/register", json=register_body(**{campo: valor}))
        assert response.status_code == 422


def test_nombre_se_recorta_y_colapsa_espacios_pero_conserva_lo_escrito(client):
    response = client.post(
        "/api/auth/register",
        json=register_body(nombre="  María   José ", apellido="D'Angelo-Muñoz  Peña"),
    )
    assert response.status_code == 201
    user = response.json()["user"]
    assert user["nombre"] == "María José"
    assert user["apellido"] == "D'Angelo-Muñoz Peña"


def test_nombre_de_80_caracteres_es_valido(client):
    response = client.post("/api/auth/register", json=register_body(nombre="ñ" * 80))
    assert response.status_code == 201
    assert response.json()["user"]["nombre"] == "ñ" * 80


@pytest.mark.parametrize(
    "campo", ["nombre", "apellido", "tipo_identificacion", "numero_identificacion"]
)
def test_faltan_campos_devuelve_422(client, campo):
    body = register_body()
    del body[campo]
    assert client.post("/api/auth/register", json=body).status_code == 422


def test_cuerpo_que_no_es_json_devuelve_422(client):
    response = client.post(
        "/api/auth/register", content="no es json", headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422


def test_no_se_puede_autoasignar_el_rol_docente(client):
    response = client.post(
        "/api/auth/register", json=register_body(rol="docente", nivel="posgrado")
    )
    assert response.status_code == 201
    user = response.json()["user"]
    assert user["rol"] == "estudiante"
    assert user["nivel"] == "pregrado"


def test_el_usuario_queda_guardado_normalizado(client, db_session):
    client.post("/api/auth/register", json=register_body(numero_identificacion="1.023.456-789"))
    users = db_session.exec(select(User)).all()
    assert len(users) == 1
    assert users[0].numero_identificacion == "1023456789"
    assert users[0].tipo_identificacion == "CC"


def test_expires_in_sigue_la_configuracion(make_app):
    with TestClient(make_app(access_token_expire_minutes=5)) as short_client:
        data = short_client.post("/api/auth/register", json=register_body()).json()
    assert data["expires_in"] == 300
    claims = jwt.decode(data["access_token"], TEST_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    assert claims["exp"] - claims["iat"] == 300
    assert claims["sub"] == str(data["user"]["id"])


# --- login ------------------------------------------------------------------------------------


def test_login_ok(client, auth):
    response = client.post(
        "/api/auth/login",
        json={"tipo_identificacion": "CC", "numero_identificacion": "1023456789"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 604800
    assert data["user"]["id"] == auth["user"]["id"]
    me = client.get("/api/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200


def test_login_normaliza_el_numero(client, auth):
    response = client.post(
        "/api/auth/login",
        json={"tipo_identificacion": "CC", "numero_identificacion": "1.023.456-789"},
    )
    assert response.status_code == 200
    assert response.json()["user"]["id"] == auth["user"]["id"]


def test_login_de_usuario_inexistente_devuelve_404(client):
    response = client.post(
        "/api/auth/login",
        json={"tipo_identificacion": "CC", "numero_identificacion": "999999999"},
    )
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["code"] == "usuario_no_encontrado"
    assert detail["message"]


def test_login_con_otro_tipo_devuelve_404(client, auth):
    response = client.post(
        "/api/auth/login",
        json={"tipo_identificacion": "TI", "numero_identificacion": "1023456789"},
    )
    assert response.status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"tipo_identificacion": "CC"},
        {"numero_identificacion": "1023456789"},
        {"tipo_identificacion": "ZZ", "numero_identificacion": "1023456789"},
        {"tipo_identificacion": "CC", "numero_identificacion": "12"},
    ],
)
def test_login_con_cuerpo_invalido_devuelve_422(client, body):
    assert client.post("/api/auth/login", json=body).status_code == 422


# --- token ------------------------------------------------------------------------------------


def assert_token_invalido(response):
    assert response.status_code == 401
    detail = response.json()["detail"]
    assert detail["code"] == "token_invalido"
    assert detail["message"]
    assert response.headers["www-authenticate"] == "Bearer"


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_sin_token_devuelve_401(client):
    assert_token_invalido(client.get("/api/me"))


@pytest.mark.parametrize(
    "header",
    ["Bearer", "Bearer ", "Bearer abc", "Bearer a.b.c", "Basic dXNlcjpwYXNz", "token-suelto", ""],
)
def test_token_mal_formado_devuelve_401(client, header):
    assert_token_invalido(client.get("/api/me", headers={"Authorization": header}))


def test_token_expirado_devuelve_401(client, auth, settings):
    expired = create_access_token(
        auth["user"]["id"], settings, expires_delta=timedelta(seconds=-30)
    )
    assert_token_invalido(client.get("/api/me", headers=bearer(expired)))


def test_token_firmado_con_otra_clave_devuelve_401(client, auth):
    forged = jwt.encode(
        {"sub": str(auth["user"]["id"]), "exp": 4102444800},
        "otra-clave-distinta-de-la-del-servidor-0123456789",
        algorithm=JWT_ALGORITHM,
    )
    assert_token_invalido(client.get("/api/me", headers=bearer(forged)))


def test_token_sin_firma_alg_none_devuelve_401(client, auth):
    unsigned = jwt.encode(
        {"sub": str(auth["user"]["id"]), "exp": 4102444800}, key=None, algorithm="none"
    )
    assert_token_invalido(client.get("/api/me", headers=bearer(unsigned)))


def test_token_con_otro_algoritmo_devuelve_401(client, auth):
    with warnings.catch_warnings():  # la clave de 48 bytes es corta para HS512: no importa aquí
        warnings.simplefilter("ignore")
        other = jwt.encode(
            {"sub": str(auth["user"]["id"]), "exp": 4102444800},
            TEST_SECRET_KEY,
            algorithm="HS512",
        )
    assert_token_invalido(client.get("/api/me", headers=bearer(other)))


@pytest.mark.parametrize(
    "claims",
    [
        {"exp": 4102444800},
        {"sub": "1"},
        {"sub": "abc", "exp": 4102444800},
        {"sub": "", "exp": 4102444800},
    ],
)
def test_token_sin_claims_validos_devuelve_401(client, auth, claims):
    token = jwt.encode(claims, TEST_SECRET_KEY, algorithm=JWT_ALGORITHM)
    assert_token_invalido(client.get("/api/me", headers=bearer(token)))


def test_token_de_usuario_borrado_devuelve_401(client, auth, db_session):
    user = db_session.get(User, auth["user"]["id"])
    db_session.delete(user)
    db_session.commit()
    assert_token_invalido(client.get("/api/me", headers=auth["headers"]))


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/me"),
        ("PATCH", "/api/me"),
        ("GET", "/api/progress"),
        ("PUT", "/api/progress/1"),
        ("POST", "/api/activities/m1_x/result"),
        ("GET", "/api/achievements"),
    ],
)
def test_endpoints_protegidos_exigen_token(client, method, path):
    assert_token_invalido(client.request(method, path, json={}))


# --- /api/me ----------------------------------------------------------------------------------


def test_me_devuelve_el_usuario(client, auth):
    response = client.get("/api/me", headers=auth["headers"])
    assert response.status_code == 200
    assert response.json() == auth["user"]


def test_patch_me_cambia_el_nivel(client, auth):
    response = client.patch("/api/me", headers=auth["headers"], json={"nivel": "posgrado"})
    assert response.status_code == 200
    assert response.json()["nivel"] == "posgrado"
    assert client.get("/api/me", headers=auth["headers"]).json()["nivel"] == "posgrado"
    back = client.patch("/api/me", headers=auth["headers"], json={"nivel": "pregrado"})
    assert back.json()["nivel"] == "pregrado"


@pytest.mark.parametrize("nivel", ["doctorado", "", "POSGRADO", 3])
def test_patch_me_con_nivel_invalido_devuelve_422(client, auth, nivel):
    response = client.patch("/api/me", headers=auth["headers"], json={"nivel": nivel})
    assert response.status_code == 422


def test_patch_me_con_nivel_nulo_no_cambia_nada(client, auth):
    response = client.patch("/api/me", headers=auth["headers"], json={"nivel": None})
    assert response.status_code == 200
    assert response.json() == auth["user"]


def test_patch_me_ignora_rol_y_otros_campos(client, auth):
    response = client.patch(
        "/api/me",
        headers=auth["headers"],
        json={"rol": "docente", "nombre": "Hacker", "numero_identificacion": "0000", "id": 99},
    )
    assert response.status_code == 200
    assert response.json() == auth["user"]


def test_patch_me_vacio_no_cambia_nada(client, auth):
    response = client.patch("/api/me", headers=auth["headers"], json={})
    assert response.status_code == 200
    assert response.json() == auth["user"]
