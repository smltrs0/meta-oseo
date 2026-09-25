"""Mentor de IA: `POST /api/chat` con respuesta en streaming SSE (docs/api-contract.md, F1-07)."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import StreamingResponse

from app.ai import sse
from app.ai.client import build_request, get_client
from app.ai.errors import ia_not_configured
from app.ai.mentor import MentorChat, stream_chat
from app.core.db import SessionDep
from app.core.errors import ErrorResponse
from app.core.rate_limit import enforce_limit
from app.core.security import CurrentUser
from app.core.settings import SettingsDep
from app.schemas.chat import ChatRequest


@asynccontextmanager
async def _mentor_lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Al apagar la API, cierra el cliente de Anthropic (y su pool de conexiones) si se creó."""
    try:
        yield
    finally:
        client = getattr(app.state, "anthropic_client", None)
        if client is not None:
            await client.close()


# FastAPI encadena el `lifespan` de un router incluido con el de la app.
router = APIRouter(prefix="/api", tags=["mentor"], lifespan=_mentor_lifespan)

_SSE_RESPONSE = {
    200: {
        "description": (
            "Stream SSE. Eventos `text`, `usage` y un único evento terminal `done` o `error` "
            "(ver docs/api-contract.md)."
        ),
        "content": {"text/event-stream": {"schema": {"type": "string"}}},
    },
    401: {"model": ErrorResponse, "description": "`token_invalido`"},
    429: {"model": ErrorResponse, "description": "`demasiados_intentos`"},
    503: {"model": ErrorResponse, "description": "`ia_no_configurada`"},
}


@router.post(
    "/chat",
    response_class=StreamingResponse,
    responses=_SSE_RESPONSE,
    summary="Conversar con el mentor de IA (streaming SSE)",
)
async def chat(
    body: ChatRequest,
    request: Request,
    user: CurrentUser,
    session: SessionDep,
    settings: SettingsDep,
) -> StreamingResponse:
    assert user.id is not None
    user_id = user.id

    # Estas dos comprobaciones van ANTES de abrir el stream: así son un 503/429 normales.
    if not settings.anthropic_configured:
        raise ia_not_configured()
    enforce_limit(request.app.state.chat_limiter, f"user:{user_id}")

    client = get_client(request)
    chat_run = MentorChat(
        client=client,
        request=build_request(settings, body.messages),
        engine=request.app.state.engine,
        user_id=user_id,
    )

    # `get_current_user` dejó una transacción abierta en `session`. Sin esto, una conexión del
    # pool quedaría ocupada (idle in transaction en PostgreSQL) durante todo el stream.
    await asyncio.to_thread(session.close)

    return StreamingResponse(
        stream_chat(chat_run, ping_interval=sse.PING_INTERVAL_SECONDS),
        media_type=sse.SSE_MEDIA_TYPE,
        headers=sse.SSE_HEADERS,
    )
