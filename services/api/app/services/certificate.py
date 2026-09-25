"""Certificado de finalización (F5-05): elegibilidad, emisión idempotente y verificación pública.

Reglas de elegibilidad:

- Los 6 módulos están completados.
- Con manifiesto de actividades (validación contra el contenido), además el puntaje del usuario en
  las actividades OBLIGATORIAS alcanza `CERT_MIN_PORCENTAJE` % del máximo de esas actividades. Se
  cuentan solo las obligatorias, y cada una con su mejor intento completado y como mucho su
  `puntaje_max`: así el porcentaje nunca pasa de 100 y una actividad opcional no compensa una
  obligatoria mal resuelta.
- Sin manifiesto solo se exige completar los 6 módulos (no se conoce el máximo).

La emisión es atómica e idempotente: la restricción única sobre `certificates.user_id` y
`INSERT ... ON CONFLICT DO NOTHING ... RETURNING` garantizan un solo certificado por usuario aunque
lleguen dos peticiones a la vez (misma técnica que los logros).
"""

import math
import re
import secrets
from dataclasses import dataclass

from sqlalchemy import func
from sqlmodel import Session, col, select

from app.core.clock import utcnow
from app.core.constants import MODULE_COUNT
from app.core.db import dialect_insert
from app.core.errors import certificate_not_eligible
from app.core.settings import Settings
from app.models.activity import ActivityResult
from app.models.certificate import Certificate
from app.models.progress import ProgressModulo
from app.models.user import User
from app.schemas.certificate import CertificateStatus, CertificateSummary
from app.services.manifest import Manifest
from app.services.progress import compute_total_score

# Alfabeto del código de verificación: sin 0/O ni 1/I/L, que se confunden al leerlos o dictarlos.
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_GROUP = 4
_CODE_PATTERN = re.compile(
    rf"^OVA-[{CODE_ALPHABET}]{{{CODE_GROUP}}}-[{CODE_ALPHABET}]{{{CODE_GROUP}}}$"
)
_MAX_CODE_ATTEMPTS = 8
VISIBLE_ID_CHARS = 3


def generate_code() -> str:
    """Código aleatorio legible, `OVA-XXXX-XXXX` (8 caracteres de 31: unos 40 bits)."""
    groups = ("".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_GROUP)) for _ in range(2))
    return "OVA-" + "-".join(groups)


def normalize_code(raw: str) -> str | None:
    """Código canónico, o `None` si no tiene el formato (tolera minúsculas y espacios)."""
    candidate = raw.strip().upper()
    return candidate if _CODE_PATTERN.match(candidate) else None


def mask_identification(number: str) -> str:
    """Enmascara el número de identificación: solo se ven los últimos 3 caracteres."""
    if len(number) <= VISIBLE_ID_CHARS:
        return "*" * len(number)
    return "*" * (len(number) - VISIBLE_ID_CHARS) + number[-VISIBLE_ID_CHARS:]


def percentage(score: int | None, maximum: int | None) -> float | None:
    """Porcentaje con un decimal, TRUNCADO (69,96 no debe mostrarse como 70,0 sin llegar a 70)."""
    if score is None or maximum is None:
        return None
    if maximum <= 0:
        return 100.0
    return math.floor(score * 1000 / maximum) / 10


def _format_pct(value: float) -> str:
    return f"{value:.1f}".replace(".", ",")


def _spanish_list(numbers: list[int]) -> str:
    texts = [str(number) for number in numbers]
    if len(texts) == 1:
        return texts[0]
    return ", ".join(texts[:-1]) + " y " + texts[-1]


def required_score(session: Session, user_id: int, manifest: Manifest) -> int:
    """Puntaje del usuario en las actividades obligatorias del manifiesto (mejor intento, tope)."""
    required = {
        activity_id: spec.puntaje_max
        for activity_id, spec in manifest.activities.items()
        if spec.obligatoria
    }
    if not required:
        return 0
    rows = session.exec(
        select(ActivityResult.activity_id, func.max(ActivityResult.puntaje))
        .where(
            ActivityResult.user_id == user_id,
            col(ActivityResult.completada).is_(True),
            col(ActivityResult.activity_id).in_(list(required)),
        )
        .group_by(ActivityResult.activity_id)
    ).all()
    return sum(min(int(best), required[activity_id]) for activity_id, best in rows)


@dataclass(frozen=True)
class Eligibility:
    elegible: bool
    modulos_completados: list[int]
    modulos_pendientes: list[int]
    puntaje_total: int
    puntaje_obligatorias: int | None
    puntaje_maximo: int | None
    porcentaje: float | None
    umbral: int | None
    puntos_faltantes: int | None
    motivos: list[str]


def evaluate_eligibility(
    session: Session, user_id: int, manifest: Manifest | None, settings: Settings
) -> Eligibility:
    completed = sorted(
        session.exec(
            select(ProgressModulo.modulo).where(
                ProgressModulo.user_id == user_id, col(ProgressModulo.completado).is_(True)
            )
        ).all()
    )
    completed = [n for n in completed if 1 <= n <= MODULE_COUNT]
    pending = [n for n in range(1, MODULE_COUNT + 1) if n not in completed]
    motivos: list[str] = []
    if pending:
        motivos.append(
            f"Falta completar el módulo {pending[0]}."
            if len(pending) == 1
            else f"Faltan por completar los módulos {_spanish_list(pending)}."
        )

    total = compute_total_score(session, user_id)
    obtained = maximum = pct = threshold = missing_points = None
    if manifest is not None:
        threshold = settings.cert_min_porcentaje
        maximum = manifest.max_required_score()
        obtained = required_score(session, user_id, manifest)
        pct = percentage(obtained, maximum)
        # Aritmética entera: sin errores de redondeo en el borde del umbral.
        needed = math.ceil(threshold * maximum / 100)
        missing_points = max(0, needed - obtained)
        if missing_points > 0:
            motivos.append(
                f"Tu puntaje en las actividades obligatorias es {_format_pct(pct or 0.0)} % "
                f"y se necesita al menos {threshold} %: te faltan {missing_points} puntos."
            )
    return Eligibility(
        elegible=not motivos,
        modulos_completados=completed,
        modulos_pendientes=pending,
        puntaje_total=total,
        puntaje_obligatorias=obtained,
        puntaje_maximo=maximum,
        porcentaje=pct,
        umbral=threshold,
        puntos_faltantes=missing_points,
        motivos=motivos,
    )


def summarize(certificate: Certificate) -> CertificateSummary:
    return CertificateSummary(
        codigo=certificate.codigo,
        emitido_en=certificate.created_at,
        puntaje_total=certificate.puntaje_total,
        puntaje_obligatorias=certificate.puntaje_obligatorias,
        puntaje_maximo=certificate.puntaje_maximo,
        porcentaje=percentage(certificate.puntaje_obligatorias, certificate.puntaje_maximo),
    )


def get_certificate(session: Session, user_id: int) -> Certificate | None:
    return session.exec(select(Certificate).where(Certificate.user_id == user_id)).first()


def find_by_code(session: Session, raw_code: str) -> Certificate | None:
    """Certificado por código de verificación (público). `None` si no existe o el formato falla."""
    code = normalize_code(raw_code)
    if code is None:
        return None
    return session.exec(select(Certificate).where(Certificate.codigo == code)).first()


def build_status(
    session: Session, user_id: int, manifest: Manifest | None, settings: Settings
) -> CertificateStatus:
    eligibility = evaluate_eligibility(session, user_id, manifest, settings)
    existing = get_certificate(session, user_id)
    return CertificateStatus(
        elegible=eligibility.elegible,
        emitido=existing is not None,
        modulos_completados=eligibility.modulos_completados,
        modulos_pendientes=eligibility.modulos_pendientes,
        puntaje_total=eligibility.puntaje_total,
        puntaje_obligatorias=eligibility.puntaje_obligatorias,
        puntaje_maximo=eligibility.puntaje_maximo,
        porcentaje=eligibility.porcentaje,
        umbral=eligibility.umbral,
        puntos_faltantes=eligibility.puntos_faltantes,
        motivos=eligibility.motivos,
        certificado=summarize(existing) if existing else None,
    )


def issue_certificate(
    session: Session, user: User, manifest: Manifest | None, settings: Settings
) -> tuple[Certificate, bool]:
    """Emite el certificado del usuario. Devuelve `(certificado, nuevo)`.

    Idempotente: si ya tiene uno lo devuelve (aunque hoy ya no fuera elegible: un certificado
    emitido no se revoca). Si no es elegible, 409 `certificado_no_elegible` con los motivos.
    """
    assert user.id is not None
    existing = get_certificate(session, user.id)
    if existing is not None:
        return existing, False

    eligibility = evaluate_eligibility(session, user.id, manifest, settings)
    if not eligibility.elegible:
        raise certificate_not_eligible(eligibility.motivos)

    insert = dialect_insert(session)
    for _ in range(_MAX_CODE_ATTEMPTS):
        statement = (
            insert(Certificate)
            .values(
                user_id=user.id,
                codigo=generate_code(),
                nombre=user.nombre,
                apellido=user.apellido,
                tipo_identificacion=user.tipo_identificacion,
                numero_identificacion=user.numero_identificacion,
                puntaje_total=eligibility.puntaje_total,
                puntaje_obligatorias=eligibility.puntaje_obligatorias,
                puntaje_maximo=eligibility.puntaje_maximo,
                created_at=utcnow(),
            )
            # Sin `index_elements`: cubre el choque de `user_id` (otra petición se adelantó) y el
            # de `codigo` (colisión improbable); abajo se distingue cuál fue.
            .on_conflict_do_nothing()
            .returning(col(Certificate.id))
        )
        inserted = session.exec(statement).first()
        new_id = inserted[0] if inserted is not None else None
        session.commit()
        if new_id is not None:
            certificate = session.exec(
                select(Certificate)
                .where(Certificate.id == new_id)
                .execution_options(populate_existing=True)
            ).one()
            return certificate, True
        winner = get_certificate(session, user.id)
        if winner is not None:  # una petición simultánea lo emitió primero
            return winner, False
    raise RuntimeError("No se pudo generar un código de verificación único.")
