"""Validación del cuerpo de `POST /api/chat` y del `ContextoPedagogico` (F1-07)."""

from typing import Any

import pytest
from pydantic import ValidationError

from app.schemas.chat import MAX_MESSAGE_CHARS, MAX_MESSAGES, ChatRequest
from app.schemas.contexto import ContextoPedagogico


def contexto(**overrides: Any) -> dict[str, Any]:
    """Contexto en camelCase, con la misma forma que `toPayload()` del frontend."""
    base: dict[str, Any] = {
        "modulo": 3,
        "seccion": "mecanotransduccion",
        "actividadActual": {
            "id": "m3_quiz_remodelado",
            "tipo": "quiz",
            "intentos": 2,
            "completada": False,
        },
        "estructuraSeleccionada": "osteocito",
        "moleculaSeleccionada": "esclerostina",
        "nivel": "posgrado",
        "tiempoEnSeccionSeg": 42,
        "interaccionesRecientes": ["clic:osteocito", "hover:canaliculo"],
        "progreso": {"modulosCompletados": [1, 2], "puntajeTotal": 120, "logros": ["primer_hueso"]},
    }
    return base | overrides


def body(**overrides: Any) -> dict[str, Any]:
    return {"messages": [{"role": "user", "content": "Hola"}]} | overrides


# --- ContextoPedagogico --------------------------------------------------------------------------


def test_contexto_valido_en_camel_case():
    parsed = ContextoPedagogico.model_validate(contexto())
    assert parsed.modulo == 3
    assert parsed.actividad_actual is not None
    assert parsed.actividad_actual.tipo == "quiz"
    assert parsed.tiempo_en_seccion_seg == 42
    assert parsed.progreso.modulos_completados == [1, 2]
    assert parsed.nivel == "posgrado"


def test_contexto_minimo_sin_campos_opcionales():
    minimal = contexto()
    for key in ("actividadActual", "estructuraSeleccionada", "moleculaSeleccionada"):
        del minimal[key]
    parsed = ContextoPedagogico.model_validate(minimal)
    assert parsed.actividad_actual is None
    assert parsed.estructura_seleccionada is None


def test_contexto_acepta_nombres_snake_case_por_populate_by_name():
    parsed = ContextoPedagogico.model_validate(
        {
            "modulo": 1,
            "seccion": "inicio",
            "nivel": "pregrado",
            "tiempo_en_seccion_seg": 0,
            "interacciones_recientes": [],
            "progreso": {"modulos_completados": [], "puntaje_total": 0, "logros": []},
        }
    )
    assert parsed.tiempo_en_seccion_seg == 0


def test_contexto_ignora_claves_desconocidas():
    assert ContextoPedagogico.model_validate(contexto(extra="x")).modulo == 3


@pytest.mark.parametrize("modulo", [0, 7, -1, "uno", None])
def test_contexto_modulo_fuera_de_1_a_6(modulo):
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(contexto(modulo=modulo))


@pytest.mark.parametrize("modulo", [1, 6])
def test_contexto_modulo_en_los_bordes(modulo):
    assert ContextoPedagogico.model_validate(contexto(modulo=modulo)).modulo == modulo


def test_contexto_seccion_de_64_caracteres_si_65_no():
    assert ContextoPedagogico.model_validate(contexto(seccion="a" * 64))
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(contexto(seccion="a" * 65))


def test_contexto_los_64_caracteres_se_cuentan_por_caracter_no_por_byte():
    assert ContextoPedagogico.model_validate(contexto(seccion="é" * 64))


@pytest.mark.parametrize("campo", ["estructuraSeleccionada", "moleculaSeleccionada"])
def test_contexto_estructura_y_molecula_max_64(campo):
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(contexto(**{campo: "x" * 65}))


def test_contexto_interacciones_max_10_y_cada_una_max_64():
    assert ContextoPedagogico.model_validate(
        contexto(interaccionesRecientes=[f"e{i}" for i in range(10)])
    )
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(
            contexto(interaccionesRecientes=[f"e{i}" for i in range(11)])
        )
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(contexto(interaccionesRecientes=["x" * 65]))


@pytest.mark.parametrize("nivel", ["grado", "", "PREGRADO", None])
def test_contexto_nivel_invalido(nivel):
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(contexto(nivel=nivel))


def test_contexto_tipo_de_actividad_invalido():
    actividad = contexto()["actividadActual"] | {"tipo": "crucigrama"}
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(contexto(actividadActual=actividad))


@pytest.mark.parametrize(
    "tipo",
    [
        "multicapa",
        "arrastre-molecular",
        "relacion-columnas",
        "quiz",
        "video-texto",
        "exploracion-3d",
    ],
)
def test_contexto_acepta_los_seis_tipos_de_actividad(tipo):
    actividad = contexto()["actividadActual"] | {"tipo": tipo}
    assert ContextoPedagogico.model_validate(contexto(actividadActual=actividad))


def test_contexto_actividad_id_max_64():
    actividad = contexto()["actividadActual"] | {"id": "a" * 65}
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(contexto(actividadActual=actividad))


@pytest.mark.parametrize("campo,valor", [("intentos", -1), ("completada", "quizás")])
def test_contexto_actividad_campos_invalidos(campo, valor):
    actividad = contexto()["actividadActual"] | {campo: valor}
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(contexto(actividadActual=actividad))


def test_contexto_tiempo_negativo_invalido():
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(contexto(tiempoEnSeccionSeg=-1))


@pytest.mark.parametrize(
    "progreso",
    [
        {"modulosCompletados": [0], "puntajeTotal": 0, "logros": []},
        {"modulosCompletados": [7], "puntajeTotal": 0, "logros": []},
        {"modulosCompletados": [1, 2, 3, 4, 5, 6, 1], "puntajeTotal": 0, "logros": []},
        {"modulosCompletados": [], "puntajeTotal": -5, "logros": []},
        {"modulosCompletados": [], "puntajeTotal": 0, "logros": ["x" * 65]},
        {"modulosCompletados": [], "puntajeTotal": 0},
    ],
)
def test_contexto_progreso_invalido(progreso):
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(contexto(progreso=progreso))


@pytest.mark.parametrize(
    "faltante", ["modulo", "seccion", "nivel", "tiempoEnSeccionSeg", "progreso"]
)
def test_contexto_campos_obligatorios(faltante):
    incompleto = contexto()
    del incompleto[faltante]
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(incompleto)


def test_contexto_rechaza_caracteres_que_la_base_no_guarda():
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(contexto(seccion="a\x00b"))
    with pytest.raises(ValidationError):
        ContextoPedagogico.model_validate(contexto(interaccionesRecientes=["\ud800"]))


# --- ChatRequest ---------------------------------------------------------------------------------


def test_chat_valido_sin_contexto():
    parsed = ChatRequest.model_validate(body())
    assert parsed.contexto is None
    assert [m.role for m in parsed.messages] == ["user"]


def test_chat_valido_con_contexto():
    parsed = ChatRequest.model_validate(body(contexto=contexto()))
    assert parsed.contexto is not None
    assert parsed.contexto.modulo == 3


def test_chat_con_contexto_invalido():
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(body(contexto=contexto(modulo=9)))


def test_chat_el_ultimo_mensaje_debe_ser_del_usuario():
    messages = [
        {"role": "user", "content": "Hola"},
        {"role": "assistant", "content": "Hola, ¿en qué te ayudo?"},
    ]
    with pytest.raises(ValidationError, match="último mensaje"):
        ChatRequest.model_validate({"messages": messages})


def test_chat_el_error_del_ultimo_mensaje_apunta_al_campo_messages():
    with pytest.raises(ValidationError) as info:
        ChatRequest.model_validate({"messages": [{"role": "assistant", "content": "x"}]})
    assert info.value.errors()[0]["loc"] == ("messages",)


def test_chat_de_1_a_40_mensajes():
    def many(count: int) -> dict[str, Any]:
        roles = ["user" if (count - i) % 2 == 1 else "assistant" for i in range(count)]
        return {"messages": [{"role": role, "content": "x"} for role in roles]}

    assert ChatRequest.model_validate(many(1))
    assert len(ChatRequest.model_validate(many(MAX_MESSAGES)).messages) == 40
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(many(MAX_MESSAGES + 1))
    with pytest.raises(ValidationError):
        ChatRequest.model_validate({"messages": []})


def test_chat_sin_messages():
    with pytest.raises(ValidationError):
        ChatRequest.model_validate({})


def test_chat_contenido_de_1_a_8000_caracteres():
    assert ChatRequest.model_validate(body(messages=[{"role": "user", "content": "x"}]))
    assert ChatRequest.model_validate(
        body(messages=[{"role": "user", "content": "x" * MAX_MESSAGE_CHARS}])
    )
    for content in ("", "x" * (MAX_MESSAGE_CHARS + 1)):
        with pytest.raises(ValidationError):
            ChatRequest.model_validate(body(messages=[{"role": "user", "content": content}]))


@pytest.mark.parametrize("content", ["   ", "\n\t \n"])
def test_chat_rechaza_mensajes_solo_de_espacios(content):
    # Anthropic los rechazaría con un 400: se corta antes con un 422.
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(body(messages=[{"role": "user", "content": content}]))


@pytest.mark.parametrize("content", ["a\x00b", "\ud800"])
def test_chat_rechaza_nul_y_sustitutos_unicode_sueltos(content):
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(body(messages=[{"role": "user", "content": content}]))


def test_chat_conserva_el_contenido_tal_cual():
    parsed = ChatRequest.model_validate(
        body(messages=[{"role": "user", "content": "  ¿Qué es la RANKL?\n"}])
    )
    assert parsed.messages[0].content == "  ¿Qué es la RANKL?\n"


@pytest.mark.parametrize("role", ["system", "tool", "", "User", None])
def test_chat_rol_invalido(role):
    with pytest.raises(ValidationError):
        ChatRequest.model_validate({"messages": [{"role": role, "content": "hola"}]})
