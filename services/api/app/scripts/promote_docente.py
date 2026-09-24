"""Asigna el rol `docente` a un usuario ya registrado.

Uso (desde services/api):

    uv run python -m app.scripts.promote_docente <tipo> <numero>
    uv run python -m app.scripts.promote_docente CC 1.023.456-789

El rol `docente` no se puede autoasignar por la API: esta es la única vía. El número se normaliza
con las mismas reglas del registro (se ignoran espacios, puntos y guiones).

Códigos de salida: 0 = listo, 1 = el usuario no existe, 2 = argumentos inválidos,
3 = la base de datos no está lista (falta `alembic upgrade head` o no hay conexión).
"""

import argparse
import sys
from collections.abc import Sequence

from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, select

from app.core.db import build_engine, ensure_schema
from app.core.settings import get_settings
from app.models.enums import Rol, TipoIdentificacion
from app.models.user import User
from app.schemas.identidad import normalize_id_number

EXIT_OK = 0
EXIT_NOT_FOUND = 1
EXIT_BAD_ARGS = 2
EXIT_DATABASE = 3


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.scripts.promote_docente",
        description="Asigna el rol docente a un usuario registrado.",
    )
    parser.add_argument(
        "tipo",
        help="Tipo de identificación: " + ", ".join(tipo.value for tipo in TipoIdentificacion),
    )
    parser.add_argument("numero", help="Número de identificación (se normaliza)")
    return parser


def promote(engine: Engine, tipo: TipoIdentificacion, numero: str) -> User | None:
    """Promueve al usuario `(tipo, numero)`. Devuelve `None` si no existe. Idempotente."""
    with Session(engine, expire_on_commit=False) as session:
        user = session.exec(
            select(User).where(
                User.tipo_identificacion == tipo.value, User.numero_identificacion == numero
            )
        ).first()
        if user is None:
            return None
        if user.rol != Rol.docente.value:
            user.rol = Rol.docente.value
            session.add(user)
            session.commit()
        return user


def main(argv: Sequence[str] | None = None, engine: Engine | None = None) -> int:
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as error:  # argparse sale con 2 ante argumentos faltantes
        return int(error.code) if isinstance(error.code, int) else EXIT_BAD_ARGS

    try:
        tipo = TipoIdentificacion(args.tipo.strip().upper())
    except ValueError:
        valid = ", ".join(item.value for item in TipoIdentificacion)
        print(
            f"Tipo de identificación inválido: {args.tipo!r}. Usa uno de: {valid}.", file=sys.stderr
        )
        return EXIT_BAD_ARGS
    try:
        numero = normalize_id_number(args.numero)
    except ValueError as error:
        print(f"Número de identificación inválido: {error}", file=sys.stderr)
        return EXIT_BAD_ARGS

    owns_engine = engine is None
    engine = engine or build_engine(get_settings().database_url)
    try:
        ensure_schema(engine)
        user = promote(engine, tipo, numero)
    except RuntimeError as error:  # falta el esquema: ver ensure_schema
        print(error, file=sys.stderr)
        return EXIT_DATABASE
    except SQLAlchemyError as error:
        print(f"No se pudo usar la base de datos: {type(error).__name__}.", file=sys.stderr)
        return EXIT_DATABASE
    finally:
        if owns_engine:
            engine.dispose()

    if user is None:
        print(
            f"No existe un usuario con {tipo.value} {numero}. Debe registrarse primero.",
            file=sys.stderr,
        )
        return EXIT_NOT_FOUND
    print(f"Listo: {user.nombre} {user.apellido} ({tipo.value} {numero}) ahora es docente.")
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
