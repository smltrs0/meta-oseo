from datetime import datetime

from sqlalchemy import String
from sqlmodel import Field, SQLModel

from app.core.clock import utcnow
from app.models.types import UTCDateTime


class Certificate(SQLModel, table=True):
    """Certificado final (F5-05). Un certificado por usuario, con una instantánea de sus datos.

    Los datos personales se copian al emitirlo: el certificado no cambia aunque el usuario edite
    su perfil después, y la verificación pública responde siempre lo mismo.
    """

    __tablename__ = "certificates"

    id: int | None = Field(default=None, primary_key=True)
    # Único: una fila por usuario. Es lo que hace idempotente y seguro ante concurrencia el POST.
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE", index=True, unique=True)
    # Código público de verificación (`/api/verify/{codigo}`), p. ej. OVA-7K3M-9QXA.
    codigo: str = Field(sa_type=String(32), index=True, unique=True)
    # Instantánea de la identidad al emitir.
    nombre: str = Field(sa_type=String(80))
    apellido: str = Field(sa_type=String(80))
    tipo_identificacion: str = Field(sa_type=String(8))
    numero_identificacion: str = Field(sa_type=String(20))
    # Puntaje total del usuario (el del HUD) al emitir.
    puntaje_total: int
    # Con manifiesto: puntaje en las actividades obligatorias y su máximo posible. Sin manifiesto,
    # `None` (no se conoce el máximo).
    puntaje_obligatorias: int | None = None
    puntaje_maximo: int | None = None
    created_at: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime)
