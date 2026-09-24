"""Limitador de peticiones en memoria por ventana deslizante.

LIMITACIÓN: el estado vive en la memoria de UN proceso. Con varios workers (`uvicorn
--workers N`, gunicorn) cada proceso lleva su propia cuenta y el límite efectivo por IP es
hasta N veces mayor; tampoco sobrevive a un reinicio. Es suficiente para la etapa piloto con un
solo worker. Antes de escalar a varios procesos, mover el conteo a Redis o aplicar el límite en
el proxy (p. ej. `limit_req` de nginx).
"""

import math
import threading
import time
from collections import deque
from collections.abc import Callable

from fastapi import Request

from app.core.errors import too_many_attempts

_SWEEP_EVERY_HITS = 512


class SlidingWindowLimiter:
    """Permite como máximo `max_events` eventos por clave dentro de `window_seconds`."""

    def __init__(
        self,
        max_events: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if max_events < 1 or window_seconds <= 0:
            raise ValueError("max_events debe ser >= 1 y window_seconds > 0")
        self.max_events = max_events
        self.window_seconds = window_seconds
        self._clock = clock
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._hits = 0

    def hit(self, key: str) -> float | None:
        """Registra un intento de `key`.

        Devuelve `None` si se permite, o los segundos que faltan para que se libere un cupo
        si se excede el límite. Los intentos rechazados no se registran: quien insiste no
        alarga su propio bloqueo.
        """
        with self._lock:
            now = self._clock()
            self._hits += 1
            if self._hits % _SWEEP_EVERY_HITS == 0:
                self._sweep(now)
            events = self._events.setdefault(key, deque())
            self._drop_expired(events, now)
            if len(events) >= self.max_events:
                return max(0.0, events[0] + self.window_seconds - now)
            events.append(now)
            return None

    def reset(self) -> None:
        """Olvida todos los intentos (útil en pruebas)."""
        with self._lock:
            self._events.clear()

    def _drop_expired(self, events: deque[float], now: float) -> None:
        cutoff = now - self.window_seconds
        while events and events[0] <= cutoff:
            events.popleft()

    def _sweep(self, now: float) -> None:
        """Elimina las claves sin eventos vigentes para que la memoria no crezca sin límite."""
        for key in list(self._events):
            events = self._events[key]
            self._drop_expired(events, now)
            if not events:
                del self._events[key]


def client_ip(request: Request, trust_proxy: bool) -> str:
    """IP del cliente para el límite.

    Con `trust_proxy` se usa el PRIMER valor de `X-Forwarded-For`. Solo es seguro si el proxy
    inverso SOBRESCRIBE la cabecera (`proxy_set_header X-Forwarded-For $remote_addr;` en nginx):
    con `$proxy_add_x_forwarded_for` el cliente podría anteponer valores falsos y esquivar el
    límite. Sin `trust_proxy` la cabecera se ignora por completo.
    """
    if trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "desconocida"


def enforce_limit(limiter: SlidingWindowLimiter, key: str) -> None:
    """Registra un intento y lanza 429 `demasiados_intentos` si se excede el límite."""
    retry_after = limiter.hit(key)
    if retry_after is not None:
        raise too_many_attempts(math.ceil(retry_after))


def rate_limit_auth(request: Request) -> None:
    """Dependencia de `register` y `login`: 10 intentos por minuto y por IP (cubo compartido)."""
    settings = request.app.state.settings
    enforce_limit(request.app.state.auth_limiter, client_ip(request, settings.trust_proxy))
