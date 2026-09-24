from typing import Literal

from pydantic import BaseModel

from app.models.enums import TipoIdentificacion
from app.schemas.identidad import IdNumber, PersonName
from app.schemas.user import UserRead


class LoginRequest(BaseModel):
    tipo_identificacion: TipoIdentificacion
    numero_identificacion: IdNumber


class RegisterRequest(LoginRequest):
    nombre: PersonName
    apellido: PersonName


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int  # segundos
    user: UserRead
