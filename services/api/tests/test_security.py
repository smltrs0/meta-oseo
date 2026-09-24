"""JWT y tipos de columna."""

from datetime import UTC, datetime, timedelta, timezone

import jwt
import pytest

from app.core.security import JWT_ALGORITHM, create_access_token, decode_access_token
from app.models.types import UTCDateTime
from tests.conftest import TEST_SECRET_KEY


def test_token_ida_y_vuelta(settings):
    token = create_access_token(42, settings)
    assert decode_access_token(token, settings) == 42


def test_el_token_usa_hs256_y_expira_segun_la_configuracion(settings):
    token = create_access_token(1, settings)
    assert jwt.get_unverified_header(token)["alg"] == JWT_ALGORITHM == "HS256"
    claims = jwt.decode(token, TEST_SECRET_KEY, algorithms=["HS256"])
    assert claims["exp"] - claims["iat"] == settings.access_token_expire_minutes * 60


def test_token_expirado_no_decodifica(settings):
    token = create_access_token(1, settings, expires_delta=timedelta(seconds=-1))
    assert decode_access_token(token, settings) is None


@pytest.mark.parametrize("token", ["", "abc", "a.b.c", "a.b", "🙂", "Bearer x"])
def test_basura_no_decodifica(settings, token):
    assert decode_access_token(token, settings) is None


def test_clave_distinta_no_decodifica(settings):
    token = create_access_token(1, settings)
    other = settings.model_copy(update={"secret_key": "otra-clave-distinta-de-la-del-servidor-01"})
    assert decode_access_token(token, other) is None


def test_utc_datetime_normaliza_a_utc():
    tipo = UTCDateTime()
    naive = datetime(2026, 9, 23, 20, 0, 0)
    bogota = datetime(2026, 9, 23, 15, 0, 0, tzinfo=timezone(timedelta(hours=-5)))
    assert tipo.process_bind_param(naive, None) == datetime(2026, 9, 23, 20, tzinfo=UTC)
    assert tipo.process_bind_param(bogota, None) == datetime(2026, 9, 23, 20, tzinfo=UTC)
    assert tipo.process_bind_param(None, None) is None
    assert tipo.process_result_value(naive, None) == datetime(2026, 9, 23, 20, tzinfo=UTC)
    assert tipo.process_result_value(bogota, None).tzinfo is UTC
    assert tipo.process_result_value(None, None) is None
