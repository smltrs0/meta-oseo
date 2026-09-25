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
| 404 | `certificado_no_emitido` | `GET /api/certificate/pdf` sin haber emitido el certificado |
| 404 | `certificado_no_encontrado` | `GET /api/verify/{codigo}` con un código inexistente o mal formado (público, sin más datos) |
| 409 | `modulo_incompleto` | `PUT /api/progress/{modulo}` con `completado: true` y actividades obligatorias sin completar (solo con manifiesto). Trae `faltantes`: lista de ids |
| 409 | `certificado_no_elegible` | `POST /api/certificate` sin cumplir los requisitos. Trae `motivos`: lista de textos |
| 422 | `actividad_desconocida` | `POST /api/activities/{id}/result` con un id que no existe o cuyo `modulo` o `tipo` no coinciden con el contenido (solo con manifiesto) |
| 422 | `puntaje_invalido` | Resultado con `puntaje` mayor que el `puntaje_max` de la actividad (solo con manifiesto). Trae `puntaje_max` |
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

**Validación contra el contenido** (solo si la API tiene el manifiesto de actividades, ver "Validación
contra el contenido" más abajo): `completado: true` sobre un módulo que aún no estaba completado exige
un resultado con `completada = true` en TODAS las actividades **obligatorias** del módulo. Si falta
alguna → `409 modulo_incompleto` con `{"detail": {"code": "modulo_incompleto", "message": "...",
"faltantes": ["m1_quiz_repaso"]}}` y **no se aplica ningún cambio** de la petición (tampoco el tiempo). Un
módulo ya completado no se vuelve a comprobar. Un módulo que el manifiesto no contiene también da
`modulo_incompleto` (con `faltantes: []`). Sin manifiesto, el comportamiento es el de arriba.

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
no permite acumular puntos. El puntaje lo reporta el cliente: sin manifiesto de actividades nada lo
verifica (Fase 1); con manifiesto se valida como se explica abajo.

**Con manifiesto** (validación contra el contenido, antes de guardar nada):
- `422 actividad_desconocida` si `{activity_id}` no existe en el contenido o si `modulo` o `tipo`
  del cuerpo no coinciden con los de esa actividad.
- `422 puntaje_invalido` (con `puntaje_max` en el `detail`) si `puntaje` supera el `puntaje_max` de la
  actividad. Un `puntaje` fuera de 0..1000 sigue dando el 422 estándar de validación (`detail` es lista).
- Un intento rechazado no deja fila ni puntúa.

`GET /api/activities/results` (auth) — origen de `EstadoPrevioActividad.servidor` en la SPA.
`?modulo=1..6` opcional filtra por módulo (fuera de rango → `422` estándar). → `200`:
```json
{ "resultados": [
    { "activity_id": "m1_capas_hueso", "modulo": 1, "tipo": "multicapa",
      "mejor_puntaje": 27, "intentos": 2, "completada": true,
      "ultimo_intento_en": "2026-09-23T20:10:00Z" } ] }
```
Una fila por `activity_id` con resultados **del usuario autenticado** (nunca de otros), ordenadas por
`modulo` y `activity_id`. `mejor_puntaje` es el mayor `puntaje` entre los intentos con
`completada = true` (0 si ninguno); `intentos`, el mayor reportado; `completada`, si algún intento
lo está; `ultimo_intento_en`, el instante del último intento; `modulo` y `tipo`, los del último
intento. Sin `detalle`. Sin resultados → `{"resultados": []}`. La suma de `mejor_puntaje` es el
`puntaje_total` de `GET /api/progress`.

### Validación contra el contenido (manifiesto de actividades)

El servidor conoce las actividades del OVA por un **manifiesto** generado a partir de los
`apps/web/src/modules/m{n}_{slug}/content.json`:

```bash
cd services/api
uv run python -m app.scripts.build_manifest              # escribe app/data/actividades_manifest.json
uv run python -m app.scripts.build_manifest --comprobar  # CI: falla si el archivo no está al día
```

El manifiesto (`{"version": 1, "actividades": {id: {modulo, tipo, puntaje_max, obligatoria, seccion}},
"modulos": {...totales por módulo}, "totales": {...}}`) se **versiona** y viaja en la imagen de la API;
hay que regenerarlo cuando cambie una actividad (id, tipo, `puntaje_max`, `obligatoria`) o su módulo.
La API lo carga al arrancar desde `ACTIVITIES_MANIFEST_PATH` (por defecto
`services/api/app/data/actividades_manifest.json`):

| Situación | Comportamiento |
|---|---|
| Existe el archivo por defecto | Se valida contra el contenido (resultados, progreso y certificado) |
| No existe el archivo por defecto | Sin validación: comportamiento de Fase 1 (desarrollo, antes de que haya contenido) |
| `ACTIVITIES_MANIFEST_PATH=` (vacía) | Sin validación |
| Ruta explícita que no existe, o archivo inválido | La API **no arranca** (un error de configuración no debe dejar la validación apagada en silencio) |

Un manifiesto parcial (faltan módulos) es válido pero rechaza las actividades de los módulos ausentes y
no deja completarlos; el script avisa de ello.

### Logros (F1-06)

`GET /api/achievements` →
```json
{ "logros": [ { "codigo": "primer_hueso", "nombre": "Primer hueso", "descripcion": "Completaste el módulo 1", "obtenido": true, "obtenido_en": "2026-09-23T20:00:00Z" } ] }
```
Catálogo de Fase 1 (se siembra de forma idempotente): `primer_hueso` (módulo 1), `celula_por_celula` (2),
`constructor` (3), `mineralizador` (4), `remodelador` (5), `cronista` (6). Completar el módulo N otorga
el logro N. Los logros transversales llegan en F5-04.

### Certificado (F5-05)

Requisito del briefing: reconocimiento final al completar el recorrido. Un certificado por usuario, con
código de verificación público y PDF descargable.

**Elegibilidad.** Los 6 módulos están completados (`ProgressModulo.completado`) y, **solo si hay
manifiesto**, el puntaje del usuario en las actividades **obligatorias** alcanza `CERT_MIN_PORCENTAJE`
(70 por defecto) % del máximo de esas actividades. Solo cuentan las obligatorias, cada una con su mejor
intento completado y como mucho su `puntaje_max`: el porcentaje no pasa de 100 y una actividad opcional
no compensa una obligatoria mal resuelta. El porcentaje se muestra truncado a un decimal (69,7 no
se redondea a 70). Sin manifiesto solo se exige completar los 6 módulos.

`GET /api/certificate/status` (auth) → `200`:
```json
{ "elegible": false, "emitido": false,
  "modulos_completados": [1, 2, 3], "modulos_pendientes": [4, 5, 6],
  "puntaje_total": 210, "puntaje_obligatorias": 190, "puntaje_maximo": 480,
  "porcentaje": 39.5, "umbral": 70, "puntos_faltantes": 146,
  "motivos": ["Faltan por completar los módulos 4, 5 y 6.",
              "Tu puntaje en las actividades obligatorias es 39,5 % y se necesita al menos 70 %: te faltan 146 puntos."],
  "certificado": null }
```
`puntaje_obligatorias`, `puntaje_maximo`, `porcentaje`, `umbral` y `puntos_faltantes` son `null` sin
manifiesto. `puntaje_total` es el del HUD (todas las actividades). Con certificado emitido, `certificado`
trae el resumen (`codigo`, `emitido_en`, `puntaje_total`, `puntaje_obligatorias`, `puntaje_maximo`,
`porcentaje`).

`POST /api/certificate` (auth, sin cuerpo). **Idempotente:** `201 {"certificado": {...}, "nuevo": true}`
al emitirlo; `200 {..., "nuevo": false}` con el mismo certificado si ya existía (un certificado emitido
no se revoca aunque luego cambie el contenido). Sin cumplir los requisitos → `409 certificado_no_elegible`
con `motivos`. Dos peticiones simultáneas generan un solo certificado (restricción única sobre
`certificates.user_id`). Guarda una instantánea de nombre, apellido, tipo y número de identificación, el
puntaje y la fecha: no cambia si el perfil se edita después.

`GET /api/certificate/pdf` (auth) → `200 application/pdf` con
`Content-Disposition: attachment; filename="certificado_OVA-XXXX-XXXX.pdf"`. Solo el propio; sin
certificado → `404 certificado_no_emitido`. Límite: 10 descargas por minuto y por usuario (`429`). A4
apaisada, con borde, título "Certificado de finalización", nombre completo, nombre del OVA, los seis
módulos, puntaje, fecha (hora de Colombia, UTC-5), código, un QR y la URL de verificación
`{PUBLIC_BASE_URL}/verify/{codigo}`. Se genera con reportlab (Python puro, sin dependencias de sistema) y
fuentes DejaVu incluidas: acentos, ñ y otros alfabetos latinos, griego y cirílico salen bien. El PDF es
idéntico en cada descarga.

`GET /api/verify/{codigo}` (**público**, sin token) → `200`:
```json
{ "valido": true, "codigo": "OVA-7K3M-9QXA", "nombre": "Ana", "apellido": "Pérez",
  "tipo_identificacion": "CC", "identificacion_enmascarada": "*******789",
  "emitido_en": "2026-09-24T15:00:00Z", "puntaje_total": 231, "porcentaje": 79.1 }
```
La identificación va enmascarada: solo se ven los **últimos 3 caracteres**. `porcentaje` es `null` si el
certificado se emitió sin manifiesto. Un código inexistente o mal formado da siempre el mismo
`404 certificado_no_encontrado`, sin más datos. Se toleran minúsculas y espacios alrededor. Límite:
20 consultas por minuto y por IP (aciertos y fallos), pasado el cual `429 demasiados_intentos` con
`Retry-After`.

**Código de verificación:** `OVA-XXXX-XXXX`, 8 caracteres aleatorios (`secrets`) de un alfabeto de 31
sin ambiguos (`2-9` y `A-Z` salvo `I`, `L` y `O`; sin `0` ni `1`).

**La SPA** debe ofrecer una vista pública en `/verify/:codigo` que llame a `GET /api/verify/{codigo}`
(la URL impresa en el PDF y en el QR apunta a ella).

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
Tablas creadas vacías para fases posteriores: `chat_sessions`, `chat_messages`.
Índice único en `users(tipo_identificacion, numero_identificacion)`.

`certificates` (F5-05, migración `a3c81e5d7b02`): una fila por usuario (índice único en `user_id`) con
`codigo` único, la instantánea `nombre`, `apellido`, `tipo_identificacion`, `numero_identificacion`,
`puntaje_total`, `puntaje_obligatorias` y `puntaje_maximo` (estos dos, nulos sin manifiesto) y `created_at`.

## Configuración relacionada

| Variable | Por defecto | Uso |
|---|---|---|
| `ACTIVITIES_MANIFEST_PATH` | `services/api/app/data/actividades_manifest.json` | Manifiesto de actividades (vacía: sin validación; ruta explícita inexistente: error de arranque) |
| `CERT_MIN_PORCENTAJE` | `70` | % mínimo del máximo de las actividades obligatorias (solo con manifiesto), 0 a 100 |
| `PUBLIC_BASE_URL` | `http://localhost:5173` | Origen público del sitio, para la URL de verificación impresa en el PDF |

## Docente (F6-03, solo backend)

Panel de seguimiento de la cohorte. Todas las rutas cuelgan de `/api/teacher` y exigen un usuario con
`rol = "docente"` (se promueve con `uv run python -m app.scripts.promote_docente <tipo> <numero>`).

| HTTP | code | Cuándo |
|---|---|---|
| 401 | `token_invalido` | Sin token, expirado o inválido |
| 403 | `no_autorizado` | El usuario autenticado es estudiante |
| 404 | `estudiante_no_encontrado` | `GET /students/{id}` con un id inexistente o que no es de un estudiante |

**Alcance.** Las cifras cuentan solo a los **estudiantes** (`rol = "estudiante"`); el equipo docente no
entra. **Actividad** de un estudiante = cualquier escritura de progreso, resultado de actividad o
consulta al mentor. Todo se agrega en SQL (sin cargar tablas en memoria) y funciona igual en SQLite y
PostgreSQL. Las ventanas de tiempo y los días se calculan en UTC.

**Privacidad de la identificación.** El número es un dato personal: por defecto se **enmascara** y
solo se ven los **últimos 3 caracteres** (`1023456789` → `*******789`; el tipo no se enmascara).
Se muestra completo únicamente si el docente busca ese número **exacto** en la lista
(`identificacion_completa: true`). El número no se busca por fragmentos, para que no pueda
reconstruirse probando coincidencias parciales. El detalle de un estudiante siempre lo enmascara. El
CSV lo enmascara salvo `?identificacion=completa` (descarga masiva, decisión explícita del docente).

`GET /api/teacher/overview` →
```json
{ "generado_en": "2026-09-24T15:00:00Z", "estudiantes": 5, "activos_7d": 2, "activos_30d": 4,
  "modulos_completados": [ { "modulos_completados": 0, "estudiantes": 2 } ],
  "tiempo_por_modulo": [ { "modulo": 1, "tiempo_promedio_seg": 366.67, "estudiantes": 3 } ],
  "puntaje": { "promedio": 124.0, "mediana": 60.0 } }
```
`modulos_completados` siempre trae 7 elementos (0 a 6 módulos completados). `tiempo_por_modulo`
siempre trae los 6 módulos; el promedio es sobre los estudiantes con fila de progreso en ese módulo
(`null` y `estudiantes: 0` si ninguno). `puntaje` cuenta a todos los estudiantes (0 si no puntuaron) con
la misma regla del total (ver "Actividades y puntaje"); `null` si no hay estudiantes.

`GET /api/teacher/students?page=1&page_size=25&q=&orden=nombre`
- `page` ≥ 1; `page_size` de 1 a 100 (por defecto 25); fuera de rango → `422`.
- `q` (hasta 100 caracteres): cada palabra debe estar en el nombre o el apellido (sin distinguir
  mayúsculas; `%` y `_` se tratan como texto); o bien un número de identificación **exacto** (se
  normaliza igual que en el registro).
- `orden`: `nombre` (ascendente, por defecto), `puntaje` (mayor a menor) o `ultima_actividad` (más
  reciente primero; sin actividad al final).
```json
{ "estudiantes": [ { "id": 2, "nombre": "Ana", "apellido": "Pérez", "tipo_identificacion": "CC",
    "numero_identificacion": "*******789", "identificacion_completa": false, "nivel": "pregrado",
    "modulos_completados": 2, "puntaje_total": 260, "ultima_actividad": "2026-09-24T14:00:00Z",
    "tiempo_total_seg": 1000 } ],
  "page": 1, "page_size": 25, "total": 5, "total_pages": 1 }
```
Una página más allá de la última devuelve `estudiantes: []` con el `total` real.

`GET /api/teacher/students/{id}` → `id`, `nombre`, `apellido`, `tipo_identificacion`,
`numero_identificacion` (enmascarado), `nivel`, `created_at`, `modulos_completados`, `puntaje_total`,
`tiempo_total_seg`, `ultima_actividad` y:
- `progreso`: los 6 módulos (`modulo`, `seccion_actual`, `completado`, `tiempo_total_seg`, `updated_at`).
- `actividades`: una por `activity_id` con `modulo`, `tipo`, `mejor_puntaje` (máximo de todos los
  registros), `puntaje_contabilizado` (mejor entre los completados: el que suma al total), `intentos`
  (máximo reportado), `registros` (filas del historial), `completada` y `ultimo_intento`.
- `mentor`: `consultas`, `tokens_entrada`, `tokens_salida`, `tokens_cache_lectura`,
  `tokens_cache_escritura`, `costo_estimado_usd`, `ultima_consulta`.

`GET /api/teacher/activities/stats?limite=5` → `{ "actividades": [...], "por_modulo": [...],
"mas_dificiles": [...] }`. La unidad de conteo es el par (estudiante, actividad).
- Por actividad: `activity_id`, `modulo`, `tipo`, `estudiantes_intentaron` (con algún registro),
  `estudiantes_completaron`, `tasa_finalizacion` (completaron / intentaron), `intentos_promedio`
  (promedio del máximo `intentos` de cada estudiante) y `puntaje_promedio` (promedio del mejor puntaje
  completado de quienes la completaron; `null` si nadie).
- `por_modulo`: siempre los 6 módulos, con `actividades`, `estudiantes_intentaron`,
  `tasa_finalizacion`, `intentos_promedio` y `puntaje_promedio` (contando pares estudiante-actividad).
- `mas_dificiles`: las `limite` (1 a 50) actividades con menor `tasa_finalizacion` y, a igualdad, más
  `intentos_promedio`.

`GET /api/teacher/mentor/usage?dias=30&limite=10` (`dias` 1 a 365, hoy incluido; `limite` 1 a 50) →
```json
{ "desde": "2026-08-26T00:00:00Z", "hasta": "2026-09-24T15:00:00Z", "dias": 30,
  "precios": { "moneda": "USD", "entrada_usd_por_mtok": 5.0, "salida_usd_por_mtok": 25.0,
               "cache_lectura_factor": 0.1, "cache_escritura_factor": 1.25, "nota": "..." },
  "totales": { "consultas": 4, "usuarios": 3, "tokens_entrada": 7500, "tokens_salida": 3600,
               "tokens_cache_lectura": 10000, "tokens_cache_escritura": 1000,
               "costo_estimado_usd": 0.13875 },
  "por_dia": [ { "fecha": "2026-09-24", "consultas": 1, "tokens_entrada": 1000,
                 "tokens_salida": 500, "costo_estimado_usd": 0.0175 } ],
  "por_dia_modelo": [ { "fecha": "2026-09-24", "modelo": "claude-opus-5", "consultas": 1,
                        "tokens_entrada": 1000, "tokens_salida": 500, "costo_estimado_usd": 0.0175 } ],
  "por_modelo": [ { "modelo": "claude-opus-5", "consultas": 3, "tokens_entrada": 3500,
                    "tokens_salida": 1600, "tokens_cache_lectura": 0, "tokens_cache_escritura": 0,
                    "costo_estimado_usd": 0.0575 } ],
  "top_usuarios": [ { "user_id": 6, "nombre": "Elena", "apellido": "Vega", "consultas": 1,
                      "tokens_entrada": 4000, "tokens_salida": 2000, "costo_estimado_usd": 0.08125 } ] }
```
`por_dia` trae todos los días de la ventana (con ceros); `por_dia_modelo` solo las combinaciones con
consultas. `top_usuarios` va de mayor a menor costo estimado. Aquí cuenta todo `usage_events`
(incluido el uso del propio equipo docente).

**Costo estimado.** `(entrada × PRECIO_ENTRADA + salida × PRECIO_SALIDA + caché leído × PRECIO_ENTRADA × 0,1
+ caché escrito × PRECIO_ENTRADA × 1,25) / 1 000 000`, en USD. Los precios se configuran con las
variables de entorno `PRECIO_ENTRADA_USD_POR_MTOK` y `PRECIO_SALIDA_USD_POR_MTOK`; por defecto 5 y 25,
las tarifas de `claude-opus-5` según la documentación de Anthropic consultada el 2026-09 (**verificarlas**
antes de usarlas para presupuestar). Es una estimación y aplica el mismo precio a todos los modelos
registrados: la factura real la emite Anthropic.

`GET /api/teacher/export/progress.csv[?identificacion=completa]` → `200 text/csv; charset=utf-8` con
`Content-Disposition: attachment; filename="progreso_ova_AAAA-MM-DD.csv"`. UTF-8 **con BOM** (Excel),
fin de línea CRLF, respuesta en streaming. Una fila por estudiante y por módulo (siempre los 6).
Columnas: `id_estudiante, nombre, apellido, tipo_identificacion, numero_identificacion, nivel, modulo,
completado` (`si`/`no`), `seccion_actual, tiempo_total_seg, puntaje_modulo, actividades_completadas,
ultima_actualizacion, puntaje_total` (el total del estudiante, repetido en sus 6 filas).
**Inyección de fórmulas:** toda celda de texto que empiece por `=`, `+`, `-`, `@`, tabulación o retorno
de carro se prefija con `'`, para que Excel y LibreOffice no la ejecuten.
