"""API del panel docente: `/api/teacher/*` (docs/api-contract.md, sección "Docente", F6-03).

Todas las rutas exigen un usuario con rol `docente`: 401 `token_invalido` sin token válido y
403 `no_autorizado` si es estudiante.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query, Request, status
from fastapi.responses import StreamingResponse

from app.core.clock import utcnow
from app.core.db import SessionDep
from app.core.errors import ErrorResponse, api_error
from app.core.security import CurrentUser
from app.core.settings import SettingsDep
from app.models.enums import Rol
from app.models.user import User
from app.schemas.teacher import (
    ActivityStatsRead,
    MentorUsageRead,
    OverviewRead,
    StudentDetail,
    StudentPage,
)
from app.services import teacher as teacher_service
from app.services.teacher_csv import iter_progress_csv


def require_docente(user: CurrentUser) -> User:
    """Deja pasar solo al rol `docente`. El 401 sin token lo da `get_current_user`."""
    if user.rol != Rol.docente.value:
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "no_autorizado",
            "Esta sección es solo para docentes.",
        )
    return user


router = APIRouter(
    prefix="/api/teacher",
    tags=["docente"],
    dependencies=[Depends(require_docente)],
    responses={
        401: {"model": ErrorResponse, "description": "`token_invalido`"},
        403: {"model": ErrorResponse, "description": "`no_autorizado`: el usuario no es docente"},
    },
)

_NOT_FOUND = {404: {"model": ErrorResponse, "description": "`estudiante_no_encontrado`"}}


@router.get("/overview", response_model=OverviewRead, summary="Resumen de la cohorte")
def overview(session: SessionDep) -> OverviewRead:
    return teacher_service.get_overview(session, utcnow())


@router.get("/students", response_model=StudentPage, summary="Lista paginada de estudiantes")
def students(
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=teacher_service.PAGE_SIZE_MAX)] = 25,
    q: Annotated[
        str | None,
        Query(
            max_length=100,
            description=(
                "Texto en nombre o apellido (todas las palabras) o un número de identificación "
                "EXACTO. Solo la búsqueda exacta por número devuelve la identificación completa."
            ),
        ),
    ] = None,
    orden: Annotated[
        Literal["nombre", "puntaje", "ultima_actividad"],
        Query(description="`nombre` asc; `puntaje` y `ultima_actividad` de mayor a menor."),
    ] = "nombre",
) -> StudentPage:
    return teacher_service.list_students(
        session, page=page, page_size=page_size, query=q, order=orden
    )


@router.get(
    "/students/{student_id}",
    response_model=StudentDetail,
    responses=_NOT_FOUND,
    summary="Detalle de un estudiante",
)
def student_detail(
    student_id: Annotated[int, Path(ge=1)], session: SessionDep, settings: SettingsDep
) -> StudentDetail:
    detail = teacher_service.get_student_detail(session, settings, student_id)
    if detail is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "estudiante_no_encontrado",
            "No hay un estudiante con ese id.",
        )
    return detail


@router.get(
    "/activities/stats",
    response_model=ActivityStatsRead,
    summary="Estadísticas por actividad y módulo",
)
def activity_stats(
    session: SessionDep,
    limite: Annotated[int, Query(ge=1, le=50, description="Cuántas actividades difíciles.")] = 5,
) -> ActivityStatsRead:
    return teacher_service.get_activity_stats(session, limite)


@router.get(
    "/mentor/usage",
    response_model=MentorUsageRead,
    summary="Uso del mentor de IA y costo estimado",
)
def mentor_usage(
    session: SessionDep,
    settings: SettingsDep,
    dias: Annotated[int, Query(ge=1, le=365, description="Ventana en días, hoy incluido.")] = 30,
    limite: Annotated[int, Query(ge=1, le=50, description="Tamaño del top de usuarios.")] = 10,
) -> MentorUsageRead:
    return teacher_service.get_mentor_usage(session, settings, days=dias, top=limite, now=utcnow())


@router.get(
    "/export/progress.csv",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/csv": {"schema": {"type": "string"}}}}},
    summary="CSV de progreso: una fila por estudiante y por módulo",
)
def export_progress_csv(
    request: Request,
    identificacion: Annotated[
        Literal["enmascarada", "completa"],
        Query(description="`enmascarada` (por defecto) o `completa`."),
    ] = "enmascarada",
) -> StreamingResponse:
    filename = f"progreso_ova_{utcnow().date().isoformat()}.csv"
    body = iter_progress_csv(request.app.state.engine, mask=identificacion != "completa")
    return StreamingResponse(
        body,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
