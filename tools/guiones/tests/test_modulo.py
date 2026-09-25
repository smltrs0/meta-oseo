"""Módulo completo: cabecera, glosario, referencias, determinismo, CLI y validación con el esquema real."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from conftest import CARPETA_GUIONES, RAIZ
from guion_sintetico import construir

CONVERTIR = CARPETA_GUIONES / "convertir.py"


# --- cabecera del módulo -----------------------------------------------------------------------


def test_datos_del_modulo(convertir):
    m = convertir(construir()).modulo
    assert list(m) == [
        "id",
        "numero",
        "slug",
        "titulo",
        "subtitulo",
        "resumen",
        "objetivos",
        "duracion_estimada_min",
        "glosario",
        "referencias",
        "estado_revision",
        "secciones",
    ]
    assert (m["id"], m["numero"], m["slug"], m["titulo"]) == ("m1", 1, "conociendo_el_hueso", "Conociendo el hueso")
    assert m["subtitulo"] == "Un foco de prueba para el módulo sintético"
    assert m["resumen"] == "Un foco de prueba para el módulo sintético. La mandíbula es el ejemplo de prueba."
    assert m["duracion_estimada_min"] == 35  # punto medio de 30 a 40
    assert m["objetivos"][0] == "**Describir** la primera cosa importante del módulo de prueba."
    assert [s["id"] for s in m["secciones"]] == ["m1_1_primera", "m1_2_segunda"]


def test_glosario_y_referencias(convertir):
    m = convertir(construir()).modulo
    assert [g["id"] for g in m["glosario"]] == ["osteoblasto", "matriz", "osteona"]
    assert m["glosario"][0]["definicion"] == "Célula que forma la matriz ósea nueva."
    # Término de más de 60 caracteres con su expansión entre paréntesis: pasa a la definición.
    osteona = m["glosario"][2]
    assert osteona["termino"] == "Osteona" and osteona["definicion"].startswith("Sistema de Havers, unidad estructural")
    (ref,) = m["referencias"]
    assert ref == {
        "id": "ref_1",
        "cita": "Ross MH, Pawlina W. Ross. Histología: Texto y Atlas. Wolters Kluwer.",
        "verificada": False,
    }


def test_estado_revision_borrador_y_sin_datos_inventados(convertir):
    m = convertir(construir()).modulo
    assert m["estado_revision"]["estado"] == "borrador"
    assert set(m["estado_revision"]) == {"estado", "notas", "pendientes"}  # sin revisado_por, fecha ni versión
    assert "url" not in m["referencias"][0]
    assert "banco de preguntas del mentor" in m["estado_revision"]["notas"]


def test_puntaje_que_no_coincide_con_la_ficha_se_anota(convertir):
    guion = construir().replace("120 puntos", "999 puntos")
    r = convertir(guion)
    assert any("suman 120 puntos y la ficha del guion declara 999" in x for x in r.revisar())


# --- determinismo -------------------------------------------------------------------------------


def test_dos_ejecuciones_dan_bytes_iguales(convertir):
    a = convertir(construir()).texto.encode("utf-8")
    b = convertir(construir()).texto.encode("utf-8")
    assert a == b
    assert a.endswith(b"\n") and b"\r" not in a
    assert "Máximo".encode() not in a  # ...y es UTF-8 legible, no escapes \u00xx
    assert b"\\u00" not in a


def test_el_resultado_no_depende_de_la_semilla_de_hash(tmp_path):
    guion = tmp_path / "m1_conociendo_el_hueso.md"
    guion.write_text(construir(), encoding="utf-8", newline="\n")
    salidas = []
    for semilla in ("0", "1", "12345"):
        destino = tmp_path / f"salida_{semilla}"
        entorno = {**os.environ, "PYTHONHASHSEED": semilla, "PYTHONIOENCODING": "utf-8"}
        proceso = subprocess.run(
            [
                sys.executable,
                str(CONVERTIR),
                "1",
                "--silencioso",
                "--guiones",
                str(tmp_path),
                "--web",
                str(tmp_path / "web"),
                "--salida",
                str(destino),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=entorno,
            check=False,
        )
        assert proceso.returncode == 0, proceso.stderr
        salidas.append((destino / "m1_conociendo_el_hueso" / "content.json").read_bytes())
    assert salidas[0] == salidas[1] == salidas[2]


def test_ninguna_marca_verificar_en_la_salida(convertir):
    r = convertir(construir())
    assert not re.search(r"\[\s*verificar", r.texto, re.IGNORECASE)


# --- cobertura del texto --------------------------------------------------------------------------


def test_cobertura_detecta_palabras_perdidas():
    from conversor.cobertura import palabras_perdidas

    bloques = [{"id": "t_a", "tipo": "texto", "markdown": "Uno dos tres."}]
    assert palabras_perdidas("Uno dos tres.", bloques) == {}
    assert palabras_perdidas("Uno dos tres cuatro.", bloques) == {"cuatro": 1}
    # La etiqueta del aviso y las marcas no cuentan como texto perdido.
    assert palabras_perdidas("> Dato: Uno dos tres [verificar].", bloques) == {}


def test_la_conversion_no_pierde_texto_del_contenido(convertir):
    r = convertir(construir())
    assert not any("palabras del contenido" in x for x in r.revisar())


# --- CLI ---------------------------------------------------------------------------------------


def _cli(tmp_path: Path, *args: str) -> subprocess.CompletedProcess:
    entorno = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    return subprocess.run(
        [
            sys.executable,
            str(CONVERTIR),
            *args,
            "--guiones",
            str(tmp_path),
            "--web",
            str(tmp_path / "web"),
            "--salida",
            str(tmp_path / "out"),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=entorno,
        check=False,
    )


def test_cli_escribe_y_comprueba(tmp_path):
    (tmp_path / "m1_conociendo_el_hueso.md").write_text(construir(), encoding="utf-8", newline="\n")
    salida = tmp_path / "out" / "m1_conociendo_el_hueso" / "content.json"

    # Antes de escribir, --comprobar dice que no existe (código 1).
    assert _cli(tmp_path, "1", "--comprobar", "--silencioso").returncode == 1
    assert not salida.exists()  # --comprobar no escribe

    assert _cli(tmp_path, "1", "--silencioso").returncode == 0
    assert json.loads(salida.read_text(encoding="utf-8"))["id"] == "m1"
    assert _cli(tmp_path, "todos", "--comprobar", "--silencioso").returncode == 0

    # Si el JSON se edita a mano, --comprobar lo detecta.
    salida.write_text(salida.read_text(encoding="utf-8").replace("Conociendo el hueso", "Otro"), encoding="utf-8")
    comprobacion = _cli(tmp_path, "1", "--comprobar", "--silencioso")
    assert comprobacion.returncode == 1 and "DIFIERE" in comprobacion.stdout


def test_cli_no_sobrescribe_un_json_editado_a_mano_salvo_con_forzar(tmp_path):
    (tmp_path / "m1_conociendo_el_hueso.md").write_text(construir(), encoding="utf-8", newline="\n")
    salida = tmp_path / "out" / "m1_conociendo_el_hueso" / "content.json"
    assert _cli(tmp_path, "1", "--silencioso").returncode == 0

    # Regenerar sin cambios no es un problema: el resultado es idéntico.
    assert _cli(tmp_path, "1", "--silencioso").returncode == 0

    # Un retoque a mano NO se pierde en silencio.
    editado = salida.read_text(encoding="utf-8").replace("Conociendo el hueso", "Retoque a mano")
    salida.write_text(editado, encoding="utf-8", newline="\n")
    proceso = _cli(tmp_path, "1", "--silencioso")
    assert proceso.returncode == 3 and "NO SE ESCRIBIÓ" in proceso.stderr
    assert salida.read_text(encoding="utf-8") == editado  # el archivo quedó intacto

    # Con --forzar se sobrescribe a propósito.
    assert _cli(tmp_path, "1", "--silencioso", "--forzar").returncode == 0
    assert "Retoque a mano" not in salida.read_text(encoding="utf-8")


def test_cli_informe_lista_lo_que_hay_que_revisar(tmp_path):
    guion = construir().replace(
        'puntaje_max: 20\nconcepto: "Capas de prueba"', 'puntaje_max: 20\nconcepto: "Capas de prueba"'
    )
    (tmp_path / "m1_conociendo_el_hueso.md").write_text(
        guion.replace("120 puntos", "999 puntos"), encoding="utf-8", newline="\n"
    )
    proceso = _cli(tmp_path, "1")
    assert "A REVISAR" in proceso.stdout and "la ficha del guion declara 999" in proceso.stdout
    assert _cli(tmp_path, "1", "--silencioso", "--estricto").returncode == 1


def test_cli_modulo_inexistente_es_error_de_uso(tmp_path):
    assert _cli(tmp_path, "4").returncode == 2


# --- el resultado es válido para el esquema real ---------------------------------------------------


def _hay_node_y_vite() -> bool:
    return shutil.which("node") is not None and (RAIZ / "apps" / "web" / "node_modules" / "vite").exists()


@pytest.mark.skipif(not _hay_node_y_vite(), reason="hace falta node y las dependencias de apps/web")
def test_la_salida_sintetica_valida_con_el_esquema_real(convertir, tmp_path):
    """Cada tipo de bloque y de actividad convertido debe pasar el esquema y las auditorías del proyecto
    (solo pueden faltar los SVG, que no existen en el guion sintético)."""
    r = convertir(construir())
    archivo = tmp_path / "sintetico.json"
    archivo.write_text(r.texto, encoding="utf-8", newline="\n")
    proceso = subprocess.run(
        ["node", "scripts/validar-modulo.mjs", "1", "--json", "--archivo", str(archivo)],
        cwd=RAIZ / "apps" / "web",
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    resultado = json.loads(proceso.stdout)
    assert resultado["estructurales"] == [], resultado["estructurales"]
    assert resultado["esquemaValido"] is True
    assert proceso.returncode in (0, 2)  # 2 = solo faltan los SVG


REAL = RAIZ / "docs" / "guion-por-modulo"


@pytest.mark.skipif(not (REAL / "m1_conociendo_el_hueso.md").exists(), reason="no están los guiones reales")
@pytest.mark.parametrize("numero", [1, 2, 3, 4, 5, 6])
def test_guiones_reales_convierten_sin_marcas_ni_perdidas(numero, tmp_path):
    from conversor.informe import Informe
    from conversor.modulo import convertir_modulo, serializar

    (ruta,) = REAL.glob(f"m{numero}_*.md")
    informe = Informe()
    texto = serializar(convertir_modulo(ruta, RAIZ / "apps" / "web", informe))
    assert not re.search(r"\[\s*verificar", texto, re.IGNORECASE)
    assert not any("palabras del contenido" in e.mensaje for e in informe.de_nivel("revisar"))
    assert json.loads(texto)["numero"] == numero
    assert texto == serializar(convertir_modulo(ruta, RAIZ / "apps" / "web", Informe()))  # determinista


# --- formato JSON = formato de prettier -----------------------------------------------------------


def test_formato_json_arreglos_simples_en_una_linea_si_caben():
    from conversor.formato_json import dumps_prettier

    assert dumps_prettier({"a": ["x", "y"], "b": [], "c": {}}) == ('{\n  "a": ["x", "y"],\n  "b": [],\n  "c": {}\n}\n')
    # Un arreglo con objetos se expande siempre; uno de textos largos, también.
    assert dumps_prettier({"a": [{"k": 1}]}) == '{\n  "a": [\n    {\n      "k": 1\n    }\n  ]\n}\n'
    largo = ["palabra" * 8, "otra" * 8, "más" * 8]
    assert dumps_prettier({"a": largo}).count("\n") == 7  # un elemento por línea
    # Los acentos no se escapan.
    assert "Ácido" in dumps_prettier({"a": "Ácido"})


def _prettier() -> Path | None:
    binario = RAIZ / "apps" / "web" / "node_modules" / "prettier" / "bin" / "prettier.cjs"
    return binario if binario.exists() and shutil.which("node") else None


@pytest.mark.skipif(_prettier() is None, reason="hace falta node y prettier de apps/web")
def test_la_salida_ya_esta_formateada_como_prettier(convertir):
    """`pnpm format:check` revisa los content.json: el convertidor debe escribir lo que prettier deja igual."""
    texto = convertir(construir()).texto
    proceso = subprocess.run(
        ["node", str(_prettier()), "--stdin-filepath", "content.json"],
        cwd=RAIZ / "apps" / "web",
        input=texto,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    assert proceso.returncode == 0, proceso.stderr
    assert proceso.stdout == texto
