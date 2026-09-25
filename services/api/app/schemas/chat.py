"""Cuerpo de `POST /api/chat` (docs/api-contract.md, "Mentor de IA")."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.text import ensure_storable
from app.schemas.contexto import ContextoPedagogico

MIN_MESSAGES = 1
MAX_MESSAGES = 40
MAX_MESSAGE_CHARS = 8000


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)

    @field_validator("content")
    @classmethod
    def _content_is_usable(cls, value: str) -> str:
        # U+0000 y sustitutos Unicode sueltos harían fallar la serialización hacia Anthropic
        # (500 en lugar de 422). Un mensaje solo de espacios lo rechazaría Anthropic con un 400.
        ensure_storable(value)
        if not value.strip():
            raise ValueError("El mensaje no puede estar vacío.")
        return value


class ChatRequest(BaseModel):
    """Historial de la conversación (el último mensaje es del usuario) y contexto pedagógico."""

    messages: list[ChatMessage] = Field(min_length=MIN_MESSAGES, max_length=MAX_MESSAGES)
    # Opcional. En Fase 1 se valida y se ignora (su inyección en el prompt es F3-04).
    contexto: ContextoPedagogico | None = None

    @field_validator("messages")
    @classmethod
    def _last_message_is_from_user(cls, value: list[ChatMessage]) -> list[ChatMessage]:
        if value and value[-1].role != "user":
            raise ValueError("El último mensaje debe ser del usuario.")
        return value
