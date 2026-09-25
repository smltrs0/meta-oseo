"""Ayudas de prueba para el manifiesto de actividades y el certificado."""

from pathlib import Path
from typing import Any

from app.services.manifest import Manifest, build_manifest, render_manifest

# Por módulo: dos actividades obligatorias (quiz de 50 y multicapa de 30) y una opcional
# (video de 20). Máximo obligatorio: 80 por módulo, 480 en total; el 70 % son 336.
OBLIGATORIA_QUIZ = ("quiz", 50)
OBLIGATORIA_MULTICAPA = ("multicapa", 30)
OPCIONAL_VIDEO = ("video-texto", 20)
MAX_OBLIGATORIAS_TOTAL = 480
MAX_OBLIGATORIAS_MODULO = 80


def _actividad(numero: int, sufijo: str, tipo: str, puntaje_max: int, obligatoria: bool):
    return {
        "tipo": "actividad",
        "actividad": {
            "id": f"m{numero}_{sufijo}",
            "tipo": tipo,
            "puntaje_max": puntaje_max,
            "obligatoria": obligatoria,
        },
    }


def content_for(numero: int) -> dict[str, Any]:
    """`content.json` mínimo de un módulo (solo lo que lee el generador del manifiesto)."""
    return {
        "numero": numero,
        "slug": f"modulo_{numero}",
        "secciones": [
            {
                "id": "seccion_uno",
                "bloques": [
                    {"tipo": "texto", "id": "t1", "markdown": "texto"},
                    _actividad(numero, "quiz", *OBLIGATORIA_QUIZ, True),
                ],
            },
            {
                "id": "seccion_dos",
                "bloques": [
                    _actividad(numero, "multicapa", *OBLIGATORIA_MULTICAPA, True),
                    _actividad(numero, "video", *OPCIONAL_VIDEO, False),
                ],
            },
        ],
    }


def build_test_manifest(modules: range | list[int] = range(1, 7)) -> Manifest:
    return build_manifest(content_for(n) for n in modules)


def write_manifest(path: Path, modules: range | list[int] = range(1, 7)) -> Path:
    path.write_text(render_manifest(build_test_manifest(modules)), encoding="utf-8")
    return path


def result_body(modulo: int, tipo: str, puntaje: int, **overrides: Any) -> dict[str, Any]:
    return {
        "modulo": modulo,
        "tipo": tipo,
        "puntaje": puntaje,
        "intentos": 1,
        "completada": True,
        **overrides,
    }


def post_required(client, headers, modulo: int, fraction: float = 1.0) -> None:
    """Registra las dos actividades obligatorias del módulo con `fraction` del máximo."""
    for sufijo, (tipo, maximo) in (
        ("quiz", OBLIGATORIA_QUIZ),
        ("multicapa", OBLIGATORIA_MULTICAPA),
    ):
        response = client.post(
            f"/api/activities/m{modulo}_{sufijo}/result",
            headers=headers,
            json=result_body(modulo, tipo, int(maximo * fraction)),
        )
        assert response.status_code == 200, response.text


def complete_module(client, headers, modulo: int, fraction: float = 1.0) -> None:
    """Registra las obligatorias del módulo y lo marca como completado."""
    post_required(client, headers, modulo, fraction)
    response = client.put(f"/api/progress/{modulo}", headers=headers, json={"completado": True})
    assert response.status_code == 200, response.text
