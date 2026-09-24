"""Catálogo y otorgamiento de logros (docs/api-contract.md, "Logros").

El otorgamiento es atómico e idempotente: se apoya en la restricción única
`(user_id, codigo)` con `INSERT ... ON CONFLICT DO NOTHING ... RETURNING`, así dos peticiones
concurrentes nunca duplican un logro y solo una de ellas lo ve como "nuevo".
"""

from dataclasses import dataclass

from sqlmodel import Session, col, select

from app.core.clock import utcnow
from app.core.db import dialect_insert
from app.models.achievement import Achievement, UserAchievement
from app.schemas.achievement import AchievementList, AchievementRead


@dataclass(frozen=True)
class AchievementDef:
    codigo: str
    nombre: str
    descripcion: str
    # Módulo cuya finalización otorga el logro; None para los transversales (F5-04).
    modulo: int | None


# Catálogo de Fase 1: completar el módulo N otorga el logro N.
ACHIEVEMENT_CATALOG: tuple[AchievementDef, ...] = (
    AchievementDef("primer_hueso", "Primer hueso", "Completaste el módulo 1", 1),
    AchievementDef("celula_por_celula", "Célula por célula", "Completaste el módulo 2", 2),
    AchievementDef("constructor", "Constructor", "Completaste el módulo 3", 3),
    AchievementDef("mineralizador", "Mineralizador", "Completaste el módulo 4", 4),
    AchievementDef("remodelador", "Remodelador", "Completaste el módulo 5", 5),
    AchievementDef("cronista", "Cronista", "Completaste el módulo 6", 6),
)


def seed_achievements(session: Session) -> None:
    """Siembra el catálogo de logros. Idempotente y segura con varios procesos arrancando a la vez.

    Inserta los que faltan y actualiza nombre, descripción y módulo de los existentes, de modo
    que corregir un texto del catálogo basta con reiniciar la API.
    """
    insert = dialect_insert(session)
    statement = insert(Achievement).values(
        [
            {
                "codigo": item.codigo,
                "nombre": item.nombre,
                "descripcion": item.descripcion,
                "modulo": item.modulo,
            }
            for item in ACHIEVEMENT_CATALOG
        ]
    )
    statement = statement.on_conflict_do_update(
        index_elements=["codigo"],
        set_={
            "nombre": statement.excluded.nombre,
            "descripcion": statement.excluded.descripcion,
            "modulo": statement.excluded.modulo,
        },
    )
    session.exec(statement)
    session.commit()


def grant_module_achievements(session: Session, user_id: int, modulo: int) -> list[str]:
    """Otorga los logros ligados a completar `modulo`. Devuelve solo los recién otorgados.

    No hace commit: forma parte de la transacción del llamador.
    """
    codes = session.exec(
        select(Achievement.codigo).where(Achievement.modulo == modulo).order_by(Achievement.codigo)
    ).all()
    insert = dialect_insert(session)
    granted: list[str] = []
    for codigo in codes:
        statement = (
            insert(UserAchievement)
            .values(user_id=user_id, codigo=codigo, obtenido_en=utcnow())
            .on_conflict_do_nothing(index_elements=["user_id", "codigo"])
            .returning(UserAchievement.codigo)
        )
        if session.exec(statement).first() is not None:
            granted.append(codigo)
    return granted


def earned_codes(session: Session, user_id: int) -> list[str]:
    """Códigos de los logros del usuario, en el orden en que los obtuvo."""
    return list(
        session.exec(
            select(UserAchievement.codigo)
            .where(UserAchievement.user_id == user_id)
            .order_by(col(UserAchievement.obtenido_en), col(UserAchievement.id))
        ).all()
    )


def list_achievements(session: Session, user_id: int) -> AchievementList:
    """Catálogo completo con el estado de obtención del usuario (`GET /api/achievements`)."""
    earned = {
        row.codigo: row.obtenido_en
        for row in session.exec(select(UserAchievement).where(UserAchievement.user_id == user_id))
    }
    catalog = session.exec(
        select(Achievement).order_by(
            col(Achievement.modulo).is_(None), col(Achievement.modulo), col(Achievement.codigo)
        )
    ).all()
    return AchievementList(
        logros=[
            AchievementRead(
                codigo=item.codigo,
                nombre=item.nombre,
                descripcion=item.descripcion,
                obtenido=item.codigo in earned,
                obtenido_en=earned.get(item.codigo),
            )
            for item in catalog
        ]
    )
