# Contrato de la API (Fase 1)

Fuente de verdad entre `apps/web` y `services/api` (FastAPI). Cualquier cambio exige actualizar
backend, frontend y este documento a la vez. Ver también PLAN.md §3 (`ContextoPedagogico`).

## Convenciones

- Prefijo `/api`. En desarrollo Vite proxifica `/api` a `http://localhost:8000`; en Docker, nginx
  proxifica al servicio `api`. Siempre mismo origen desde el navegador.
- JSON en `snake_case`. Única excepción: el objeto `contexto` de `/api/chat`, que va en `camelCase`
  porque es el tipo TypeScript de PLAN §3.
- Fechas ISO 8601 en UTC con sufijo `Z`.
- Auth: `Authorization: Bearer <jwt>` (HS256, expira según `ACCESS_TOKEN_EXPIRE_MINUTES`).
- Errores propios: `{"detail": {"code": "<slug>", "message": "<texto en español>"}}`.
  Los 422 de validación de FastAPI conservan su formato por defecto (`detail` es una lista).
- Textos visibles al estudiante, en español.

### Códigos de error

| HTTP | code | Cuándo |
|---|---|---|
| 401 | `token_invalido` | Falta el token, expiró o no verifica |
| 404 | `usuario_no_encontrado` | `login` con una identificación que no existe |
| 409 | `usuario_existente` | `register` con una identificación ya registrada |
| 429 | `demasiados_intentos` | Límite de intentos por IP o por usuario |
| 503 | `ia_no_configurada` | `/api/chat` sin `ANTHROPIC_API_KEY` |

## Identificación

Supuesto a confirmar con el docente: contexto colombiano. La lista vive en **un solo lugar por lado**
(`app/models/enums.py` y `apps/web/src/lib/identificacion.ts`) para cambiarla fácil.

| Código | Etiqueta |
|---|---|
| `CC` | Cédula de ciudadanía |
| `TI` | Tarjeta de identidad |
| `CE` | Cédula de extranjería |
| `PA` | Pasaporte |
| `RC` | Registro civil |
| `PEP` | Permiso especial de permanencia |
| `PPT` | Permiso por protección temporal |

- `numero_identificacion` se normaliza en el servidor: quitar espacios, puntos y guiones, pasar a
  mayúsculas. Debe cumplir `^[A-Z0-9]{4,20}$` tras normalizar. El frontend aplica la misma regla.
- La unicidad es sobre el par `(tipo_identificacion, numero_identificacion)`.
- `nombre` y `apellido`: recortar, colapsar espacios internos, de 1 a 80 caracteres, sin caracteres de
  control. Se permiten acentos, ñ, apóstrofes y guiones. Se guardan tal cual se escribieron.

## Usuario

```json
{
  "id": 1,
  "nombre": "Ana",
  "apellido": "Pérez",
  "tipo_identificacion": "CC",
  "numero_identificacion": "1023456789",
  "nivel": "pregrado",
  "rol": "estudiante",
  "created_at": "2026-09-23T20:00:00Z"
}
```

`nivel`: `pregrado` (por defecto) o `posgrado`. `rol`: `estudiante` (por defecto) o `docente`.
El rol `docente` no se puede autoasignar; se promueve por script de línea de comandos.

## Endpoints

### Salud
`GET /api/health` → `200 {"status": "ok", "env": "dev", "version": "0.1.0"}`. Sin auth.

### Auth (sin contraseña en esta etapa; riesgo aceptado en PLAN §1)

`POST /api/auth/register`
```json
{ "nombre": "Ana", "apellido": "Pérez", "tipo_identificacion": "CC", "numero_identificacion": "1.023.456-789" }
```
→ `201 TokenResponse`. `409 usuario_existente` si el par ya existe.

`POST /api/auth/login`
```json
{ "tipo_identificacion": "CC", "numero_identificacion": "1023456789" }
```
→ `200 TokenResponse`. `404 usuario_no_encontrado` si no existe. La SPA responde a ese 404 pidiendo
nombre y apellido y llamando a `register` (pantalla única, F1-14).

`TokenResponse`:
```json
{ "access_token": "<jwt>", "token_type": "bearer", "expires_in": 604800, "user": { } }
```

Límite: 10 intentos por minuto y por IP entre `register` y `login` (en memoria). Excedido → `429`.

`GET /api/me` → `200 User`.
`PATCH /api/me` con `{"nivel": "posgrado"}` → `200 User`.

### Progreso (F1-06)

`ModuloProgress`:
```json
{ "modulo": 3, "seccion_actual": "mecanotransduccion", "completado": false, "tiempo_total_seg": 320, "updated_at": "2026-09-23T20:00:00Z" }
```
`seccion_actual` y `updated_at` son `null` mientras el módulo no tenga fila (valores por defecto).

`GET /api/progress` →
```json
{ "modulos": [ /* siempre 6 ModuloProgress, modulos 1..6, con valores por defecto si no hay fila */ ],
  "puntaje_total": 120,
  "logros": ["primer_hueso"] }
```

`PUT /api/progress/{modulo}` (`modulo` entre 1 y 6, si no `422`)
```json
{ "seccion_actual": "osteoblastos", "tiempo_delta_seg": 45, "completado": true }
```
Todos los campos son opcionales. `seccion_actual` hasta 64 caracteres. `tiempo_delta_seg` entre 0 y
3600 y se **suma** a `tiempo_total_seg`. `completado` solo pasa de `false` a `true`; enviar `false`
sobre un módulo completado no lo revierte. → `200 {"modulo": ModuloProgress, "logros_nuevos": ["primer_hueso"]}`.
El backend no exige orden entre módulos en Fase 1; el bloqueo por secuencia es del frontend (F2-08).

### Actividades y puntaje (F1-06)

`POST /api/activities/{activity_id}/result`

`activity_id`: `^[a-z0-9_-]{1,64}$`, por ejemplo `m1_capas_hueso`.
```json
{ "modulo": 1,
  "tipo": "multicapa",
  "puntaje": 80,
  "intentos": 2,
  "completada": true,
  "detalle": { } }
```
`tipo` ∈ `multicapa`, `arrastre-molecular`, `relacion-columnas`, `quiz`, `video-texto`, `exploracion-3d`.
`puntaje` 0..1000, `intentos` 1..100, `detalle` opcional (objeto, hasta 4 KB serializado).
→ `200`:
```json
{ "resultado": { "activity_id": "m1_capas_hueso", "modulo": 1, "tipo": "multicapa", "puntaje": 80, "intentos": 2, "completada": true, "created_at": "..." },
  "puntaje_total": 200,
  "logros_nuevos": [] }
```
Cada llamada guarda una fila (historial). **Regla de puntaje:** `puntaje_total` es la suma, por
`activity_id`, del **mejor** `puntaje` entre las filas con `completada = true`. Repetir una actividad
no permite acumular puntos. Limitación conocida: el puntaje lo reporta el cliente; la validación
contra el contenido del módulo llega con F2.

### Logros (F1-06)

`GET /api/achievements` →
```json
{ "logros": [ { "codigo": "primer_hueso", "nombre": "Primer hueso", "descripcion": "Completaste el módulo 1", "obtenido": true, "obtenido_en": "2026-09-23T20:00:00Z" } ] }
```
Catálogo de Fase 1 (se siembra de forma idempotente): `primer_hueso` (módulo 1), `celula_por_celula` (2),
`constructor` (3), `mineralizador` (4), `remodelador` (5), `cronista` (6). Completar el módulo N otorga
el logro N. Los logros transversales llegan en F5-04.

### Mentor de IA (F1-07)

`POST /api/chat` (requiere auth)
```json
{ "messages": [ { "role": "user", "content": "¿Qué hacen los osteoclastos?" } ],
  "contexto": { } }
```
- `messages`: de 1 a 40 elementos, `role` ∈ `user`, `assistant`; el último debe ser `user`; `content` de
  1 a 8000 caracteres.
- `contexto` (opcional): objeto `ContextoPedagogico` en camelCase (abajo). En Fase 1 se **valida y se
  ignora**; su inyección en el prompt es F3-04.
- Límite: 20 peticiones por minuto y por usuario → `429 demasiados_intentos`.
- Sin `ANTHROPIC_API_KEY` → `503 ia_no_configurada` (antes de abrir el stream).

Respuesta: `200 text/event-stream` con `Cache-Control: no-cache` y `X-Accel-Buffering: no`. Cada evento
tiene la forma `event: <nombre>\ndata: <json>\n\n`. Se emite un comentario `: ping` cada 15 s.

| Evento | Payload | Nota |
|---|---|---|
| `text` | `{"delta": "..."}` | Fragmento de texto de la respuesta |
| `usage` | `{"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}` | Una vez, al final |
| `done` | `{"stop_reason": "end_turn"}` | Evento terminal de éxito |
| `error` | `{"code": "refusal", "message": "..."}` | Evento terminal de fallo durante el stream |
| `tool_use` | `{"id": "...", "name": "...", "input": { }}` | Reservado para F3-08, no se emite en F1 |

El stream termina con exactamente un `done` o un `error`. Códigos de `error` en stream: `refusal`,
`max_tokens`, `upstream_error`, `rate_limited`. Cada `usage` se registra también en la tabla
`usage_events` (control de costo desde el primer día).

El cliente usa `fetch` con `ReadableStream` (no `EventSource`, porque no permite POST ni cabeceras) y
cancela con `AbortController`; el backend debe cancelar la petición a Anthropic cuando el cliente
se desconecta.

## `ContextoPedagogico` (congelado en F1-09)

Tipo TypeScript, en `apps/web/src/stores/contextoPedagogico.ts`:

```ts
export type ContextoPedagogico = {
  modulo: 1 | 2 | 3 | 4 | 5 | 6;
  seccion: string;
  actividadActual?: {
    id: string;
    tipo: "multicapa" | "arrastre-molecular" | "relacion-columnas" | "quiz" | "video-texto" | "exploracion-3d";
    intentos: number;
    completada: boolean;
  };
  estructuraSeleccionada?: string;
  moleculaSeleccionada?: string;
  nivel: "pregrado" | "posgrado";
  tiempoEnSeccionSeg: number;
  interaccionesRecientes: string[]; // máximo 10
  progreso: {
    modulosCompletados: number[];
    puntajeTotal: number;
    logros: string[];
  };
};
```

En el backend es un modelo Pydantic con `alias_generator=to_camel` y `populate_by_name=True`, en
`app/schemas/contexto.py`. Las restricciones (`interaccionesRecientes` ≤ 10, `modulo` 1..6, longitudes
de cadena ≤ 64) se validan en ambos lados.

## Modelo de datos (Alembic, F1-04)

Tablas de Fase 1: `users`, `progress_modulos` (único `(user_id, modulo)`), `activity_results`,
`achievements` (catálogo), `user_achievements` (único `(user_id, codigo)`), `usage_events`.
Tablas creadas vacías para fases posteriores: `certificates`, `chat_sessions`, `chat_messages`.
Índice único en `users(tipo_identificacion, numero_identificacion)`.
