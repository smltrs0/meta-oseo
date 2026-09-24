from datetime import datetime

from sqlalchemy import Index, String
from sqlmodel import Field, SQLModel

from app.core.clock import utcnow
from app.models.enums import Nivel, Rol
from app.models.types import UTCDateTime


class User(SQLModel, table=True):
    """Estudiante o docente. Se identifica por el par (tipo, número) de identificación."""

    __tablename__ = "users"
    __table_args__ = (
        # La unicidad es sobre el par: un mismo número puede repetirse entre tipos distintos.
        Index(
            "uq_users_identificacion",
            "tipo_identificacion",
            "numero_identificacion",
            unique=True,
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    nombre: str = Field(sa_type=String(80))
    apellido: str = Field(sa_type=String(80))
    tipo_identificacion: str = Field(sa_type=String(8))
    numero_identificacion: str = Field(sa_type=String(20))
    nivel: str = Field(default=Nivel.pregrado.value, sa_type=String(16))
    rol: str = Field(default=Rol.estudiante.value, sa_type=String(16))
    created_at: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime)
