import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.constants import (
    MAX_ACTIVITY_ATTEMPTS,
    MAX_ACTIVITY_DETAIL_BYTES,
    MAX_ACTIVITY_SCORE,
    MODULE_COUNT,
)
from app.models.enums import TipoActividad


class ActivityResultCreate(BaseModel):
    """`POST /api/activities/{activity_id}/result`."""

    modulo: int = Field(ge=1, le=MODULE_COUNT)
    tipo: TipoActividad
    puntaje: int = Field(ge=0, le=MAX_ACTIVITY_SCORE)
    intentos: int = Field(ge=1, le=MAX_ACTIVITY_ATTEMPTS)
    completada: bool
    detalle: dict[str, Any] | None = None

    @field_validator("detalle")
    @classmethod
    def _limit_detail_size(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return value
        try:
            # allow_nan=False: NaN/Infinity no son JSON válido y PostgreSQL rechazaría la fila.
            serialized = json.dumps(
                value, ensure_ascii=False, separators=(",", ":"), allow_nan=False
            ).encode("utf-8")  # falla con sustitutos Unicode sueltos
        except (TypeError, ValueError) as error:
            raise ValueError("El detalle debe ser un objeto JSON válido.") from error
        if len(serialized) > MAX_ACTIVITY_DETAIL_BYTES:
            raise ValueError(
                f"El detalle no puede superar {MAX_ACTIVITY_DETAIL_BYTES // 1024} KB serializado."
            )
        return value


class ActivityResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    activity_id: str
    modulo: int
    tipo: TipoActividad
    puntaje: int
    intentos: int
    completada: bool
    created_at: datetime


class ActivityResultResponse(BaseModel):
    resultado: ActivityResultRead
    puntaje_total: int
    logros_nuevos: list[str]
