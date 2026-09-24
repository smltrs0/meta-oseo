from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Index, String
from sqlmodel import Field, SQLModel

from app.core.clock import utcnow
from app.models.types import UTCDateTime


class ActivityResult(SQLModel, table=True):
    """Resultado de un intento de actividad. Cada llamada guarda una fila (historial)."""

    __tablename__ = "activity_results"
    __table_args__ = (Index("ix_activity_results_user_activity", "user_id", "activity_id"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE")
    activity_id: str = Field(sa_type=String(64))
    modulo: int
    tipo: str = Field(sa_type=String(32))
    puntaje: int
    intentos: int
    completada: bool
    # Datos libres del cliente (hasta 4 KB serializado). JSON portable; NULL si no hay detalle.
    detalle: dict[str, Any] | None = Field(default=None, sa_type=JSON(none_as_null=True))
    created_at: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime)
