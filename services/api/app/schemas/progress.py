from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.constants import MAX_SECTION_LENGTH, MAX_TIME_DELTA_SECONDS
from app.core.text import ensure_storable


class ModuloProgressRead(BaseModel):
    """Progreso de un módulo. Sin fila en la base: valores por defecto y campos nulos."""

    model_config = ConfigDict(from_attributes=True)

    modulo: int
    seccion_actual: str | None = None
    completado: bool = False
    tiempo_total_seg: int = 0
    updated_at: datetime | None = None


class ProgressRead(BaseModel):
    modulos: list[ModuloProgressRead]
    puntaje_total: int
    logros: list[str]


class ProgressUpdate(BaseModel):
    """`PUT /api/progress/{modulo}`. Todos los campos son opcionales."""

    seccion_actual: str | None = Field(default=None, max_length=MAX_SECTION_LENGTH)
    tiempo_delta_seg: int | None = Field(default=None, ge=0, le=MAX_TIME_DELTA_SECONDS)
    # Solo pasa de false a true; enviar false sobre un módulo completado no lo revierte.
    completado: bool | None = None

    @field_validator("seccion_actual")
    @classmethod
    def _storable(cls, value: str | None) -> str | None:
        return None if value is None else ensure_storable(value)


class ProgressUpdateResponse(BaseModel):
    modulo: ModuloProgressRead
    logros_nuevos: list[str]
