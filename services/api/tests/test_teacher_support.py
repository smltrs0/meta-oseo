"""Utilidades compartidas por las pruebas del panel docente (sin pruebas propias)."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.engine import Engine
from sqlmodel import Session

from app.models.activity import ActivityResult
from app.models.enums import Rol
from app.models.progress import ProgressModulo
from app.models.usage import UsageEvent
from app.models.user import User

# Reloj fijo de las pruebas: el router lee `utcnow` de su propio módulo y se parchea con esto.
NOW = datetime(2026, 9, 24, 15, 0, 0, tzinfo=UTC)

OPUS = "claude-opus-5"
SONNET = "claude-sonnet-5"


def days_ago(days: float) -> datetime:
    return NOW - timedelta(days=days)


def add_user(
    session: Session,
    nombre: str,
    apellido: str,
    numero: str,
    *,
    tipo: str = "CC",
    rol: str = Rol.estudiante.value,
    nivel: str = "pregrado",
) -> int:
    user = User(
        nombre=nombre,
        apellido=apellido,
        tipo_identificacion=tipo,
        numero_identificacion=numero,
        rol=rol,
        nivel=nivel,
        created_at=days_ago(200),
    )
    session.add(user)
    session.flush()
    assert user.id is not None
    return user.id


def add_progress(
    session: Session,
    user_id: int,
    modulo: int,
    *,
    completado: bool = False,
    tiempo: int = 0,
    updated_at: datetime,
    seccion: str | None = None,
) -> None:
    session.add(
        ProgressModulo(
            user_id=user_id,
            modulo=modulo,
            completado=completado,
            tiempo_total_seg=tiempo,
            seccion_actual=seccion,
            updated_at=updated_at,
        )
    )


def add_result(
    session: Session,
    user_id: int,
    activity_id: str,
    modulo: int,
    puntaje: int,
    intentos: int,
    completada: bool,
    created_at: datetime,
    tipo: str = "quiz",
) -> None:
    session.add(
        ActivityResult(
            user_id=user_id,
            activity_id=activity_id,
            modulo=modulo,
            tipo=tipo,
            puntaje=puntaje,
            intentos=intentos,
            completada=completada,
            created_at=created_at,
        )
    )


def add_usage(
    session: Session,
    user_id: int,
    created_at: datetime,
    model: str,
    tokens_in: int,
    tokens_out: int,
    cache_read: int = 0,
    cache_write: int = 0,
) -> None:
    session.add(
        UsageEvent(
            user_id=user_id,
            kind="chat",
            model=model,
            input_tokens=tokens_in,
            output_tokens=tokens_out,
            cache_read_tokens=cache_read,
            cache_creation_tokens=cache_write,
            created_at=created_at,
        )
    )


def seed_cohort(session: Session, docente_id: int | None = None) -> dict[str, int]:
    """Cohorte de 5 estudiantes con datos cuyos agregados se calculan a mano en las pruebas.

    - Ana (A): módulos 1 y 2 completos (600 s y 300 s), el 3 sin completar (100 s). Actividades:
      m1_a con 3 registros (50 sin completar, 80 y 90 completados, intentos 1..3), m1_b 70,
      m2_a 100.
      Puntaje 90 + 70 + 100 = 260. Mentor: hoy (opus, 1000/500) y hace 2 días (opus, 2000/1000).
    - Beto (B): módulo 1 completo (400 s), el 2 sin completar (50 s). m1_a nunca completada
      (30 y 40, intentos 1 y 2); m1_b 60 (intentos 2). Puntaje 60. Última actividad hace 20 días.
    - Carla (C): sin progreso ni resultados; una consulta al mentor hace 100 días.
    - Diego (D): módulos 1 a 6 completos (100 s cada uno) hace 40 días; m6_a 300.
      Mentor: hace 10 días.
    - Elena (E): solo mentor: hace 2 días (sonnet, 4000/2000, caché 10000 leída y 1000 escrita).
    - El docente (si se pasa `docente_id`) tiene datos que NO deben contar en ninguna cifra.
    """
    ids = {
        "ana": add_user(session, "Ana", "Pérez", "1023456789"),
        "beto": add_user(session, "Beto", "Gómez", "2000000002", tipo="TI"),
        "carla": add_user(session, "Carla", "Ruiz", "3000000003", nivel="posgrado"),
        "diego": add_user(session, "Diego", "Mora", "4000000004", tipo="CE"),
        "elena": add_user(session, "Elena", "Vega", "5000000005"),
    }
    ana, beto, carla, diego, elena = (ids[k] for k in ("ana", "beto", "carla", "diego", "elena"))

    add_progress(
        session, ana, 1, completado=True, tiempo=600, updated_at=days_ago(3), seccion="fin"
    )
    add_progress(session, ana, 2, completado=True, tiempo=300, updated_at=days_ago(3))
    add_progress(session, ana, 3, tiempo=100, updated_at=days_ago(3), seccion="mecanotransduccion")
    add_result(session, ana, "m1_a", 1, 50, 1, False, days_ago(4))
    add_result(session, ana, "m1_a", 1, 80, 2, True, days_ago(3))
    add_result(session, ana, "m1_a", 1, 90, 3, True, days_ago(3))
    add_result(session, ana, "m1_b", 1, 70, 1, True, days_ago(3))
    add_result(session, ana, "m2_a", 2, 100, 1, True, days_ago(3))
    add_usage(session, ana, NOW - timedelta(hours=1), OPUS, 1000, 500)
    add_usage(session, ana, days_ago(2), OPUS, 2000, 1000)

    add_progress(session, beto, 1, completado=True, tiempo=400, updated_at=days_ago(20))
    add_progress(session, beto, 2, tiempo=50, updated_at=days_ago(20))
    add_result(session, beto, "m1_a", 1, 30, 1, False, days_ago(20))
    add_result(session, beto, "m1_a", 1, 40, 2, False, days_ago(20))
    add_result(session, beto, "m1_b", 1, 60, 2, True, days_ago(20))

    add_usage(session, carla, days_ago(100), OPUS, 700, 70)

    for modulo in range(1, 7):
        add_progress(session, diego, modulo, completado=True, tiempo=100, updated_at=days_ago(40))
    add_result(session, diego, "m6_a", 6, 300, 1, True, days_ago(40))
    add_usage(session, diego, days_ago(10), OPUS, 500, 100)

    add_usage(session, elena, days_ago(2), SONNET, 4000, 2000, cache_read=10000, cache_write=1000)

    if docente_id is not None:
        add_progress(session, docente_id, 1, completado=True, tiempo=999, updated_at=days_ago(1))
        add_result(session, docente_id, "m1_a", 1, 999, 9, True, days_ago(1))
        add_usage(session, docente_id, days_ago(1), OPUS, 999999, 999999)
    session.commit()
    return ids


def query_counter(engine: Engine) -> list[str]:
    """Registra las sentencias SQL ejecutadas por el motor. Devuelve la lista viva."""
    from sqlalchemy import event

    statements: list[str] = []

    @event.listens_for(engine, "before_cursor_execute")
    def _count(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    return statements
