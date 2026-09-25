"""Bloques de lectura: texto, avisos, tablas, imágenes, marcas [verificar] y límites."""

from __future__ import annotations

import re

from guion_sintetico import SECCION_1, construir


def test_cada_tipo_de_bloque(convertir):
    r = convertir(construir())
    tipos = [b["tipo"] for b in r.seccion(0)["bloques"]]
    assert tipos.count("texto") >= 3
    assert tipos.count("callout") == 4
    assert tipos.count("tabla") == 1
    assert tipos.count("imagen") == 1
    assert tipos.count("actividad") == 3
    # Las actividades van al final de la sección.
    assert tipos[-3:] == ["actividad"] * 3


def test_titulo_en_negrita_abre_un_bloque_con_titulo(convertir):
    r = convertir(construir())
    textos = r.bloques(0, "texto")
    assert "titulo" not in textos[0]  # el párrafo inicial no tiene título
    assert textos[1]["titulo"] == "Un subtítulo en negrita"
    assert "**" not in textos[1]["titulo"]
    # La lista queda dentro del bloque de su título, como lista plana.
    assert "- Primer elemento de la lista.\n- Segundo elemento de la lista." in textos[1]["markdown"]


def test_avisos_con_o_sin_tilde_y_primera_letra_en_mayuscula(convertir):
    r = convertir(construir())
    variantes = [c["variante"] for c in r.bloques(0, "callout")]
    assert variantes == ["clinico", "dato", "atencion", "recuerda"]
    clinico = r.bloques(0, "callout")[0]
    assert clinico["markdown"] == "El aviso clínico empieza en minúscula."
    assert "Clinico" not in clinico["markdown"]


def test_tabla_markdown_a_bloque_tabla(convertir):
    r = convertir(construir())
    (tabla,) = r.bloques(0, "tabla")
    assert tabla["encabezado_criterio"] == "Rasgo"
    assert tabla["columnas"] == ["Uno", "Otro"]
    assert tabla["filas"][0] == {"criterio": "Matriz", "celdas": ["Blanda", "Rígida"]}
    assert tabla["titulo"].startswith("Tabla:")  # el guion no la titula: se usan sus encabezados


def test_imagen_con_src_y_alt(convertir):
    r = convertir(construir())
    (imagen,) = r.bloques(0, "imagen")
    assert imagen["src"] == "/images/m1/m1_dibujo.svg"
    assert imagen["alt"].startswith("Un dibujo de prueba")
    assert imagen["pie"].endswith(".")


def test_para_profundizar_pasa_a_nivel_posgrado(convertir):
    r = convertir(construir())
    profundizar = [b for b in r.bloques(0, "texto") if b.get("titulo") == "Para profundizar"]
    assert len(profundizar) == 1 and profundizar[0]["nivel"] == "posgrado"


def test_aviso_de_profundizacion_entre_parentesis(convertir):
    seccion = SECCION_1.replace(
        "> Dato: un dato clave.", "> Dato: un dato de detalle molecular (profundización para posgrado)."
    )
    r = convertir(construir(seccion_1=seccion))
    dato = next(c for c in r.bloques(0, "callout") if c["variante"] == "dato")
    assert dato["nivel"] == "posgrado"
    assert "profundización" not in dato["markdown"]


def test_marca_verificar_se_quita_y_queda_como_pendiente(convertir):
    r = convertir(construir())
    assert "verificar" not in r.texto.lower()
    pendientes = r.modulo["estado_revision"]["pendientes"]
    # ficha (duración), párrafo con la cifra y glosario
    assert len(pendientes) == 3
    ids = {p["id"] for p in pendientes}
    assert "m1" in ids and "osteoblasto" in ids
    cifra = [p for p in pendientes if "calcio" in p["nota"]]
    assert cifra and cifra[0]["id"].startswith("t_")  # apunta al bloque de texto, no a la sección
    for p in pendientes:
        assert 5 <= len(p["nota"]) <= 300
    # El texto queda limpio: la cifra se conserva y sin espacio suelto antes del punto.
    bloque = next(b for b in r.bloques(0, "texto") if "99 %" in b["markdown"])
    assert "el 99 % del calcio. Sigue el texto." in bloque["markdown"]
    assert "estado_revision" in r.modulo and r.modulo["estado_revision"]["estado"] == "borrador"
    assert "sección 12" in r.modulo["estado_revision"]["notas"]


def test_parrafo_largo_se_parte_por_oraciones_sin_perder_texto(convertir):
    oracion = "Esta es una oración de relleno para alargar el párrafo. "
    largo = (oracion * 60).strip()  # unos 3300 caracteres en un solo párrafo
    seccion = SECCION_1.replace("Un párrafo inicial sin título que abre la sección de prueba.", largo)
    r = convertir(construir(seccion_1=seccion))
    textos = [b["markdown"] for b in r.bloques(0, "texto")]
    assert all(len(t) <= 2500 for t in textos)
    assert "".join(textos).count("Esta es una oración de relleno") == 60
    assert any("partido por oraciones" in c for c in r.corregido())


def test_tabla_con_celda_demasiado_larga_pasa_a_lista_sin_perder_nada(convertir):
    celda = "palabra " * 40  # 320 caracteres
    seccion = SECCION_1.replace("| Matriz | Blanda | Rígida |", f"| Matriz | {celda.strip()} | Rígida |")
    r = convertir(construir(seccion_1=seccion))
    assert not r.bloques(0, "tabla")
    texto = " ".join(b["markdown"] for b in r.bloques(0, "texto"))
    assert celda.strip() in texto
    assert "**Rasgo: Matriz**" in texto and "- **Otro:** Rígida" in texto


def test_tabla_de_dos_columnas_pasa_a_lista(convertir):
    seccion = SECCION_1.replace(
        "| Rasgo | Uno | Otro |\n|---|---|---|\n| Matriz | Blanda | Rígida |\n| Células | Fibroblastos | Osteoblastos |",
        "| Molécula | Qué hace |\n|---|---|\n| TNAP | Genera fosfato |\n| PHOSPHO1 | Corta fosfocolina |",
    )
    r = convertir(construir(seccion_1=seccion))
    assert not r.bloques(0, "tabla")
    texto = " ".join(b["markdown"] for b in r.bloques(0, "texto"))
    assert "- **TNAP:** Genera fosfato" in texto and "**Molécula** y **Qué hace**" in texto


def test_aviso_muy_largo_se_parte_en_parrafos(convertir):
    parrafo = "Una frase larga de aviso. " * 20  # ~520 caracteres
    cuerpo = f"> Clinico: {parrafo.strip()}\n>\n> {parrafo.strip()}"
    seccion = SECCION_1.replace("> Clinico: el aviso clínico empieza en minúscula.", cuerpo)
    r = convertir(construir(seccion_1=seccion))
    clinicos = [c for c in r.bloques(0, "callout") if c["variante"] == "clinico"]
    assert len(clinicos) == 2 and all(len(c["markdown"]) <= 900 for c in clinicos)


def test_sin_encabezados_estructurales_ni_marcas_de_markdown_sueltas(convertir):
    r = convertir(construir())
    for s in r.modulo["secciones"]:
        for b in s["bloques"]:
            if b["tipo"] in ("texto", "callout"):
                assert not re.search(r"^#{1,6}\s", b["markdown"], re.M)
                assert "`" not in b["markdown"] and "[verificar" not in b["markdown"]
                assert not re.search(r"^>", b["markdown"], re.M)


def test_seccion_con_demasiados_bloques_pasa_avisos_a_parrafos_sin_perder_texto(convertir):
    # Un texto de posgrado seguido de 14 avisos alternados (no se pueden unir por variante).
    avisos = "\n\n".join(
        f"> {'Clinico' if k % 2 == 0 else 'Dato'}: aviso número {k} de la sección con bastante texto."
        for k in range(14)
    )
    contenido = f"**Para profundizar (plegable; no se evalúa)**\n\nUn texto de profundización con bastante contenido.\n\n{avisos}\n\n"
    seccion = SECCION_1.replace(
        "Un párrafo inicial sin título que abre la sección de prueba.\n", contenido + "Un párrafo inicial.\n"
    )
    r = convertir(construir(seccion_1=seccion))
    bloques = r.seccion(0)["bloques"]
    assert len(bloques) <= 15
    texto = " ".join(b["markdown"] for b in bloques if b["tipo"] in ("texto", "callout"))
    assert all(f"número {k} de la sección" in texto for k in range(14))
    assert "**Caso clínico.** Aviso número 0" in texto
    assert not any("bloques y el esquema admite" in x for x in r.revisar())
