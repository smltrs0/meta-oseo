from datetime import datetime

from sqlalchemy import String, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.core.clock import utcnow
from app.models.types import UTCDateTime


class ProgressModulo(SQLModel, table=True):
    """Progreso de un usuario en un módulo (1..6). Una fila por (usuario, módulo)."""

    __tablename__ = "progress_modulos"
    __table_args__ = (
        UniqueConstraint("user_id", "modulo", name="uq_progress_modulos_user_modulo"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE")
    modulo: int
    seccion_actual: str | None = Field(default=None, sa_type=String(64))
    completado: bool = False
    tiempo_total_seg: int = 0
    updated_at: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime)
