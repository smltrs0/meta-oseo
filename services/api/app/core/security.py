"""JWT (HS256, PyJWT) y dependencia `get_current_user`.

Sin contraseñas en esta etapa (decisión del equipo, PLAN §1): el token se emite al registrarse
o ingresar con tipo y número de identificación.
"""

from datetime import timedelta
from typing import Annotated

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.clock import utcnow
from app.core.db import SessionDep
from app.core.errors import invalid_token
from app.core.settings import Settings
from app.models.user import User

JWT_ALGORITHM = "HS256"

# auto_error=False: los fallos de autenticación se responden con el formato de error del
# contrato (401 `token_invalido`), no con el 403 por defecto de FastAPI.
_bearer_scheme = HTTPBearer(auto_error=False, description="JWT obtenido en register o login")


def create_access_token(
    user_id: int, settings: Settings, expires_delta: timedelta | None = None
) -> str:
    """Firma un JWT con `sub` = id de usuario. Expira según ACCESS_TOKEN_EXPIRE_MINUTES."""
    issued_at = utcnow()
    lifetime = expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    claims = {"sub": str(user_id), "iat": issued_at, "exp": issued_at + lifetime}
    return jwt.encode(claims, settings.secret_key, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str, settings: Settings) -> int | None:
    """Devuelve el id de usuario del token, o `None` si no verifica, expiró o está mal formado."""
    try:
        claims = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[JWT_ALGORITHM],  # lista cerrada: rechaza `alg: none` y otros algoritmos
            options={"require": ["exp", "sub"]},
        )
        return int(claims["sub"])
    except (jwt.PyJWTError, ValueError, TypeError):
        return None


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    session: SessionDep,
) -> User:
    """Usuario del token Bearer. 401 `token_invalido` ante cualquier fallo."""
    if credentials is None:
        raise invalid_token()
    user_id = decode_access_token(credentials.credentials, request.app.state.settings)
    if user_id is None:
        raise invalid_token()
    user = session.get(User, user_id)
    if user is None:  # el usuario fue borrado después de emitir el token
        raise invalid_token()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
