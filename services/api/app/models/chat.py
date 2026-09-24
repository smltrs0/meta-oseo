from datetime import datetime

from sqlalchemy import String, Text
from sqlmodel import Field, SQLModel

from app.core.clock import utcnow
from app.models.types import UTCDateTime


class ChatSession(SQLModel, table=True):
    """Conversación con el mentor (F3-09). La tabla se crea vacía en Fase 1."""

    __tablename__ = "chat_sessions"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE", index=True)
    modulo: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime)
    updated_at: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime)


class ChatMessage(SQLModel, table=True):
    """Mensaje de una sesión, con los tokens de la respuesta (F3-09)."""

    __tablename__ = "chat_messages"

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="chat_sessions.id", ondelete="CASCADE", index=True)
    role: str = Field(sa_type=String(16))  # user | assistant
    content: str = Field(sa_type=Text)
    input_tokens: int | None = Field(default=None)
    output_tokens: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime)
