"""Logros (docs/api-contract.md, "Logros")."""

from fastapi import APIRouter

from app.core.db import SessionDep
from app.core.errors import ErrorResponse
from app.core.security import CurrentUser
from app.schemas.achievement import AchievementList
from app.services import achievements as achievements_service

router = APIRouter(prefix="/api", tags=["gamificación"])


@router.get(
    "/achievements",
    response_model=AchievementList,
    responses={401: {"model": ErrorResponse, "description": "`token_invalido`"}},
    summary="Catálogo de logros con el estado del usuario",
)
def read_achievements(user: CurrentUser, session: SessionDep) -> AchievementList:
    assert user.id is not None
    return achievements_service.list_achievements(session, user.id)
