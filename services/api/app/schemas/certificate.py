from datetime import datetime

from pydantic import BaseModel


class CertificateSummary(BaseModel):
    """Certificado ya emitido (sin datos personales: esos van en el PDF y en la verificación)."""

    codigo: str
    emitido_en: datetime
    puntaje_total: int
    puntaje_obligatorias: int | None
    puntaje_maximo: int | None
    porcentaje: float | None


class CertificateStatus(BaseModel):
    """`GET /api/certificate/status`: elegibilidad y qué falta."""

    elegible: bool
    # `True` si el usuario ya tiene certificado.
    emitido: bool
    modulos_completados: list[int]
    modulos_pendientes: list[int]
    puntaje_total: int
    # Solo con manifiesto (validación contra el contenido); `None` sin él.
    puntaje_obligatorias: int | None
    puntaje_maximo: int | None
    porcentaje: float | None
    # Porcentaje mínimo exigido. `None` si no se exige (sin manifiesto).
    umbral: int | None
    # Puntos que faltan para llegar al umbral; `None` sin manifiesto, 0 si ya se alcanzó.
    puntos_faltantes: int | None
    # Razones (en español) por las que todavía no es elegible; vacío si lo es.
    motivos: list[str]
    certificado: CertificateSummary | None


class CertificateIssued(BaseModel):
    """`POST /api/certificate`: el certificado del usuario (nuevo o el ya emitido)."""

    certificado: CertificateSummary
    # `True` si esta llamada lo creó; `False` si ya existía (idempotente).
    nuevo: bool


class CertificateVerification(BaseModel):
    """`GET /api/verify/{codigo}` (público): lo mínimo para comprobar la autenticidad."""

    valido: bool = True
    codigo: str
    nombre: str
    apellido: str
    tipo_identificacion: str
    # Solo se ven los últimos 3 caracteres del número; el resto va como asteriscos.
    identificacion_enmascarada: str
    emitido_en: datetime
    puntaje_total: int
    porcentaje: float | None
