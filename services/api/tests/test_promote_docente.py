"""Script `python -m app.scripts.promote_docente <tipo> <numero>` (F1-05)."""

import os
import subprocess
import sys

from app.core.db import build_engine
from app.core.settings import API_DIR
from app.scripts.promote_docente import (
    EXIT_BAD_ARGS,
    EXIT_DATABASE,
    EXIT_NOT_FOUND,
    EXIT_OK,
    main,
)


def role_of(client, auth) -> str:
    return client.get("/api/me", headers=auth["headers"]).json()["rol"]


def test_promueve_a_docente(client, auth, engine, capsys):
    assert role_of(client, auth) == "estudiante"
    assert main(["CC", "1023456789"], engine=engine) == EXIT_OK
    assert role_of(client, auth) == "docente"
    assert "docente" in capsys.readouterr().out


def test_normaliza_el_numero_y_el_tipo(client, auth, engine):
    assert main(["cc", "1.023.456-789"], engine=engine) == EXIT_OK
    assert role_of(client, auth) == "docente"


def test_es_idempotente(client, auth, engine):
    assert main(["CC", "1023456789"], engine=engine) == EXIT_OK
    assert main(["CC", "1023456789"], engine=engine) == EXIT_OK
    assert role_of(client, auth) == "docente"


def test_usuario_inexistente(client, engine, capsys):
    assert main(["CC", "999999999"], engine=engine) == EXIT_NOT_FOUND
    assert "registrarse" in capsys.readouterr().err


def test_tipo_de_otro_usuario_no_se_confunde(client, auth, engine):
    assert main(["PA", "1023456789"], engine=engine) == EXIT_NOT_FOUND
    assert role_of(client, auth) == "estudiante"


def test_tipo_invalido(client, engine, capsys):
    assert main(["XX", "1023456789"], engine=engine) == EXIT_BAD_ARGS
    assert "Tipo de identificación inválido" in capsys.readouterr().err


def test_numero_invalido(client, engine, capsys):
    assert main(["CC", "12"], engine=engine) == EXIT_BAD_ARGS
    assert "Número de identificación inválido" in capsys.readouterr().err


def test_faltan_argumentos(engine, capsys):
    assert main([], engine=engine) == EXIT_BAD_ARGS
    assert main(["CC"], engine=engine) == EXIT_BAD_ARGS
    capsys.readouterr()


def test_sin_esquema_sale_con_mensaje_claro_y_no_con_traceback(tmp_path, capsys):
    empty = build_engine(f"sqlite:///{(tmp_path / 'vacia.db').as_posix()}")
    try:
        assert main(["CC", "1023456789"], engine=empty) == EXIT_DATABASE
    finally:
        empty.dispose()
    assert "alembic upgrade head" in capsys.readouterr().err


def test_el_docente_conserva_el_rol_tras_actualizar_el_nivel(client, auth, engine):
    main(["CC", "1023456789"], engine=engine)
    response = client.patch("/api/me", headers=auth["headers"], json={"nivel": "posgrado"})
    assert response.json()["rol"] == "docente"


def test_se_ejecuta_como_modulo_de_python(tmp_path):
    """`python -m app.scripts.promote_docente` arranca y valida sus argumentos."""
    url = f"sqlite:///{(tmp_path / 'vacia.db').as_posix()}"
    result = subprocess.run(
        [sys.executable, "-m", "app.scripts.promote_docente", "XX", "123456"],
        cwd=API_DIR,
        env={**os.environ, "DATABASE_URL": url, "PYTHONIOENCODING": "utf-8"},
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
        check=False,
    )
    assert result.returncode == EXIT_BAD_ARGS, result.stderr
    assert "Tipo de identificación inválido" in result.stderr
