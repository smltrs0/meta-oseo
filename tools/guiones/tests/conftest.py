"""Utilidades comunes de las pruebas del convertidor de guiones."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

CARPETA_GUIONES = Path(__file__).resolve().parents[1]
RAIZ = CARPETA_GUIONES.parents[1]
sys.path.insert(0, str(CARPETA_GUIONES))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from conversor.informe import Informe  # noqa: E402
from conversor.modulo import convertir_modulo, serializar  # noqa: E402


class Resultado:
    def __init__(self, modulo: dict, informe: Informe, texto: str) -> None:
        self.modulo = modulo
        self.informe = informe
        self.texto = texto

    def seccion(self, indice: int) -> dict:
        return self.modulo["secciones"][indice]

    def bloques(self, indice: int, tipo: str) -> list[dict]:
        return [b for b in self.seccion(indice)["bloques"] if b["tipo"] == tipo]

    def actividad(self, id_actividad: str) -> dict:
        for s in self.modulo["secciones"]:
            for b in s["bloques"]:
                if b["tipo"] == "actividad" and b["actividad"]["id"] == id_actividad:
                    return b["actividad"]
        raise KeyError(id_actividad)

    def revisar(self) -> list[str]:
        return [f"{e.donde}: {e.mensaje}" for e in self.informe.de_nivel("revisar")]

    def corregido(self) -> list[str]:
        return [f"{e.donde}: {e.mensaje}" for e in self.informe.de_nivel("corregido")]

    def omitido(self) -> list[str]:
        return [e.clave for e in self.informe.de_nivel("omitido")]


@pytest.fixture
def convertir(tmp_path: Path):
    """Convierte un guion (texto) como módulo 1 y devuelve el resultado."""

    def _convertir(
        texto: str, svgs: dict[str, str] | None = None, nombre: str = "m1_conociendo_el_hueso.md"
    ) -> Resultado:
        guion = tmp_path / nombre
        guion.write_text(texto, encoding="utf-8", newline="\n")
        web = tmp_path / "web"
        for id_svg, contenido in (svgs or {}).items():
            destino = web / "public" / "images" / "m1" / f"{id_svg}.svg"
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(contenido, encoding="utf-8")
        informe = Informe()
        modulo = convertir_modulo(guion, web, informe)
        return Resultado(modulo, informe, serializar(modulo))

    return _convertir
