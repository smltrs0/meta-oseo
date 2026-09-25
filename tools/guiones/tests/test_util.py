"""Funciones de texto: marcas [verificar], ids y limpieza de Markdown."""

from __future__ import annotations

import pytest

from conversor import util


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("Cifra aproximada [verificar].", "Cifra aproximada."),
        ("[verificar] Al inicio.", "Al inicio."),
        ("Dos [verificar] marcas [ verificar: la cifra ] en la frase.", "Dos marcas en la frase."),
        ("Sin marcas.", "Sin marcas."),
    ],
)
def test_quitar_marcas(texto, esperado):
    assert util.quitar_marcas(texto) == esperado
    assert not util.contiene_marca(esperado)


def test_fragmentos_con_marca_toma_la_frase_previa():
    frases = util.fragmentos_con_marca("Una frase. El 99 % del calcio [verificar]. Otra frase.")
    assert frases == ["El 99 % del calcio"]


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("Célula madre mesenquimal", "celula_madre_mesenquimal"),
        ("Ca²⁺ y PTH", "ca_y_pth"),
        ("¿Qué es esto?", "que_es_esto"),
    ],
)
def test_slug(texto, esperado):
    assert util.slug(texto) == esperado


def test_normalizar_id_quita_tildes_mayusculas_y_empieza_por_letra():
    assert util.normalizar_id("Cartílago_Meckel") == "cartilago_meckel"
    assert util.normalizar_id("3d_modelo") == "x_3d_modelo"
    assert util.es_id_valido(util.normalizar_id("Óxido nítrico (NO)"))


def test_a_linea_quita_marcadores_y_une_saltos():
    texto, correcciones = util.a_linea("- elemento de lista\ncontinúa aquí")
    assert texto == "elemento de lista continúa aquí" and correcciones
    # Un valor con signo no es una lista ni una cita.
    assert util.a_linea("> 99 % del calcio")[0] == "> 99 % del calcio"
    assert util.a_linea("Una `palabra` con código")[0] == "Una palabra con código"


def test_capitalizar_primera_respeta_siglas_y_simbolos():
    assert util.capitalizar_primera("cuando un hueso") == "Cuando un hueso"
    assert util.capitalizar_primera("pH bajo") == "pH bajo"
    assert util.capitalizar_primera("mTOR activa") == "mTOR activa"
    assert util.capitalizar_primera("1α-hidroxilasa") == "1α-hidroxilasa"


def test_a_plano_quita_markdown():
    assert util.a_plano("**Negrita** y *cursiva* y [enlace](glosario:x)") == "Negrita y cursiva y enlace"
