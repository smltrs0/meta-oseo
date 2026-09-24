from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import Nivel, Rol, TipoIdentificacion


class UserRead(BaseModel):
    """Usuario tal como lo devuelve la API (docs/api-contract.md, "Usuario")."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    apellido: str
    tipo_identificacion: TipoIdentificacion
    numero_identificacion: str
    nivel: Nivel
    rol: Rol
    created_at: datetime


class UserUpdate(BaseModel):
    """`PATCH /api/me`: en Fase 1 solo se puede cambiar el nivel.

    Los demás campos (incluido `rol`) se ignoran: el rol docente se asigna por script.
    """

    nivel: Nivel | None = None
