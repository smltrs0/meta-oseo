from fastapi import APIRouter

from app import __version__
from app.core.settings import SettingsDep
from app.schemas.health import HealthResponse

router = APIRouter(prefix="/api", tags=["salud"])


@router.get("/health", response_model=HealthResponse, summary="Estado del servicio")
def health(settings: SettingsDep) -> HealthResponse:
    """Comprobación de vida. Sin autenticación."""
    return HealthResponse(env=settings.env, version=__version__)
