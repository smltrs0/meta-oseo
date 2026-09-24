"""Errores propios de la API con el formato del contrato.

Respuesta: `{"detail": {"code": "<slug>", "message": "<texto en español>"}}`.
Los 422 de validación de FastAPI conservan su formato por defecto.
"""

import math
from collections.abc import Mapping
from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.text import printable_utf8


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    """Cuerpo de error, solo para documentar en OpenAPI."""

    detail: ErrorDetail


def api_error(
    status_code: int,
    code: str,
    message: str,
    headers: Mapping[str, str] | None = None,
) -> HTTPException:
    """Construye la excepción HTTP con el cuerpo de error del contrato."""
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
        headers=dict(headers) if headers else None,
    )


def invalid_token() -> HTTPException:
    """401 `token_invalido`: falta el token, expiró, no verifica o el usuario ya no existe."""
    return api_error(
        status.HTTP_401_UNAUTHORIZED,
        "token_invalido",
        "Tu sesión no es válida o expiró. Vuelve a ingresar.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def user_not_found() -> HTTPException:
    return api_error(
        status.HTTP_404_NOT_FOUND,
        "usuario_no_encontrado",
        "No hay un usuario registrado con esa identificación.",
    )


def user_already_exists() -> HTTPException:
    return api_error(
        status.HTTP_409_CONFLICT,
        "usuario_existente",
        "Ya existe un usuario registrado con esa identificación.",
    )


def too_many_attempts(retry_after_seconds: int) -> HTTPException:
    return api_error(
        status.HTTP_429_TOO_MANY_REQUESTS,
        "demasiados_intentos",
        "Demasiados intentos. Espera un momento antes de volver a intentar.",
        headers={"Retry-After": str(max(1, retry_after_seconds))},
    )


def _json_safe(value: Any) -> Any:
    """Reemplaza NaN/Infinity por su texto y los sustitutos Unicode sueltos por U+FFFD."""
    if isinstance(value, float) and not math.isfinite(value):
        return repr(value)
    if isinstance(value, str):
        return printable_utf8(value)
    if isinstance(value, dict):
        return {_json_safe(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_json_safe(item) for item in value]
    return value


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 con el formato por defecto de FastAPI (`detail` es una lista de errores).

    Solo cambia un detalle: un cuerpo JSON con `NaN`, `Infinity` o un sustituto Unicode suelto
    (Python los acepta al leer) devolvería en `input` un valor que `JSONResponse` no puede
    serializar y la respuesta sería un 500. Aquí esos valores se reemplazan por texto seguro.
    """
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": _json_safe(jsonable_encoder(exc.errors()))},
    )
