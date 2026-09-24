"""Constantes de dominio compartidas entre modelos, esquemas y servicios."""

# Cantidad de módulos temáticos del OVA (docs/api-contract.md: siempre 6, numerados 1..6).
MODULE_COUNT = 6

# Límites de los cuerpos de progreso y actividades (docs/api-contract.md).
MAX_SECTION_LENGTH = 64
MAX_TIME_DELTA_SECONDS = 3600
MAX_ACTIVITY_SCORE = 1000
MAX_ACTIVITY_ATTEMPTS = 100
MAX_ACTIVITY_DETAIL_BYTES = 4 * 1024

# Formato del identificador de actividad, p. ej. `m1_capas_hueso`.
ACTIVITY_ID_PATTERN = r"^[a-z0-9_-]{1,64}$"

# Límite de intentos de acceso (register + login) por IP y ventana.
AUTH_RATE_LIMIT_ATTEMPTS = 10
AUTH_RATE_LIMIT_WINDOW_SECONDS = 60

# Límite del mentor (`POST /api/chat`, F1-07): peticiones por minuto y por usuario.
CHAT_RATE_LIMIT_REQUESTS = 20
CHAT_RATE_LIMIT_WINDOW_SECONDS = 60
