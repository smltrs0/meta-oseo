"""Certificado de finalización y verificación pública (docs/api-contract.md, F5-05)."""

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import Response as RawResponse

from app.core.db import SessionDep
from app.core.errors import (
    ErrorResponse,
    certificate_not_found,
    certificate_not_issued,
)
from app.core.rate_limit import client_ip, enforce_limit
from app.core.security import CurrentUser
from app.core.settings import SettingsDep
from app.schemas.certificate import CertificateIssued, CertificateStatus, CertificateVerification
from app.services import certificate as certificate_service
from app.services.certificate_pdf import render_certificate_pdf
from app.services.manifest import ManifestDep

router = APIRouter(prefix="/api", tags=["certificado"])

_UNAUTHORIZED = {401: {"model": ErrorResponse, "description": "`token_invalido`"}}


@router.get(
    "/certificate/status",
    response_model=CertificateStatus,
    responses=_UNAUTHORIZED,
    summary="Elegibilidad para el certificado y qué falta",
)
def certificate_status(
    user: CurrentUser, session: SessionDep, manifest: ManifestDep, settings: SettingsDep
) -> CertificateStatus:
    assert user.id is not None
    return certificate_service.build_status(session, user.id, manifest, settings)


@router.post(
    "/certificate",
    response_model=CertificateIssued,
    responses={
        **_UNAUTHORIZED,
        201: {"description": "Certificado emitido ahora."},
        409: {"model": ErrorResponse, "description": "`certificado_no_elegible`"},
    },
    summary="Emitir el certificado (idempotente: un certificado por usuario)",
)
def issue_certificate(
    response: Response,
    user: CurrentUser,
    session: SessionDep,
    manifest: ManifestDep,
    settings: SettingsDep,
) -> CertificateIssued:
    certificate, created = certificate_service.issue_certificate(session, user, manifest, settings)
    # 201 al crearlo; 200 si ya existía (la llamada repetida no cambia nada).
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return CertificateIssued(certificado=certificate_service.summarize(certificate), nuevo=created)


@router.get(
    "/certificate/pdf",
    response_class=RawResponse,
    responses={
        **_UNAUTHORIZED,
        200: {"content": {"application/pdf": {}}, "description": "PDF del certificado."},
        404: {"model": ErrorResponse, "description": "`certificado_no_emitido`"},
        429: {"model": ErrorResponse, "description": "`demasiados_intentos`"},
    },
    summary="Descargar el PDF del certificado propio",
)
def download_certificate_pdf(
    request: Request, user: CurrentUser, session: SessionDep, settings: SettingsDep
) -> RawResponse:
    assert user.id is not None
    # La generación cuesta CPU: se limita por usuario antes de hacer el trabajo.
    enforce_limit(request.app.state.pdf_limiter, f"user:{user.id}")
    certificate = certificate_service.get_certificate(session, user.id)
    if certificate is None:
        raise certificate_not_issued()
    pdf = render_certificate_pdf(certificate, settings.public_base_url)
    return RawResponse(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="certificado_{certificate.codigo}.pdf"',
            "Cache-Control": "private, no-store",
        },
    )


@router.get(
    "/verify/{codigo}",
    response_model=CertificateVerification,
    responses={
        404: {"model": ErrorResponse, "description": "`certificado_no_encontrado`"},
        429: {"model": ErrorResponse, "description": "`demasiados_intentos`"},
    },
    summary="Verificar un certificado por su código (público)",
)
def verify_certificate(
    codigo: str, request: Request, session: SessionDep
) -> CertificateVerification:
    enforce_limit(
        request.app.state.verify_limiter,
        client_ip(request, request.app.state.settings.trust_proxy),
    )
    certificate = certificate_service.find_by_code(session, codigo)
    if certificate is None:
        raise certificate_not_found()
    return CertificateVerification(
        codigo=certificate.codigo,
        nombre=certificate.nombre,
        apellido=certificate.apellido,
        tipo_identificacion=certificate.tipo_identificacion,
        identificacion_enmascarada=certificate_service.mask_identification(
            certificate.numero_identificacion
        ),
        emitido_en=certificate.created_at,
        puntaje_total=certificate.puntaje_total,
        porcentaje=certificate_service.percentage(
            certificate.puntaje_obligatorias, certificate.puntaje_maximo
        ),
    )
