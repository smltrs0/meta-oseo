"""Estadísticas del panel docente (`/api/teacher`, docs/api-contract.md, F6-03).

Principios:

- **Todo se agrega en SQL** (`GROUP BY`, `SUM`, `AVG`, subconsultas): nunca se cargan todas las
  filas en memoria. La lista de estudiantes es UNA consulta con `LEFT JOIN` a subconsultas
  agregadas (sin N+1) y solo se traen las filas de la página pedida.
- **Portable entre SQLite y PostgreSQL**: solo SQL estándar (`CASE`, `COALESCE`, `UNION ALL`,
  `LIMIT/OFFSET`). La única diferencia por motor es agrupar por día (`_day_expr`).
- **Solo cuentan los estudiantes** (`rol = 'estudiante'`): el equipo docente no entra en las cifras.
- **Privacidad**: el número de identificación es un dato personal. Por defecto se enmascara y solo
  se ven los últimos `IDENTIFICATION_VISIBLE_CHARS` caracteres (`"*******789"`). Se muestra completo
  únicamente cuando el docente busca ese número exacto en la lista (ya lo conoce). No se puede
  buscar por fragmentos del número, para no poder reconstruirlo probando coincidencias parciales.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, case, distinct, func, literal, or_, select, union_all
from sqlalchemy.engine import Engine
from sqlalchemy.sql import ColumnElement
from sqlalchemy.sql.selectable import Subquery
from sqlmodel import Session, col

from app.core.constants import MODULE_COUNT
from app.core.settings import Settings
from app.models.activity import ActivityResult
from app.models.enums import Rol
from app.models.progress import ProgressModulo
from app.models.usage import UsageEvent
from app.models.user import User
from app.schemas.identidad import normalize_id_number
from app.schemas.teacher import (
    ActivityStat,
    ActivityStatsRead,
    MentorDia,
    MentorDiaModelo,
    MentorModelo,
    MentorTopUsuario,
    MentorTotales,
    MentorUsageRead,
    ModuloActivityStat,
    ModulosCompletadosBucket,
    OverviewRead,
    PreciosMentor,
    PuntajeResumen,
    StudentActividad,
    StudentDetail,
    StudentMentor,
    StudentModulo,
    StudentPage,
    StudentSummary,
    TiempoModulo,
)

# Cuántos caracteres del final de la identificación se dejan a la vista al enmascarar.
IDENTIFICATION_VISIBLE_CHARS = 3
MASK_CHAR = "*"

# Tarifas de caché de Anthropic, relativas al precio de entrada (lectura 0,1x; escritura 1,25x).
CACHE_READ_FACTOR = 0.1
CACHE_WRITE_FACTOR = 1.25

# Tamaño del lote con el que se recorre a los estudiantes al exportar el CSV.
CSV_BATCH_SIZE = 500

PAGE_SIZE_MAX = 100
COST_DECIMALS = 6


def mask_identification(numero: str) -> str:
    """Deja visibles solo los últimos 3 caracteres: `1023456789` -> `*******789`."""
    if len(numero) <= IDENTIFICATION_VISIBLE_CHARS:
        return MASK_CHAR * len(numero)
    hidden = len(numero) - IDENTIFICATION_VISIBLE_CHARS
    return MASK_CHAR * hidden + numero[-IDENTIFICATION_VISIBLE_CHARS:]


def _as_int(value: Any) -> int:
    """Entero desde el resultado de un agregado (PostgreSQL devuelve `Decimal` en `SUM`)."""
    return int(value or 0)


def _as_float(value: Any) -> float | None:
    return None if value is None else float(value)


def _student() -> ColumnElement[bool]:
    return col(User.rol) == Rol.estudiante.value


def _completed(column: Any = None) -> ColumnElement[bool]:
    return col(column if column is not None else ActivityResult.completada).is_(True)


# --- Subconsultas agregadas por usuario ------------------------------------------------------


def _progress_by_user() -> Subquery:
    """Por usuario: módulos completados y tiempo total (`progress_modulos`)."""
    return (
        select(
            ProgressModulo.user_id.label("user_id"),
            func.sum(case((_completed(ProgressModulo.completado), 1), else_=0)).label(
                "completados"
            ),
            func.sum(ProgressModulo.tiempo_total_seg).label("tiempo"),
        )
        .group_by(ProgressModulo.user_id)
        .subquery("progreso_usuario")
    )


def _best_completed_per_activity() -> Any:
    """Por (usuario, actividad): mejor puntaje entre los intentos completados (regla del total)."""
    return (
        select(
            ActivityResult.user_id.label("user_id"),
            ActivityResult.activity_id.label("activity_id"),
            func.min(ActivityResult.modulo).label("modulo"),
            func.max(ActivityResult.puntaje).label("mejor"),
        )
        .where(_completed())
        .group_by(ActivityResult.user_id, ActivityResult.activity_id)
    )


def _score_by_user() -> Subquery:
    """Por usuario: puntaje total (misma regla que `progress.compute_total_score`)."""
    best = _best_completed_per_activity().subquery("mejor_por_actividad")
    return (
        select(best.c.user_id.label("user_id"), func.sum(best.c.mejor).label("puntaje"))
        .group_by(best.c.user_id)
        .subquery("puntaje_usuario")
    )


def _last_activity() -> Subquery:
    """Por usuario: instante de su última actividad (progreso, resultado de actividad o mentor)."""
    parts = [
        select(table.user_id.label("user_id"), func.max(stamp).label("ts")).group_by(table.user_id)
        for table, stamp in (
            (ProgressModulo, ProgressModulo.updated_at),
            (ActivityResult, ActivityResult.created_at),
            (UsageEvent, UsageEvent.created_at),
        )
    ]
    combined = union_all(*parts).subquery("actividad")
    return (
        select(combined.c.user_id.label("user_id"), func.max(combined.c.ts).label("ts"))
        .group_by(combined.c.user_id)
        .subquery("ultima_actividad")
    )


# --- Resumen ---------------------------------------------------------------------------------


def get_overview(session: Session, now: datetime) -> OverviewRead:
    total = _as_int(
        session.execute(select(func.count()).select_from(User).where(_student())).scalar()
    )

    # Activos: última actividad dentro de la ventana (progreso, actividades o consultas al mentor).
    last = _last_activity()
    cutoff_7 = now - timedelta(days=7)
    cutoff_30 = now - timedelta(days=30)
    active = session.execute(
        select(
            func.sum(case((last.c.ts >= cutoff_7, 1), else_=0)),
            func.sum(case((last.c.ts >= cutoff_30, 1), else_=0)),
        )
        .select_from(User)
        .join(last, last.c.user_id == User.id)
        .where(_student())
    ).one()

    # Distribución: cuántos estudiantes tienen 0..6 módulos completados.
    progress = _progress_by_user()
    per_student = (
        select(func.coalesce(progress.c.completados, 0).label("k"))
        .select_from(User)
        .outerjoin(progress, progress.c.user_id == User.id)
        .where(_student())
        .subquery("completados_por_estudiante")
    )
    counts = {
        _as_int(k): _as_int(n)
        for k, n in session.execute(
            select(per_student.c.k, func.count()).group_by(per_student.c.k)
        ).all()
    }
    distribution = [
        ModulosCompletadosBucket(modulos_completados=k, estudiantes=counts.get(k, 0))
        for k in range(MODULE_COUNT + 1)
    ]

    # Tiempo promedio por módulo, sobre los estudiantes que tienen fila de progreso en él.
    time_rows = {
        _as_int(modulo): (_as_float(avg), _as_int(n))
        for modulo, avg, n in session.execute(
            select(
                ProgressModulo.modulo,
                func.avg(ProgressModulo.tiempo_total_seg),
                func.count(),
            )
            .join(User, User.id == ProgressModulo.user_id)
            .where(_student())
            .group_by(ProgressModulo.modulo)
        ).all()
    }
    times = [
        TiempoModulo(
            modulo=modulo,
            tiempo_promedio_seg=time_rows.get(modulo, (None, 0))[0],
            estudiantes=time_rows.get(modulo, (None, 0))[1],
        )
        for modulo in range(1, MODULE_COUNT + 1)
    ]

    return OverviewRead(
        generado_en=now,
        estudiantes=total,
        activos_7d=_as_int(active[0]),
        activos_30d=_as_int(active[1]),
        modulos_completados=distribution,
        tiempo_por_modulo=times,
        puntaje=_score_summary(session, total),
    )


def _score_summary(session: Session, total_students: int) -> PuntajeResumen:
    """Promedio y mediana del puntaje total, calculados en SQL (la mediana con OFFSET/LIMIT)."""
    if total_students == 0:
        return PuntajeResumen()
    score = _score_by_user()
    per_student = (
        select(func.coalesce(score.c.puntaje, 0).label("p"))
        .select_from(User)
        .outerjoin(score, score.c.user_id == User.id)
        .where(_student())
        .subquery("puntaje_por_estudiante")
    )
    mean = session.execute(select(func.avg(per_student.c.p))).scalar()
    # Mediana: con n impar, el valor central; con n par, el promedio de los dos centrales.
    middle = (
        session.execute(
            select(per_student.c.p)
            .order_by(per_student.c.p)
            .offset((total_students - 1) // 2)
            .limit(1 if total_students % 2 else 2)
        )
        .scalars()
        .all()
    )
    median = sum(_as_int(value) for value in middle) / len(middle)
    return PuntajeResumen(promedio=_as_float(mean), mediana=median)


# --- Lista de estudiantes --------------------------------------------------------------------


def _escape_like(token: str) -> str:
    return token.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _exact_identification(text: str) -> str | None:
    """El número normalizado si `text` tiene forma de identificación; si no, `None`."""
    try:
        return normalize_id_number(text)
    except ValueError:
        return None


def _student_conditions(query: str | None) -> tuple[list[ColumnElement[bool]], str | None]:
    """Condiciones de la lista y, si la búsqueda es un número exacto, ese número normalizado.

    Cada palabra debe aparecer en el nombre o el apellido (sin distinguir mayúsculas). El número de
    identificación solo se compara por IGUALDAD, nunca por fragmentos (ver el docstring del módulo).
    """
    conditions: list[ColumnElement[bool]] = [_student()]
    text = " ".join((query or "").split())
    if not text:
        return conditions, None
    name_match = and_(
        *[
            or_(
                func.lower(User.nombre).like(f"%{_escape_like(token.lower())}%", escape="\\"),
                func.lower(User.apellido).like(f"%{_escape_like(token.lower())}%", escape="\\"),
            )
            for token in text.split(" ")
        ]
    )
    exact = _exact_identification(text)
    if exact is None:
        conditions.append(name_match)
    else:
        conditions.append(or_(name_match, User.numero_identificacion == exact))
    return conditions, exact


def list_students(
    session: Session,
    *,
    page: int,
    page_size: int,
    query: str | None,
    order: str,
) -> StudentPage:
    conditions, exact = _student_conditions(query)
    total = _as_int(
        session.execute(select(func.count()).select_from(User).where(*conditions)).scalar()
    )

    progress = _progress_by_user()
    score = _score_by_user()
    last = _last_activity()
    completed = func.coalesce(progress.c.completados, 0)
    points = func.coalesce(score.c.puntaje, 0)
    no_activity_last = case((last.c.ts.is_(None), 1), else_=0)

    by_name = (func.lower(User.nombre), func.lower(User.apellido), User.id)
    if order == "puntaje":
        ordering: tuple[Any, ...] = (points.desc(), *by_name)
    elif order == "ultima_actividad":
        ordering = (no_activity_last, last.c.ts.desc(), User.id)
    else:
        ordering = by_name

    rows = session.execute(
        select(
            User.id,
            User.nombre,
            User.apellido,
            User.tipo_identificacion,
            User.numero_identificacion,
            User.nivel,
            completed.label("completados"),
            points.label("puntaje"),
            func.coalesce(progress.c.tiempo, 0).label("tiempo"),
            last.c.ts.label("ultima"),
        )
        .select_from(User)
        .outerjoin(progress, progress.c.user_id == User.id)
        .outerjoin(score, score.c.user_id == User.id)
        .outerjoin(last, last.c.user_id == User.id)
        .where(*conditions)
        .order_by(*ordering)
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()

    students = []
    for row in rows:
        reveal = exact is not None and row.numero_identificacion == exact
        students.append(
            StudentSummary(
                id=row.id,
                nombre=row.nombre,
                apellido=row.apellido,
                tipo_identificacion=row.tipo_identificacion,
                numero_identificacion=(
                    row.numero_identificacion
                    if reveal
                    else mask_identification(row.numero_identificacion)
                ),
                identificacion_completa=reveal,
                nivel=row.nivel,
                modulos_completados=_as_int(row.completados),
                puntaje_total=_as_int(row.puntaje),
                ultima_actividad=row.ultima,
                tiempo_total_seg=_as_int(row.tiempo),
            )
        )
    return StudentPage(
        estudiantes=students,
        page=page,
        page_size=page_size,
        total=total,
        total_pages=(total + page_size - 1) // page_size,
    )


# --- Detalle de un estudiante ----------------------------------------------------------------


def _mentor_cost(
    settings: Settings, tokens_in: int, tokens_out: int, cache_read: int, cache_write: int
) -> float:
    """Costo estimado en USD (los precios son por millón de tokens)."""
    price_in = settings.precio_entrada_usd_por_mtok
    price_out = settings.precio_salida_usd_por_mtok
    cost = (
        tokens_in * price_in
        + tokens_out * price_out
        + cache_read * price_in * CACHE_READ_FACTOR
        + cache_write * price_in * CACHE_WRITE_FACTOR
    ) / 1_000_000
    return round(cost, COST_DECIMALS)


def get_student_detail(
    session: Session, settings: Settings, student_id: int
) -> StudentDetail | None:
    """Detalle de un estudiante, o `None` si no existe o no es estudiante."""
    user = session.execute(
        select(User)
        .where(User.id == student_id, _student())
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()
    if user is None:
        return None

    progress_rows = {
        row.modulo: row
        for row in session.execute(
            select(ProgressModulo).where(ProgressModulo.user_id == student_id)
        ).scalars()
    }
    progress = [
        StudentModulo(
            modulo=modulo,
            seccion_actual=row.seccion_actual,
            completado=row.completado,
            tiempo_total_seg=row.tiempo_total_seg,
            updated_at=row.updated_at,
        )
        if (row := progress_rows.get(modulo)) is not None
        else StudentModulo(modulo=modulo)
        for modulo in range(1, MODULE_COUNT + 1)
    ]

    activity_rows = session.execute(
        select(
            ActivityResult.activity_id,
            func.min(ActivityResult.modulo).label("modulo"),
            func.min(ActivityResult.tipo).label("tipo"),
            func.max(ActivityResult.puntaje).label("mejor"),
            func.max(case((_completed(), ActivityResult.puntaje))).label("contabilizado"),
            func.max(ActivityResult.intentos).label("intentos"),
            func.count().label("registros"),
            func.max(case((_completed(), 1), else_=0)).label("completada"),
            func.max(ActivityResult.created_at).label("ultimo"),
        )
        .where(ActivityResult.user_id == student_id)
        .group_by(ActivityResult.activity_id)
        .order_by(func.min(ActivityResult.modulo), ActivityResult.activity_id)
    ).all()
    activities = [
        StudentActividad(
            activity_id=row.activity_id,
            modulo=row.modulo,
            tipo=row.tipo,
            mejor_puntaje=_as_int(row.mejor),
            puntaje_contabilizado=_as_int(row.contabilizado),
            intentos=_as_int(row.intentos),
            registros=_as_int(row.registros),
            completada=bool(row.completada),
            ultimo_intento=row.ultimo,
        )
        for row in activity_rows
    ]

    usage = session.execute(
        select(
            func.count(),
            func.sum(UsageEvent.input_tokens),
            func.sum(UsageEvent.output_tokens),
            func.sum(UsageEvent.cache_read_tokens),
            func.sum(UsageEvent.cache_creation_tokens),
            func.max(UsageEvent.created_at),
        ).where(UsageEvent.user_id == student_id)
    ).one()
    tokens_in, tokens_out, cache_read, cache_write = (_as_int(usage[i]) for i in range(1, 5))
    mentor = StudentMentor(
        consultas=_as_int(usage[0]),
        tokens_entrada=tokens_in,
        tokens_salida=tokens_out,
        tokens_cache_lectura=cache_read,
        tokens_cache_escritura=cache_write,
        costo_estimado_usd=_mentor_cost(settings, tokens_in, tokens_out, cache_read, cache_write),
        ultima_consulta=usage[5],
    )

    last_stamps = [
        stamp
        for stamp in (
            *(row.updated_at for row in progress_rows.values()),
            *(activity.ultimo_intento for activity in activities),
            mentor.ultima_consulta,
        )
        if stamp is not None
    ]
    # Suma de los mejores puntajes completados: la misma regla que el total del estudiante.
    total_score = sum(activity.puntaje_contabilizado for activity in activities)
    return StudentDetail(
        id=user.id,
        nombre=user.nombre,
        apellido=user.apellido,
        tipo_identificacion=user.tipo_identificacion,
        numero_identificacion=mask_identification(user.numero_identificacion),
        identificacion_completa=False,
        nivel=user.nivel,
        created_at=user.created_at,
        modulos_completados=sum(1 for item in progress if item.completado),
        puntaje_total=total_score,
        tiempo_total_seg=sum(item.tiempo_total_seg for item in progress),
        ultima_actividad=max(last_stamps) if last_stamps else None,
        progreso=progress,
        actividades=activities,
        mentor=mentor,
    )


# --- Estadísticas por actividad --------------------------------------------------------------


def _rate(completed: Any, attempted: Any) -> float | None:
    attempted = _as_int(attempted)
    return None if attempted == 0 else round(_as_int(completed) / attempted, 4)


def _rounded(value: Any, digits: int = 4) -> float | None:
    number = _as_float(value)
    return None if number is None else round(number, digits)


def get_activity_stats(session: Session, top: int) -> ActivityStatsRead:
    """Por actividad y módulo. La unidad de conteo es el par (estudiante, actividad).

    - `intentaron`: estudiantes con algún registro; `completaron`: con algún registro completado.
    - `intentos_promedio`: promedio del máximo `intentos` reportado por cada estudiante.
    - `puntaje_promedio`: promedio del mejor puntaje completado de quienes la completaron.
    """
    pair = (
        select(
            ActivityResult.activity_id.label("activity_id"),
            ActivityResult.user_id.label("user_id"),
            func.min(ActivityResult.modulo).label("modulo"),
            func.min(ActivityResult.tipo).label("tipo"),
            func.max(ActivityResult.intentos).label("intentos"),
            func.max(case((_completed(), 1), else_=0)).label("completada"),
            func.max(case((_completed(), ActivityResult.puntaje))).label("mejor"),
        )
        .join(User, User.id == ActivityResult.user_id)
        .where(_student())
        .group_by(ActivityResult.activity_id, ActivityResult.user_id)
        .subquery("par_estudiante_actividad")
    )

    activities = [
        ActivityStat(
            activity_id=row.activity_id,
            modulo=row.modulo,
            tipo=row.tipo,
            estudiantes_intentaron=_as_int(row.intentaron),
            estudiantes_completaron=_as_int(row.completaron),
            tasa_finalizacion=_rate(row.completaron, row.intentaron),
            intentos_promedio=_rounded(row.intentos),
            puntaje_promedio=_rounded(row.puntaje),
        )
        for row in session.execute(
            select(
                pair.c.activity_id,
                func.min(pair.c.modulo).label("modulo"),
                func.min(pair.c.tipo).label("tipo"),
                func.count().label("intentaron"),
                func.sum(pair.c.completada).label("completaron"),
                func.avg(pair.c.intentos).label("intentos"),
                func.avg(pair.c.mejor).label("puntaje"),
            )
            .group_by(pair.c.activity_id)
            .order_by(func.min(pair.c.modulo), pair.c.activity_id)
        ).all()
    ]

    module_rows = {
        _as_int(row.modulo): row
        for row in session.execute(
            select(
                pair.c.modulo,
                func.count(distinct(pair.c.activity_id)).label("actividades"),
                func.count(distinct(pair.c.user_id)).label("estudiantes"),
                func.count().label("pares"),
                func.sum(pair.c.completada).label("completados"),
                func.avg(pair.c.intentos).label("intentos"),
                func.avg(pair.c.mejor).label("puntaje"),
            ).group_by(pair.c.modulo)
        ).all()
    }
    by_module = []
    for modulo in range(1, MODULE_COUNT + 1):
        row = module_rows.get(modulo)
        by_module.append(
            ModuloActivityStat(modulo=modulo)
            if row is None
            else ModuloActivityStat(
                modulo=modulo,
                actividades=_as_int(row.actividades),
                estudiantes_intentaron=_as_int(row.estudiantes),
                tasa_finalizacion=_rate(row.completados, row.pares),
                intentos_promedio=_rounded(row.intentos),
                puntaje_promedio=_rounded(row.puntaje),
            )
        )

    # Las más difíciles: menor tasa de finalización y, a igualdad, más intentos promedio.
    hardest = sorted(
        activities,
        key=lambda item: (
            item.tasa_finalizacion if item.tasa_finalizacion is not None else 1.0,
            -(item.intentos_promedio or 0.0),
            item.activity_id,
        ),
    )[:top]
    return ActivityStatsRead(actividades=activities, por_modulo=by_module, mas_dificiles=hardest)


# --- Uso del mentor --------------------------------------------------------------------------


def _day_expr(session: Session, column: Any) -> ColumnElement[str]:
    """`AAAA-MM-DD` (UTC) de una columna de fecha. Es lo único que difiere entre motores."""
    dialect = session.get_bind().dialect.name
    if dialect == "postgresql":
        return func.to_char(func.timezone("UTC", column), "YYYY-MM-DD")
    # SQLite guarda las fechas ya normalizadas a UTC (ver `UTCDateTime`).
    return func.strftime("%Y-%m-%d", column)


def get_mentor_usage(
    session: Session, settings: Settings, *, days: int, top: int, now: datetime
) -> MentorUsageRead:
    """Consultas y tokens del mentor en los últimos `days` días (hoy incluido, en UTC)."""
    today = now.astimezone(UTC).date()
    first_day = today - timedelta(days=days - 1)
    since = datetime(first_day.year, first_day.month, first_day.day, tzinfo=UTC)
    in_period = and_(UsageEvent.created_at >= since, UsageEvent.created_at <= now)

    price_in = settings.precio_entrada_usd_por_mtok
    price_out = settings.precio_salida_usd_por_mtok
    day = _day_expr(session, UsageEvent.created_at)
    sums = (
        func.count().label("consultas"),
        func.coalesce(func.sum(UsageEvent.input_tokens), 0).label("t_in"),
        func.coalesce(func.sum(UsageEvent.output_tokens), 0).label("t_out"),
        func.coalesce(func.sum(UsageEvent.cache_read_tokens), 0).label("c_read"),
        func.coalesce(func.sum(UsageEvent.cache_creation_tokens), 0).label("c_write"),
    )

    def cost(row: Any) -> float:
        return _mentor_cost(settings, row.t_in, row.t_out, row.c_read, row.c_write)

    total_row = session.execute(
        select(*sums, func.count(distinct(UsageEvent.user_id)).label("usuarios")).where(in_period)
    ).one()
    totals = MentorTotales(
        consultas=_as_int(total_row.consultas),
        usuarios=_as_int(total_row.usuarios),
        tokens_entrada=_as_int(total_row.t_in),
        tokens_salida=_as_int(total_row.t_out),
        tokens_cache_lectura=_as_int(total_row.c_read),
        tokens_cache_escritura=_as_int(total_row.c_write),
        costo_estimado_usd=cost(total_row),
    )

    day_rows = {
        row.dia: row
        for row in session.execute(
            select(day.label("dia"), *sums).where(in_period).group_by(day)
        ).all()
    }
    per_day = []
    for offset in range(days):
        label = (first_day + timedelta(days=offset)).isoformat()
        row = day_rows.get(label)
        per_day.append(
            MentorDia(fecha=label)
            if row is None
            else MentorDia(
                fecha=label,
                consultas=_as_int(row.consultas),
                tokens_entrada=_as_int(row.t_in),
                tokens_salida=_as_int(row.t_out),
                costo_estimado_usd=cost(row),
            )
        )

    per_day_model = [
        MentorDiaModelo(
            fecha=row.dia,
            modelo=row.modelo,
            consultas=_as_int(row.consultas),
            tokens_entrada=_as_int(row.t_in),
            tokens_salida=_as_int(row.t_out),
            costo_estimado_usd=cost(row),
        )
        for row in session.execute(
            select(day.label("dia"), UsageEvent.model.label("modelo"), *sums)
            .where(in_period)
            .group_by(day, UsageEvent.model)
            .order_by(day, UsageEvent.model)
        ).all()
    ]

    per_model = [
        MentorModelo(
            modelo=row.modelo,
            consultas=_as_int(row.consultas),
            tokens_entrada=_as_int(row.t_in),
            tokens_salida=_as_int(row.t_out),
            tokens_cache_lectura=_as_int(row.c_read),
            tokens_cache_escritura=_as_int(row.c_write),
            costo_estimado_usd=cost(row),
        )
        for row in session.execute(
            select(UsageEvent.model.label("modelo"), *sums)
            .where(in_period)
            .group_by(UsageEvent.model)
            .order_by(func.count().desc(), UsageEvent.model)
        ).all()
    ]

    # Consumo por usuario, ordenado por costo estimado (misma fórmula que `_mentor_cost`).
    cost_sql = (
        func.sum(UsageEvent.input_tokens) * literal(price_in)
        + func.sum(UsageEvent.output_tokens) * literal(price_out)
        + func.sum(UsageEvent.cache_read_tokens) * literal(price_in * CACHE_READ_FACTOR)
        + func.sum(UsageEvent.cache_creation_tokens) * literal(price_in * CACHE_WRITE_FACTOR)
    )
    top_rows = session.execute(
        select(User.id.label("user_id"), User.nombre, User.apellido, *sums)
        .join(User, User.id == UsageEvent.user_id)
        .where(in_period)
        .group_by(User.id, User.nombre, User.apellido)
        .order_by(cost_sql.desc(), func.count().desc(), User.id)
        .limit(top)
    ).all()
    top_users = [
        MentorTopUsuario(
            user_id=row.user_id,
            nombre=row.nombre,
            apellido=row.apellido,
            consultas=_as_int(row.consultas),
            tokens_entrada=_as_int(row.t_in),
            tokens_salida=_as_int(row.t_out),
            costo_estimado_usd=cost(row),
        )
        for row in top_rows
    ]

    return MentorUsageRead(
        desde=since,
        hasta=now,
        dias=days,
        precios=PreciosMentor(
            entrada_usd_por_mtok=price_in,
            salida_usd_por_mtok=price_out,
            cache_lectura_factor=CACHE_READ_FACTOR,
            cache_escritura_factor=CACHE_WRITE_FACTOR,
            nota=(
                "Estimación con precios configurables (PRECIO_ENTRADA_USD_POR_MTOK y "
                "PRECIO_SALIDA_USD_POR_MTOK); la factura real la emite Anthropic."
            ),
        ),
        totales=totals,
        por_dia=per_day,
        por_dia_modelo=per_day_model,
        por_modelo=per_model,
        top_usuarios=top_users,
    )


# --- Exportación CSV -------------------------------------------------------------------------

CSV_COLUMNS = (
    "id_estudiante",
    "nombre",
    "apellido",
    "tipo_identificacion",
    "numero_identificacion",
    "nivel",
    "modulo",
    "completado",
    "seccion_actual",
    "tiempo_total_seg",
    "puntaje_modulo",
    "actividades_completadas",
    "ultima_actualizacion",
    "puntaje_total",
)


def iter_progress_rows(engine: Engine, *, mask: bool) -> Iterator[list[Any]]:
    """Una fila por estudiante y por módulo (siempre los 6), por lotes de estudiantes.

    Abre su propia sesión: el generador se consume cuando la petición ya devolvió su respuesta.
    """
    last_id = 0
    with Session(engine) as session:
        while True:
            users = session.execute(
                select(
                    User.id,
                    User.nombre,
                    User.apellido,
                    User.tipo_identificacion,
                    User.numero_identificacion,
                    User.nivel,
                )
                .where(_student(), User.id > last_id)
                .order_by(User.id)
                .limit(CSV_BATCH_SIZE)
            ).all()
            if not users:
                return
            last_id = users[-1].id
            ids = [user.id for user in users]

            progress = {
                (row.user_id, row.modulo): row
                for row in session.execute(
                    select(ProgressModulo).where(col(ProgressModulo.user_id).in_(ids))
                ).scalars()
            }
            best = _best_completed_per_activity().where(col(ActivityResult.user_id).in_(ids))
            best = best.subquery("mejor_por_actividad")
            scores = {
                (row.user_id, row.modulo): (_as_int(row.puntaje), _as_int(row.completadas))
                for row in session.execute(
                    select(
                        best.c.user_id,
                        best.c.modulo,
                        func.sum(best.c.mejor).label("puntaje"),
                        func.count().label("completadas"),
                    ).group_by(best.c.user_id, best.c.modulo)
                ).all()
            }

            for user in users:
                total = sum(scores.get((user.id, modulo), (0, 0))[0] for modulo in range(1, 7))
                number = (
                    mask_identification(user.numero_identificacion)
                    if mask
                    else user.numero_identificacion
                )
                for modulo in range(1, MODULE_COUNT + 1):
                    row = progress.get((user.id, modulo))
                    points, done = scores.get((user.id, modulo), (0, 0))
                    yield [
                        user.id,
                        user.nombre,
                        user.apellido,
                        user.tipo_identificacion,
                        number,
                        user.nivel,
                        modulo,
                        "si" if row is not None and row.completado else "no",
                        row.seccion_actual if row is not None else "",
                        row.tiempo_total_seg if row is not None else 0,
                        points,
                        done,
                        _iso(row.updated_at) if row is not None else "",
                        total,
                    ]


def _iso(value: datetime | None) -> str:
    return "" if value is None else value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
