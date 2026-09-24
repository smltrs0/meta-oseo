"""Configuración de la API (pydantic-settings).

Lee variables de entorno y, si existe, el `.env` de la raíz del repositorio (la ruta se
calcula respecto a `services/api`, así funciona desde cualquier directorio de trabajo).
Las variables de entorno tienen prioridad sobre el `.env`. Ver `.env.example`.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, Request
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# services/api (raíz del proyecto uv) y raíz del monorepo.
API_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = API_DIR.parents[1]

# Valor por defecto de SECRET_KEY: solo sirve en desarrollo. Mide más de 32 bytes para que
# PyJWT no avise de clave HMAC corta (RFC 7518 §3.2).
DEFAULT_SECRET_KEY = "cambiar-en-produccion-clave-solo-para-desarrollo"
# Valores de ejemplo conocidos que nunca deben usarse en producción.
INSECURE_SECRET_KEYS = frozenset({DEFAULT_SECRET_KEY, "cambiar-en-produccion"})
MIN_PROD_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",  # el .env compartido trae variables de docker-compose, etc.
    )

    env: Literal["dev", "prod"] = "dev"
    secret_key: str = Field(default=DEFAULT_SECRET_KEY, repr=False)
    access_token_expire_minutes: int = Field(default=10080, gt=0)  # 7 días

    # SQLite en desarrollo, PostgreSQL (psycopg) en producción. Una ruta SQLite relativa
    # se resuelve respecto a `services/api`, no al directorio de trabajo.
    database_url: str = "sqlite:///./data/ova.db"

    # Orígenes CORS separados por coma (o una lista JSON).
    allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    # Detrás de un proxy inverso, tomar la IP del cliente de X-Forwarded-For. Activar solo si
    # el proxy SOBRESCRIBE esa cabecera (ver app/core/rate_limit.py).
    trust_proxy: bool = False

    # Mentor de IA (F1-07). Sin clave, /api/chat responde 503 `ia_no_configurada`.
    anthropic_api_key: str = Field(default="", repr=False)
    anthropic_model: str = "claude-opus-5"
    mentor_effort: Literal["low", "medium", "high", "xhigh", "max"] = "medium"
    mentor_max_tokens: int = Field(default=16000, gt=0)

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, value: str) -> str:
        """`postgresql://` y `postgres://` usarían psycopg2 (no instalado): forzar psycopg 3."""
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix) :]
        return value

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            text = value.strip()
            items = json.loads(text) if text.startswith("[") else text.split(",")
            return [str(item).strip().rstrip("/") for item in items if str(item).strip()]
        return value

    @model_validator(mode="after")
    def _guard_production_secret(self) -> "Settings":
        if self.env == "prod":
            if self.secret_key in INSECURE_SECRET_KEYS:
                raise ValueError(
                    "SECRET_KEY tiene el valor por defecto: define una clave propia "
                    "para ENV=prod (por ejemplo: python -c 'import secrets; "
                    "print(secrets.token_urlsafe(48))')."
                )
            if len(self.secret_key) < MIN_PROD_SECRET_LENGTH:
                raise ValueError(
                    f"SECRET_KEY debe tener al menos {MIN_PROD_SECRET_LENGTH} caracteres "
                    "cuando ENV=prod."
                )
        return self

    @property
    def is_prod(self) -> bool:
        return self.env == "prod"

    @property
    def anthropic_configured(self) -> bool:
        return bool(self.anthropic_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    """Configuración del proceso (se lee una sola vez)."""
    return Settings()


def get_request_settings(request: Request) -> Settings:
    """Dependencia FastAPI: la configuración de la app que atiende la petición."""
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_request_settings)]
