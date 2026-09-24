"""Limitador de intentos por IP en register + login (F1-05)."""

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.core.rate_limit import SlidingWindowLimiter, client_ip
from tests.conftest import ANA

LOGIN_BODY = {"tipo_identificacion": "CC", "numero_identificacion": "999999999"}


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


# --- unidad: ventana deslizante ---------------------------------------------------------------


def test_ventana_deslizante_permite_hasta_el_maximo():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(3, 60, clock)
    assert [limiter.hit("ip") for _ in range(3)] == [None, None, None]
    assert limiter.hit("ip") == pytest.approx(60)


def test_los_rechazos_no_alargan_el_bloqueo():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(2, 60, clock)
    limiter.hit("ip")
    limiter.hit("ip")
    clock.now += 10
    assert limiter.hit("ip") == pytest.approx(50)  # se rechaza y NO se registra
    clock.now += 50.1  # pasó la ventana desde los dos primeros intentos
    assert limiter.hit("ip") is None


def test_la_ventana_se_desliza_intento_por_intento():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(2, 60, clock)
    limiter.hit("ip")  # t=0
    clock.now += 30
    limiter.hit("ip")  # t=30
    clock.now += 31  # t=61: el primero salió de la ventana, el segundo sigue
    assert limiter.hit("ip") is None
    assert limiter.hit("ip") == pytest.approx(29)


def test_las_claves_son_independientes():
    limiter = SlidingWindowLimiter(1, 60, FakeClock())
    assert limiter.hit("a") is None
    assert limiter.hit("b") is None
    assert limiter.hit("a") is not None


def test_reset_olvida_los_intentos():
    limiter = SlidingWindowLimiter(1, 60, FakeClock())
    limiter.hit("a")
    limiter.reset()
    assert limiter.hit("a") is None


def test_barrido_libera_claves_vencidas():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(1, 60, clock)
    for index in range(600):
        limiter.hit(f"ip-{index}")
    clock.now += 120
    for index in range(600):  # supera _SWEEP_EVERY_HITS y dispara el barrido
        limiter.hit(f"nueva-{index}")
    assert len(limiter._events) <= 600 + 1


@pytest.mark.parametrize("args", [(0, 60), (1, 0), (-1, 10)])
def test_parametros_invalidos(args):
    with pytest.raises(ValueError, match="max_events"):
        SlidingWindowLimiter(*args)


def _request(client_host: str | None, forwarded: str | None = None) -> Request:
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded is not None else []
    scope = {
        "type": "http",
        "headers": headers,
        "client": (client_host, 1234) if client_host else None,
    }
    return Request(scope)


def test_client_ip_ignora_x_forwarded_for_por_defecto():
    assert client_ip(_request("10.0.0.1", "1.2.3.4"), trust_proxy=False) == "10.0.0.1"


def test_client_ip_usa_el_primer_valor_de_x_forwarded_for_con_trust_proxy():
    assert client_ip(_request("10.0.0.1", "1.2.3.4, 5.6.7.8"), trust_proxy=True) == "1.2.3.4"
    assert client_ip(_request("10.0.0.1", "  9.9.9.9  "), trust_proxy=True) == "9.9.9.9"


def test_client_ip_cae_a_la_ip_directa_si_la_cabecera_falta_o_esta_vacia():
    assert client_ip(_request("10.0.0.1"), trust_proxy=True) == "10.0.0.1"
    assert client_ip(_request("10.0.0.1", ""), trust_proxy=True) == "10.0.0.1"
    assert client_ip(_request("10.0.0.1", " , 5.5.5.5"), trust_proxy=True) == "10.0.0.1"
    assert client_ip(_request(None), trust_proxy=False) == "desconocida"


# --- integración: register + login ------------------------------------------------------------


def test_al_intento_11_devuelve_429(client):
    for _ in range(10):
        assert client.post("/api/auth/login", json=LOGIN_BODY).status_code == 404
    response = client.post("/api/auth/login", json=LOGIN_BODY)
    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "demasiados_intentos"
    assert response.json()["detail"]["message"]
    assert 1 <= int(response.headers["retry-after"]) <= 60


def test_register_y_login_comparten_el_mismo_cubo(client):
    for index in range(5):
        response = client.post(
            "/api/auth/register", json={**ANA, "numero_identificacion": f"1000{index}"}
        )
        assert response.status_code == 201
    for _ in range(5):
        assert client.post("/api/auth/login", json=LOGIN_BODY).status_code == 404
    assert client.post("/api/auth/login", json=LOGIN_BODY).status_code == 429
    assert client.post("/api/auth/register", json=ANA).status_code == 429


def test_los_intentos_con_cuerpo_invalido_tambien_cuentan(client):
    for _ in range(10):
        assert client.post("/api/auth/login", json={}).status_code == 422
    assert client.post("/api/auth/login", json=LOGIN_BODY).status_code == 429


def test_otros_endpoints_no_consumen_el_cupo(client, auth):
    for _ in range(15):
        assert client.get("/api/me", headers=auth["headers"]).status_code == 200
    assert client.get("/api/health").status_code == 200
    # el registro de la fixture `auth` consumió 1 de 10
    for _ in range(9):
        assert client.post("/api/auth/login", json=LOGIN_BODY).status_code == 404
    assert client.post("/api/auth/login", json=LOGIN_BODY).status_code == 429


def test_por_defecto_x_forwarded_for_no_permite_esquivar_el_limite(client):
    for index in range(10):
        response = client.post(
            "/api/auth/login", json=LOGIN_BODY, headers={"X-Forwarded-For": f"8.8.8.{index}"}
        )
        assert response.status_code == 404
    response = client.post(
        "/api/auth/login", json=LOGIN_BODY, headers={"X-Forwarded-For": "7.7.7.7"}
    )
    assert response.status_code == 429


def test_con_trust_proxy_cada_ip_de_origen_tiene_su_cupo(make_app):
    with TestClient(make_app(trust_proxy=True)) as proxied:
        for _ in range(10):
            response = proxied.post(
                "/api/auth/login", json=LOGIN_BODY, headers={"X-Forwarded-For": "1.1.1.1"}
            )
            assert response.status_code == 404
        blocked = proxied.post(
            "/api/auth/login", json=LOGIN_BODY, headers={"X-Forwarded-For": "1.1.1.1"}
        )
        assert blocked.status_code == 429
        # Otra IP de origen no está bloqueada.
        other = proxied.post(
            "/api/auth/login", json=LOGIN_BODY, headers={"X-Forwarded-For": "2.2.2.2"}
        )
        assert other.status_code == 404
        # Solo cuenta el PRIMER valor de la cadena.
        chained = proxied.post(
            "/api/auth/login", json=LOGIN_BODY, headers={"X-Forwarded-For": "1.1.1.1, 2.2.2.2"}
        )
        assert chained.status_code == 429


def test_cada_app_tiene_su_propio_limitador(make_app):
    with TestClient(make_app()) as first, TestClient(make_app()) as second:
        for _ in range(10):
            first.post("/api/auth/login", json=LOGIN_BODY)
        assert first.post("/api/auth/login", json=LOGIN_BODY).status_code == 429
        assert second.post("/api/auth/login", json=LOGIN_BODY).status_code == 404


def test_la_app_expone_el_limitador_del_mentor_de_20_por_minuto(app):
    limiter = app.state.chat_limiter
    assert isinstance(limiter, SlidingWindowLimiter)
    assert (limiter.max_events, limiter.window_seconds) == (20, 60)
    assert app.state.auth_limiter is not limiter
