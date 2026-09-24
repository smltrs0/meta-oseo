from datetime import datetime

from sqlalchemy import String, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.core.clock import utcnow
from app.models.types import UTCDateTime


class Achievement(SQLModel, table=True):
    """Catálogo de logros (se siembra de forma idempotente al arrancar la app)."""

    __tablename__ = "achievements"

    codigo: str = Field(primary_key=True, sa_type=String(64))
    nombre: str = Field(sa_type=String(120))
    descripcion: str = Field(sa_type=String(255))
    # Módulo cuya finalización otorga el logro; NULL para logros transversales (F5-04).
    modulo: int | None = Field(default=None)


class UserAchievement(SQLModel, table=True):
    """Logro obtenido por un usuario. Único por (usuario, logro): otorgar es idempotente."""

    __tablename__ = "user_achievements"
    __table_args__ = (
        UniqueConstraint("user_id", "codigo", name="uq_user_achievements_user_codigo"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE")
    codigo: str = Field(foreign_key="achievements.codigo", sa_type=String(64))
    obtenido_en: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime)
