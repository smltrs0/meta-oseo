"""Registro, ingreso y perfil (docs/api-contract.md, "Auth" y "Usuario").

Sin contraseña en esta etapa (PLAN §1): se entra con tipo y número de identificación.
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.core.clock import utcnow
from app.core.db import SessionDep
from app.core.errors import ErrorResponse, user_already_exists, user_not_found
from app.core.rate_limit import rate_limit_auth
from app.core.security import CurrentUser, create_access_token
from app.core.settings import Settings, SettingsDep
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserRead, UserUpdate

router = APIRouter(prefix="/api", tags=["auth"])


def _token_response(user: User, settings: Settings) -> TokenResponse:
    assert user.id is not None  # usuario ya persistido
    return TokenResponse(
        access_token=create_access_token(user.id, settings),
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserRead.model_validate(user),
    )


@router.post(
    "/auth/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_auth)],
    responses={
        409: {"model": ErrorResponse, "description": "`usuario_existente`"},
        429: {"model": ErrorResponse, "description": "`demasiados_intentos`"},
    },
    summary="Registrar un usuario y entrar",
)
def register(body: RegisterRequest, session: SessionDep, settings: SettingsDep) -> TokenResponse:
    user = User(
        nombre=body.nombre,
        apellido=body.apellido,
        tipo_identificacion=body.tipo_identificacion.value,
        numero_identificacion=body.numero_identificacion,
        created_at=utcnow(),
    )
    session.add(user)
    try:
        # Sin consulta previa: el índice único sobre (tipo, número) es la única fuente de verdad,
        # así dos registros simultáneos del mismo documento no pueden colarse ambos.
        session.commit()
    except IntegrityError:
        session.rollback()
        raise user_already_exists() from None
    return _token_response(user, settings)


@router.post(
    "/auth/login",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limit_auth)],
    responses={
        404: {"model": ErrorResponse, "description": "`usuario_no_encontrado`"},
        429: {"model": ErrorResponse, "description": "`demasiados_intentos`"},
    },
    summary="Entrar con tipo y número de identificación",
)
def login(body: LoginRequest, session: SessionDep, settings: SettingsDep) -> TokenResponse:
    user = session.exec(
        select(User).where(
            User.tipo_identificacion == body.tipo_identificacion.value,
            User.numero_identificacion == body.numero_identificacion,
        )
    ).first()
    if user is None:
        raise user_not_found()
    return _token_response(user, settings)


@router.get(
    "/me",
    response_model=UserRead,
    responses={401: {"model": ErrorResponse, "description": "`token_invalido`"}},
    summary="Usuario autenticado",
)
def read_me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch(
    "/me",
    response_model=UserRead,
    responses={401: {"model": ErrorResponse, "description": "`token_invalido`"}},
    summary="Actualizar el perfil (solo el nivel)",
)
def update_me(body: UserUpdate, user: CurrentUser, session: SessionDep) -> UserRead:
    if body.nivel is not None and body.nivel.value != user.nivel:
        user.nivel = body.nivel.value
        session.add(user)
        session.commit()
    return UserRead.model_validate(user)
