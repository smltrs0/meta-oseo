"""Reloj UTC único del backend (facilita fijar el tiempo en pruebas)."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Instante actual en UTC (con zona horaria), truncado a segundos.

    Se trunca para que las fechas de la API salgan como `2026-09-23T20:00:00Z`,
    igual que en el contrato, y se parseen igual en todos los navegadores.
    """
    return datetime.now(UTC).replace(microsecond=0)
