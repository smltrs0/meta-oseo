"""Normalización y validación de la identidad (docs/api-contract.md, "Identificación").

Es el ÚNICO lugar donde viven estas reglas: los esquemas de entrada usan estos tipos anotados
y el script `promote_docente` reutiliza `normalize_id_number`. El frontend aplica la misma regla
en `apps/web/src/lib/identificacion.ts`.
"""

import re
import unicodedata
from typing import Annotated

from pydantic import AfterValidator, Field

from app.core.text import ensure_storable

ID_NUMBER_PATTERN = r"^[A-Z0-9]{4,20}$"
NAME_MIN_LENGTH = 1
NAME_MAX_LENGTH = 80

_ID_SEPARATORS = re.compile(r"[\s.\-]+")
_ID_NUMBER = re.compile(r"[A-Z0-9]{4,20}")
_WHITESPACE = re.compile(r"\s+")


def normalize_id_number(value: str) -> str:
    """Quita espacios, puntos y guiones, pasa a mayúsculas y exige `^[A-Z0-9]{4,20}$`.

    Ejemplo: `"1.023.456-789"` -> `"1023456789"`.
    """
    compact = _ID_SEPARATORS.sub("", value)
    # Solo ASCII se pasa a mayúsculas: `str.upper()` convierte "ß" en "SS" y "ſ" en "S", lo que
    # dejaría pasar caracteres no ASCII como si fueran letras del documento.
    if compact.isascii():
        compact = compact.upper()
    if not _ID_NUMBER.fullmatch(compact):
        raise ValueError(
            "El número de identificación debe tener de 4 a 20 letras o dígitos "
            "(se ignoran espacios, puntos y guiones)."
        )
    return compact


def normalize_name(value: str) -> str:
    """Recorta, colapsa los espacios internos y valida 1..80 caracteres sin caracteres de control.

    Se conservan acentos, ñ, apóstrofes y guiones, y las mayúsculas tal cual se escribieron.
    Los caracteres de control (categoría Unicode `Cc`, incluidos tabuladores y saltos de línea)
    se rechazan antes de colapsar espacios.
    """
    if any(unicodedata.category(char) == "Cc" for char in value):
        raise ValueError("No puede contener caracteres de control.")
    ensure_storable(value)
    collapsed = _WHITESPACE.sub(" ", value).strip()
    if not NAME_MIN_LENGTH <= len(collapsed) <= NAME_MAX_LENGTH:
        raise ValueError(f"Debe tener entre {NAME_MIN_LENGTH} y {NAME_MAX_LENGTH} caracteres.")
    return collapsed


IdNumber = Annotated[
    str,
    AfterValidator(normalize_id_number),
    Field(
        description="Número de identificación. Se normaliza: sin espacios, puntos ni guiones, "
        "en mayúsculas; debe cumplir ^[A-Z0-9]{4,20}$.",
        examples=["1.023.456-789"],
    ),
]

PersonName = Annotated[
    str,
    AfterValidator(normalize_name),
    Field(
        description="Nombre o apellido: se recorta y se colapsan espacios; de 1 a 80 caracteres "
        "sin caracteres de control.",
        examples=["Ana"],
    ),
]
