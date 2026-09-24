"""Progreso por módulo y puntaje (docs/api-contract.md, "Progreso" y "Actividades y puntaje").

Las escrituras son atómicas: no hay ciclos leer-modificar-escribir en Python. La fila del
módulo se crea con `INSERT ... ON CONFLICT DO NOTHING` y se actualiza con `UPDATE` de una
sola sentencia (`tiempo_total_seg = tiempo_total_seg + :delta`), de modo que peticiones
concurrentes ni pierden tiempo ni rompen la unicidad `(user_id, modulo)`.
"""

from sqlalchemy import func, update
from sqlmodel import Session, col, select

from app.core.clock import utcnow
from app.core.constants import MODULE_COUNT
from app.core.db import dialect_insert
from app.models.activity import ActivityResult
from app.models.progress import ProgressModulo
from app.schemas.activity import ActivityResultCreate
from app.schemas.progress import (
    ModuloProgressRead,
    ProgressRead,
    ProgressUpdate,
    ProgressUpdateResponse,
)
from app.services.achievements import earned_codes, grant_module_achievements


def compute_total_score(session: Session, user_id: int) -> int:
    """Puntaje total: suma, por `activity_id`, del MEJOR puntaje entre los intentos completados.

    Repetir una actividad no acumula puntos y un intento incompleto no puntúa.
    """
    best_per_activity = (
        select(func.max(ActivityResult.puntaje).label("mejor"))
        .where(ActivityResult.user_id == user_id, col(ActivityResult.completada).is_(True))
        .group_by(ActivityResult.activity_id)
        .subquery()
    )
    total = session.exec(select(func.coalesce(func.sum(best_per_activity.c.mejor), 0))).one()
    return int(total)


def get_progress(session: Session, user_id: int) -> ProgressRead:
    """Los 6 módulos (con valores por defecto si no hay fila), puntaje total y logros."""
    rows = {
        row.modulo: row
        for row in session.exec(select(ProgressModulo).where(ProgressModulo.user_id == user_id))
    }
    modulos = [
        ModuloProgressRead.model_validate(rows[numero])
        if numero in rows
        else ModuloProgressRead(modulo=numero)
        for numero in range(1, MODULE_COUNT + 1)
    ]
    return ProgressRead(
        modulos=modulos,
        puntaje_total=compute_total_score(session, user_id),
        logros=earned_codes(session, user_id),
    )


def update_module_progress(
    session: Session, user_id: int, modulo: int, payload: ProgressUpdate
) -> ProgressUpdateResponse:
    """`PUT /api/progress/{modulo}`: suma tiempo, fija sección, completa (monótono) y premia."""
    now = utcnow()

    # 1) Garantiza que la fila exista. Con dos peticiones simultáneas solo una inserta.
    insert = dialect_insert(session)
    session.exec(
        insert(ProgressModulo)
        .values(
            user_id=user_id,
            modulo=modulo,
            seccion_actual=None,
            completado=False,
            tiempo_total_seg=0,
            updated_at=now,
        )
        .on_conflict_do_nothing(index_elements=["user_id", "modulo"])
    )

    # 2) Aplica los cambios en una sola sentencia UPDATE.
    changes: dict[str, object] = {"updated_at": now}
    if payload.seccion_actual is not None:
        changes["seccion_actual"] = payload.seccion_actual
    if payload.tiempo_delta_seg:
        changes["tiempo_total_seg"] = ProgressModulo.tiempo_total_seg + payload.tiempo_delta_seg
    if payload.completado is True:
        # Solo pasa de false a true: `completado: false` sobre un módulo completado no revierte.
        changes["completado"] = True
    session.exec(
        update(ProgressModulo)
        .where(ProgressModulo.user_id == user_id, ProgressModulo.modulo == modulo)
        .values(**changes)
    )

    # 3) Otorga los logros del módulo. Se intenta también si ya estaba completado: es idempotente
    # y `logros_nuevos` solo lista lo recién otorgado.
    completed = session.exec(
        select(ProgressModulo.completado).where(
            ProgressModulo.user_id == user_id, ProgressModulo.modulo == modulo
        )
    ).one()
    new_achievements = grant_module_achievements(session, user_id, modulo) if completed else []

    row = session.exec(
        select(ProgressModulo)
        .where(ProgressModulo.user_id == user_id, ProgressModulo.modulo == modulo)
        .execution_options(populate_existing=True)
    ).one()
    session.commit()
    return ProgressUpdateResponse(
        modulo=ModuloProgressRead.model_validate(row), logros_nuevos=new_achievements
    )


def record_activity_result(
    session: Session, user_id: int, activity_id: str, payload: ActivityResultCreate
) -> tuple[ActivityResult, int, list[str]]:
    """`POST /api/activities/{activity_id}/result`: guarda el intento y recalcula el puntaje.

    Devuelve `(fila guardada, puntaje_total, logros_nuevos)`. En Fase 1 completar una actividad
    no otorga logros por sí mismo (los transversales llegan en F5-04), así que la lista va vacía.
    """
    row = ActivityResult(
        user_id=user_id,
        activity_id=activity_id,
        modulo=payload.modulo,
        tipo=payload.tipo.value,
        puntaje=payload.puntaje,
        intentos=payload.intentos,
        completada=payload.completada,
        detalle=payload.detalle,
        created_at=utcnow(),
    )
    session.add(row)
    session.flush()
    total = compute_total_score(session, user_id)
    session.commit()
    return row, total, []
