"""CSV de progreso para el docente: UTF-8 con BOM (Excel) y protección contra inyección de fórmulas.

Excel y LibreOffice interpretan como fórmula toda celda de texto que empieza por `=`, `+`, `-`,
`@`, tabulación o retorno de carro. Un estudiante podría registrarse con un nombre como
`=HYPERLINK(...)` y ejecutarlo en el equipo del docente al abrir el archivo. Por eso esas celdas
se prefijan con una comilla simple (`'`), que el programa de hojas de cálculo no muestra.
"""

import csv
import io
from collections.abc import Iterator
from typing import Any

from sqlalchemy.engine import Engine

from app.services.teacher import CSV_COLUMNS, iter_progress_rows

UTF8_BOM = "﻿"
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value: Any) -> Any:
    """Neutraliza una celda de texto que Excel tomaría por fórmula. Los números no se tocan."""
    if isinstance(value, str) and value.startswith(FORMULA_PREFIXES):
        return "'" + value
    return value


def _encode(rows: list[list[Any]]) -> bytes:
    buffer = io.StringIO()
    csv.writer(buffer).writerows([[csv_safe(cell) for cell in row] for row in rows])
    return buffer.getvalue().encode("utf-8")


def iter_progress_csv(engine: Engine, *, mask: bool, flush_rows: int = 500) -> Iterator[bytes]:
    """Genera el CSV en trozos de `flush_rows` filas, sin armar el archivo completo en memoria."""
    yield UTF8_BOM.encode("utf-8") + _encode([list(CSV_COLUMNS)])
    chunk: list[list[Any]] = []
    for row in iter_progress_rows(engine, mask=mask):
        chunk.append(row)
        if len(chunk) >= flush_rows:
            yield _encode(chunk)
            chunk = []
    if chunk:
        yield _encode(chunk)
