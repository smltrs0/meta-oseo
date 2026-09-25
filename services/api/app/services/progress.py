"""Progreso por módulo y puntaje (docs/api-contract.md, "Progreso" y "Actividades y puntaje").

Las escrituras son atómicas: no hay ciclos leer-modificar-escribir en Python. La fila del
módulo se crea con `INSERT ... ON CONFLICT DO NOTHING` y se actualiza con `UPDATE` de una
sola sentencia (`tiempo_total_seg = tiempo_total_seg + :delta`), de modo que peticiones
concurrentes ni pierden tiempo ni rompen la unicidad `(user_id, modulo)`.

Validación contra el contenido: si la API tiene un manifiesto de actividades (ver
`app/services/manifest.py`), rechaza resultados de actividades que no existen o que no coinciden
en módulo y tipo, puntajes por encima del máximo, y no deja completar un módulo con actividades
obligatorias pendientes. Sin manifiesto, el comportamiento es el de Fase 1.
"""

from typing import Any

from sqlalchemy import func, update
from sqlmodel import Session, col, select

from app.core.clock import utcnow
from app.core.constants import MODULE_COUNT
from app.core.db import dialect_insert
from app.core.errors import incomplete_module, invalid_score, unknown_activity
from app.models.activity import ActivityResult
from app.models.progress import ProgressModulo
from app.schemas.activity import ActivityBestResult, ActivityResultCreate
from app.schemas.progress import (
    ModuloProgressRead,
    ProgressRead,
    ProgressUpdate,
    ProgressUpdateResponse,
)
from app.services.achievements import earned_codes, grant_module_achievements
from app.services.manifest import Manifest


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


def missing_required_activities(
    session: Session, user_id: int, manifest: Manifest, modulo: int
) -> list[str]:
    """Ids de las actividades obligatorias del módulo sin un resultado completado, en orden."""
    required = manifest.required_ids(modulo)
    if not required:
        return []
    done = set(
        session.exec(
            select(ActivityResult.activity_id)
            .where(
                ActivityResult.user_id == user_id,
                col(ActivityResult.completada).is_(True),
                col(ActivityResult.activity_id).in_(required),
            )
            .distinct()
        ).all()
    )
    return [activity_id for activity_id in required if activity_id not in done]


def _require_module_complete(
    session: Session, user_id: int, manifest: Manifest, modulo: int
) -> None:
    """409 `modulo_incompleto` si el módulo no puede darse por completado con el manifiesto."""
    if modulo not in manifest.modules:
        raise incomplete_module([], "El servidor no tiene registrado el contenido de este módulo.")
    missing = missing_required_activities(session, user_id, manifest, modulo)
    if missing:
        raise incomplete_module(missing)


def update_module_progress(
    session: Session,
    user_id: int,
    modulo: int,
    payload: ProgressUpdate,
    manifest: Manifest | None = None,
) -> ProgressUpdateResponse:
    """`PUT /api/progress/{modulo}`: suma tiempo, fija sección, completa (monótono) y premia.

    Con manifiesto, `completado: true` exige un resultado completado en TODAS las actividades
    obligatorias del módulo (si no, 409 `modulo_incompleto` y no se aplica ningún cambio). Un
    módulo que ya estaba completado no se vuelve a comprobar: `completado` es monótono.
    """
    if manifest is not None and payload.completado is True:
        already = session.exec(
            select(ProgressModulo.completado).where(
                ProgressModulo.user_id == user_id, ProgressModulo.modulo == modulo
            )
        ).first()
        if not already:
            _require_module_complete(session, user_id, manifest, modulo)
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


def validate_against_manifest(
    manifest: Manifest, activity_id: str, payload: ActivityResultCreate
) -> None:
    """422 `actividad_desconocida` o `puntaje_invalido` según el contenido del OVA."""
    spec = manifest.activities.get(activity_id)
    if spec is None or spec.modulo != payload.modulo or spec.tipo != payload.tipo:
        raise unknown_activity()
    if payload.puntaje > spec.puntaje_max:
        raise invalid_score(spec.puntaje_max)


def record_activity_result(
    session: Session,
    user_id: int,
    activity_id: str,
    payload: ActivityResultCreate,
    manifest: Manifest | None = None,
) -> tuple[ActivityResult, int, list[str]]:
    """`POST /api/activities/{activity_id}/result`: guarda el intento y recalcula el puntaje.

    Devuelve `(fila guardada, puntaje_total, logros_nuevos)`. En Fase 1 completar una actividad
    no otorga logros por sí mismo (los transversales llegan en F5-04), así que la lista va vacía.
    Con manifiesto, valida antes de guardar (ver `validate_against_manifest`).
    """
    if manifest is not None:
        validate_against_manifest(manifest, activity_id, payload)
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


def list_activity_results(
    session: Session, user_id: int, modulo: int | None = None
) -> list[ActivityBestResult]:
    """`GET /api/activities/results`: una fila por actividad con resultados del usuario.

    `mejor_puntaje` es el mayor puntaje entre los intentos completados (0 si ninguno), `intentos`
    el mayor reportado y `completada` si alguno se completó. `modulo` y `tipo` son los del último
    intento (con manifiesto no varían; sin él el cliente podría reportarlos distintos). El filtro
    por módulo se aplica a esa fila resumen. No se lee `detalle`: la respuesta es pequeña.
    """
    rows = session.exec(
        select(
            ActivityResult.activity_id,
            ActivityResult.modulo,
            ActivityResult.tipo,
            ActivityResult.puntaje,
            ActivityResult.intentos,
            ActivityResult.completada,
            ActivityResult.created_at,
        )
        .where(ActivityResult.user_id == user_id)
        .order_by(col(ActivityResult.created_at), col(ActivityResult.id))
    ).all()

    best: dict[str, dict[str, Any]] = {}
    for row in rows:  # orden cronológico: la última fila de cada actividad es la más reciente
        entry = best.setdefault(
            row.activity_id, {"mejor_puntaje": 0, "intentos": 0, "completada": False}
        )
        entry["modulo"] = row.modulo
        entry["tipo"] = row.tipo
        entry["ultimo_intento_en"] = row.created_at
        entry["intentos"] = max(entry["intentos"], row.intentos)
        if row.completada:
            entry["completada"] = True
            entry["mejor_puntaje"] = max(entry["mejor_puntaje"], row.puntaje)

    results = [
        ActivityBestResult(activity_id=activity_id, **entry)
        for activity_id, entry in best.items()
        if modulo is None or entry["modulo"] == modulo
    ]
    results.sort(key=lambda item: (item.modulo, item.activity_id))
    return results
