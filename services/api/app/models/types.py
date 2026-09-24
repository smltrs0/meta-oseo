"""Tipos de columna portables entre SQLite y PostgreSQL."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator[datetime]):
    """`DateTime(timezone=True)` que siempre entrega `datetime` con zona UTC.

    SQLite no guarda la zona horaria y devolvería fechas ingenuas; PostgreSQL devuelve la
    zona de la sesión. Aquí se normaliza todo a UTC al escribir y al leer. Una fecha ingenua
    de entrada se interpreta como UTC. En el DDL es un `DateTime(timezone=True)` corriente.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def process_result_value(self, value: Any, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
