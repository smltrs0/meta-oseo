"""Progreso por módulo y resultados de actividades (docs/api-contract.md, F1-06)."""

from typing import Annotated

from fastapi import APIRouter, Path

from app.core.constants import ACTIVITY_ID_PATTERN, MODULE_COUNT
from app.core.db import SessionDep
from app.core.errors import ErrorResponse
from app.core.security import CurrentUser
from app.schemas.activity import ActivityResultCreate, ActivityResultRead, ActivityResultResponse
from app.schemas.progress import ProgressRead, ProgressUpdate, ProgressUpdateResponse
from app.services import progress as progress_service

router = APIRouter(prefix="/api", tags=["progreso"])

_UNAUTHORIZED = {401: {"model": ErrorResponse, "description": "`token_invalido`"}}

ModuloPath = Annotated[
    int,
    Path(ge=1, le=MODULE_COUNT, description=f"Número de módulo, de 1 a {MODULE_COUNT}."),
]
ActivityIdPath = Annotated[
    str,
    Path(
        pattern=ACTIVITY_ID_PATTERN,
        description="Identificador de la actividad.",
        examples=["m1_capas_hueso"],
    ),
]


@router.get(
    "/progress",
    response_model=ProgressRead,
    responses=_UNAUTHORIZED,
    summary="Progreso del usuario en los 6 módulos",
)
def read_progress(user: CurrentUser, session: SessionDep) -> ProgressRead:
    assert user.id is not None
    return progress_service.get_progress(session, user.id)


@router.put(
    "/progress/{modulo}",
    response_model=ProgressUpdateResponse,
    responses=_UNAUTHORIZED,
    summary="Actualizar el progreso de un módulo",
)
def update_progress(
    modulo: ModuloPath, body: ProgressUpdate, user: CurrentUser, session: SessionDep
) -> ProgressUpdateResponse:
    assert user.id is not None
    return progress_service.update_module_progress(session, user.id, modulo, body)


@router.post(
    "/activities/{activity_id}/result",
    response_model=ActivityResultResponse,
    responses=_UNAUTHORIZED,
    summary="Registrar el resultado de un intento de actividad",
)
def post_activity_result(
    activity_id: ActivityIdPath,
    body: ActivityResultCreate,
    user: CurrentUser,
    session: SessionDep,
) -> ActivityResultResponse:
    assert user.id is not None
    row, total, new_achievements = progress_service.record_activity_result(
        session, user.id, activity_id, body
    )
    return ActivityResultResponse(
        resultado=ActivityResultRead.model_validate(row),
        puntaje_total=total,
        logros_nuevos=new_achievements,
    )
