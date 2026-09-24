"""Modelos SQLModel. Importar este paquete registra todas las tablas en `SQLModel.metadata`."""

from sqlmodel import SQLModel

# Convención de nombres de restricciones: debe fijarse ANTES de definir las tablas. Así las
# migraciones de Alembic llevan nombres estables (imprescindible para alterar SQLite por lotes).
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}
SQLModel.metadata.naming_convention = NAMING_CONVENTION

from app.models.achievement import Achievement, UserAchievement  # noqa: E402
from app.models.activity import ActivityResult  # noqa: E402
from app.models.certificate import Certificate  # noqa: E402
from app.models.chat import ChatMessage, ChatSession  # noqa: E402
from app.models.progress import ProgressModulo  # noqa: E402
from app.models.usage import UsageEvent  # noqa: E402
from app.models.user import User  # noqa: E402

__all__ = [
    "NAMING_CONVENTION",
    "Achievement",
    "ActivityResult",
    "Certificate",
    "ChatMessage",
    "ChatSession",
    "ProgressModulo",
    "UsageEvent",
    "User",
    "UserAchievement",
]
