from datetime import datetime

from sqlalchemy import String
from sqlmodel import Field, SQLModel

from app.core.clock import utcnow
from app.models.types import UTCDateTime


class Certificate(SQLModel, table=True):
    """Certificado final (F5-05). La tabla se crea vacía en Fase 1."""

    __tablename__ = "certificates"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE", index=True)
    # Código público de verificación (`/verify/{codigo}`).
    codigo: str = Field(sa_type=String(32), index=True, unique=True)
    puntaje_total: int
    created_at: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime)
