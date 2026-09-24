from datetime import datetime

from sqlalchemy import String
from sqlmodel import Field, SQLModel

from app.core.clock import utcnow
from app.models.types import UTCDateTime


class UsageEvent(SQLModel, table=True):
    """Consumo de tokens por petición al modelo (control de costo desde el primer día)."""

    __tablename__ = "usage_events"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE", index=True)
    kind: str = Field(sa_type=String(32))  # p. ej. "chat"
    model: str = Field(sa_type=String(64))
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0
    created_at: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime, index=True)
