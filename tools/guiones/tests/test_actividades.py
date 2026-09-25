"""Actividades: cada tipo del guion pasa a la configuración de su tipo en el esquema."""

from __future__ import annotations

from guion_sintetico import SECCION_1, SECCION_2, construir

SVG_800 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700"><g id="capa_a"/></svg>'


# --- comunes ---------------------------------------------------------------------------------


def test_campos_comunes_y_retroalimentacion(convertir):
    r = convertir(construir())
    a = r.actividad("m1_1_multicapa")
    assert list(a)[:6] == ["id", "tipo", "titulo", "instrucciones", "obligatoria", "puntaje_max"]
    assert a["retroalimentacion"] == {
        "correcta": "Muy bien, ya conoces las tres capas del dibujo.",
        "incorrecta": "Todavía faltan capas por visitar en el dibujo.",
    }
    assert r.actividad("m1_1_quiz")["retroalimentacion"]["parcial"].startswith("Vas bien")
    assert r.actividad("m1_1_video")["obligatoria"] is False


def test_campos_sin_lugar_en_el_esquema_se_anotan_y_no_pasan_al_json(convertir):
    r = convertir(construir())
    assert "interaccion" in r.omitido() and "zona_anatomica" in r.omitido()
    assert "interaccion" not in r.texto and "zona_anatomica" not in r.texto


def test_aprobacion_min_solo_en_la_evaluacion_final(convertir):
    r = convertir(construir())
    assert r.actividad("m1_2_evaluacion_final")["aprobacion_min"] == 0.7
    assert "aprobacion_min" not in r.actividad("m1_1_quiz")


def test_concepto_escrito_como_id_recupera_las_tildes_del_guion(convertir):
    guion = construir(extra="")  # el guion no dice «osificación»: se añade en un párrafo
    guion = guion.replace("Un párrafo de la segunda sección de prueba.", "Un párrafo sobre la osificación de prueba.")
    r = convertir(guion)
    assert r.actividad("m1_1_quiz")["concepto"] == "Osificación de prueba"


def test_instrucciones_largas_pierden_solo_las_indicaciones_de_interfaz(convertir):
    base = "Toca cada capa del dibujo para leer qué es. " * 4
    instr = f"{base.strip()} (con teclado, usa Tab para pasar de una capa a otra y Enter para abrirla, {'x ' * 120}). Visita las tres capas."
    seccion = SECCION_1.replace("Toca cada capa del dibujo para leer qué es. Visita las tres capas.", instr)
    r = convertir(construir(seccion_1=seccion))
    texto = r.actividad("m1_1_multicapa")["instrucciones"]
    assert len(texto) <= 400 and "teclado" not in texto and texto.endswith("Visita las tres capas.")
    assert not any("instrucciones" in x and "400" in x for x in r.revisar())


def test_instrucciones_que_no_caben_pasan_el_contexto_a_un_bloque_anterior(convertir):
    medio = "El detalle del medio explica un matiz importante del ejercicio. " * 8
    instr = f"Primero haz esto con el dibujo. {medio.strip()} Al terminar, verás el resultado."
    seccion = SECCION_1.replace("Toca cada capa del dibujo para leer qué es. Visita las tres capas.", instr)
    r = convertir(construir(seccion_1=seccion))
    a = r.actividad("m1_1_multicapa")
    assert len(a["instrucciones"]) <= 400
    assert a["instrucciones"].startswith("Primero haz esto") and a["instrucciones"].endswith("el resultado.")
    contexto = [b for b in r.seccion(0)["bloques"] if b.get("id", "").endswith("_contexto")]
    assert len(contexto) == 1 and "detalle del medio" in contexto[0]["markdown"]
    # El bloque va justo antes de su actividad.
    ids = [b.get("id") or b["actividad"]["id"] for b in r.seccion(0)["bloques"]]
    assert ids.index(contexto[0]["id"]) + 1 == ids.index("m1_1_multicapa")


def test_instrucciones_irreducibles_se_anotan_sin_recortar(convertir):
    # Solo dos oraciones: no hay contexto «del medio» que mover a un bloque anterior.
    instr = (
        "Esta primera instrucción no tiene nada que quitar, " * 5
        + "y termina aquí. "
        + "Esta segunda instrucción tampoco tiene nada que quitar, " * 4
        + "y termina aquí."
    )
    seccion = SECCION_1.replace("Toca cada capa del dibujo para leer qué es. Visita las tres capas.", instr.strip())
    r = convertir(construir(seccion_1=seccion))
    assert r.actividad("m1_1_multicapa")["instrucciones"] == instr.strip()
    assert any("instrucciones" in x and "máximo del esquema es 400" in x for x in r.revisar())


# --- multicapa -------------------------------------------------------------------------------


def test_multicapa_explorar(convertir):
    r = convertir(construir())
    c = r.actividad("m1_1_multicapa")["config"]
    assert c["svg"] == "/images/m1/m1_dibujo.svg" and c["modo"] == "explorar"
    assert c["viewBox"] == "0 0 800 600"  # provisional: el SVG no existe
    assert c["alt"] == "Un dibujo de prueba con tres capas."  # de la tabla de ilustraciones
    assert [x["id"] for x in c["capas"]] == ["capa_a", "capa_b", "capa_c"]
    assert c["requeridas"] == ["capa_a", "capa_b", "capa_c"]
    assert any("viewBox provisional" in x for x in r.corregido())


def test_viewbox_real_del_svg_cuando_existe(convertir):
    r = convertir(construir(), svgs={"m1_dibujo": SVG_800})
    assert r.actividad("m1_1_multicapa")["config"]["viewBox"] == "0 0 1000 700"


def test_multicapa_identificar_con_consignas_y_pistas(convertir):
    seccion = SECCION_1.replace("modo: explorar", "modo: identificar").replace(
        "requeridas: [capa_a, capa_b, capa_c]",
        "requeridas: [capa_a, capa_b, capa_c]\n"
        "consignas:\n"
        '  - id: c1\n    enunciado: "Toca la primera estructura que se pide."\n    capa_correcta: capa_a\n'
        '  - id: c2\n    enunciado: "Toca la segunda estructura que se pide."\n    capa_correcta: capa_a\n'
        '  - id: c3\n    enunciado: "Toca la tercera estructura que se pide."\n    capa_correcta: capa_b',
    )
    r = convertir(construir(seccion_1=seccion))
    capas = {c["id"]: c for c in r.actividad("m1_1_multicapa")["config"]["capas"]}
    assert capas["capa_a"]["pista"] == "Toca la primera estructura que se pide."
    assert capas["capa_a"]["pistas_extra"] == ["Toca la segunda estructura que se pide."]
    assert capas["capa_b"]["pista"].startswith("Toca la tercera")
    # Sin consigna ni pista en el guion se pide tocar la estructura por su nombre.
    assert capas["capa_c"]["pista"] == "Toca la estructura: Capa C."


def test_capa_repetida_en_otra_ilustracion_se_prefija_con_la_figura(convertir):
    otra = (
        '##### Actividad m1_2_otro_dibujo\n\n```yaml\ntipo: multicapa\ntitulo: "Otro dibujo"\n'
        'instrucciones: "Toca cada capa del otro dibujo para leer qué es."\nobligatoria: false\npuntaje_max: 10\n'
        'concepto: "Otras capas"\nretroalimentacion:\n  acierto: "Muy bien, ya conoces las capas."\n  error: "Faltan capas por visitar."\n'
        'svg: m1_escena\nmodo: explorar\ncapas:\n  - id: capa_a\n    etiqueta: "Capa A"\n    descripcion: "La misma capa A en otro dibujo."\n'
        '  - id: zona_1\n    etiqueta: "Zona 1"\n    descripcion: "La zona uno del dibujo de escena."\n'
        "requeridas: [capa_a, zona_1]\n```\n\n"
    )
    duplicada = SECCION_2.replace("##### Actividad m1_2_arrastre", otra + "##### Actividad m1_2_arrastre")
    r = convertir(construir(seccion_2=duplicada))
    ids = [c["id"] for c in r.actividad("m1_2_otro_dibujo")["config"]["capas"]]
    assert ids == ["escena_capa_a", "zona_1"]
    assert r.actividad("m1_2_otro_dibujo")["config"]["requeridas"] == ["escena_capa_a", "zona_1"]
    assert any("renombrado a «escena_capa_a»" in x for x in r.corregido())


# --- quiz ------------------------------------------------------------------------------------


def test_quiz_opcion_multiple_prefija_ids_y_mapea_la_correcta(convertir):
    q = convertir(construir()).actividad("m1_1_quiz")["config"]["preguntas"]
    p1 = q[0]
    assert p1["formato"] == "opcion_multiple"
    assert [o["id"] for o in p1["opciones"]] == ["m1_1_q1_a", "m1_1_q1_b", "m1_1_q1_c"]
    assert p1["correctas"] == ["m1_1_q1_b"] and p1["dificultad"] == 1
    assert p1["concepto"] == "Concepto de la pregunta"
    assert q[3]["correctas"] == ["m1_1_q4_a", "m1_1_q4_b"]


def test_quiz_verdadero_falso_a_booleano(convertir):
    r = convertir(construir())
    assert r.actividad("m1_1_quiz")["config"]["preguntas"][1]["correcta"] is False
    assert r.actividad("m1_2_evaluacion_final")["config"]["preguntas"][0]["correcta"] is True


def test_quiz_ordenar_pasos_en_el_orden_correcto_y_sin_numeracion(convertir):
    p3 = convertir(construir()).actividad("m1_1_quiz")["config"]["preguntas"][2]
    assert p3["formato"] == "ordenar"
    assert [x["texto"] for x in p3["pasos"]] == ["Primer paso", "Segundo paso", "Tercer paso"]
    assert [x["id"] for x in p3["pasos"]] == ["m1_1_q3_p2", "m1_1_q3_p3", "m1_1_q3_p1"]


# --- relación de columnas --------------------------------------------------------------------


def test_relacion_de_columnas(convertir):
    c = convertir(construir()).actividad("m1_2_relacion")["config"]
    assert [e["id"] for e in c["columna_a"]["elementos"]] == ["f_uno", "f_dos", "f_tres"]
    assert len(c["columna_b"]["elementos"]) == 4  # una descripción sobra: distractor implícito
    par_1, par_2, _ = c["pares"]
    assert par_1["explicacion"] == "El uno se une con su descripción propia."
    assert par_2 == {"id": "par_f_dos", "a": "f_dos", "b": "d_dos", "explicacion": "Descripción del dos."}
    assert c["barajar"] is True


# --- arrastre molecular ----------------------------------------------------------------------


def test_arrastre_molecular(convertir):
    r = convertir(construir())
    c = r.actividad("m1_2_arrastre")["config"]
    assert c["escena"]["fondo_svg"] == "/images/m1/m1_escena.svg"
    assert c["escena"]["alt"].startswith("Una escena de prueba")
    ids = [m["id"] for m in c["moleculas"]]
    assert ids == ["mol_alfa", "mol_beta", "mol_gamma"]  # gamma solo estaba dentro de `distractores`
    assert c["distractores"] == ["mol_gamma"]
    assert c["moleculas"][2]["rechazo"].startswith("La gamma no se une")
    # Nombre largo con paréntesis: la etiqueta se acorta y la explicación pasa a la descripción.
    alfa = c["moleculas"][0]
    assert alfa["etiqueta"] == "Alfa" and alfa["descripcion"].startswith("Molécula con nombre largo de prueba.")
    assert [r_["id"] for r_ in c["receptores"]] == ["rec_recept_uno", "rec_recept_dos"]
    assert c["pares"][0]["id"] == "par_alfa_recept_uno"
    assert c["pares"][0]["molecula"] == "mol_alfa" and c["pares"][0]["receptor"] == "rec_recept_uno"
    assert c["pares"][1]["efecto"]["animacion"] == "inhibicion"
    assert c["pares"][1]["efecto"]["indicadores"] == [{"etiqueta": "Señal", "direccion": "disminuye"}]
    assert c["pares"][0]["efecto"]["animacion"] == "activacion"  # deducida de «se activa»
    assert any("animación «activacion» deducida" in x for x in r.corregido())
    assert "que_se_anima" in r.omitido()


def test_arrastre_reparte_los_receptores_respetando_el_tamano_tactil(convertir):
    extra = "".join(
        f'  - id: r{i}\n    nombre: "Receptor {i}"\n    descripcion: "Descripción del receptor {i}."\n'
        for i in range(3, 7)
    )
    seccion = SECCION_2.replace("pares:\n  - molecula: alfa", extra + "pares:\n  - molecula: alfa")
    r = convertir(construir(seccion_2=seccion))
    posiciones = [x["posicion"] for x in r.actividad("m1_2_arrastre")["config"]["receptores"]]
    assert len(posiciones) == 6
    assert all(5 <= p["x"] <= 95 and 5 <= p["y"] <= 95 for p in posiciones)
    # Ningún par de receptores queda a menos de 52 px en un teléfono de 320 px (escena de 320 x 240).
    for i, a in enumerate(posiciones):
        for b in posiciones[i + 1 :]:
            distancia = ((a["x"] - b["x"]) * 3.2) ** 2 + ((a["y"] - b["y"]) * 2.4) ** 2
            assert distancia**0.5 >= 52
    assert not any("no se pudieron repartir" in x for x in r.revisar())


def test_arrastre_conserva_la_posicion_que_da_el_guion(convertir):
    seccion = SECCION_2.replace(
        '    descripcion: "Receptor de la molécula alfa en la membrana."\n',
        '    descripcion: "Receptor de la molécula alfa en la membrana."\n    posicion: {x: 30, y: 40}\n',
    ).replace(
        '    descripcion: "Receptor de la molécula beta en la membrana."\n',
        '    descripcion: "Receptor de la molécula beta en la membrana."\n    posicion: {x: 70, y: 40}\n',
    )
    r = convertir(construir(seccion_2=seccion))
    assert [x["posicion"] for x in r.actividad("m1_2_arrastre")["config"]["receptores"]] == [
        {"x": 30, "y": 40},
        {"x": 70, "y": 40},
    ]


# --- video + texto ---------------------------------------------------------------------------


def test_video_texto_de_animacion(convertir):
    r = convertir(construir())
    c = r.actividad("m1_1_video")["config"]
    assert c["medio"] == "animacion" and c["svg"] == "/images/m1/m1_escena.svg"
    p1, p2, p3 = c["pasos"]
    assert (p1["id"], p1["visibles"], p1["resaltadas"]) == ("paso_1", ["zona_1"], [])
    assert p1["texto"].startswith("En el primer paso")  # de `texto_narrado`
    assert (p2["visibles"], p2["resaltadas"]) == (["zona_1", "zona_2"], ["zona_2"])
    # Sin capas explícitas: las que la escena nombra, según la tabla de ilustraciones.
    assert p3["id"] == "paso_v3_cadena" and p3["visibles"] == ["zona_2", "cadena"]
    assert "cambia_escena.animacion" in r.omitido()


# --- exploración 3D --------------------------------------------------------------------------


def test_exploracion_3d_con_ancla_sobre_la_malla_unica(convertir):
    c = convertir(construir()).actividad("m1_2_3d")["config"]
    assert c["modelo"] == "mandibula" and c["requeridos"] == ["cuerpo", "rama"]
    cuerpo, rama = c["nodos"]
    for nodo in (cuerpo, rama):
        assert set(nodo["ancla"]) == {"x", "y", "z"} and all(0 <= v <= 1 for v in nodo["ancla"].values())
    assert cuerpo["etiqueta"] == "Cuerpo" and "zona_anatomica" not in cuerpo


# --- casos de error --------------------------------------------------------------------------


def test_texto_que_excede_el_limite_se_anota_sin_recortar(convertir):
    largo = "descripción " * 60  # 720 caracteres, el máximo de una capa es 500
    seccion = SECCION_1.replace("Descripción de la capa A de prueba.", largo.strip())
    r = convertir(construir(seccion_1=seccion))
    capa = r.actividad("m1_1_multicapa")["config"]["capas"][0]
    assert capa["descripcion"] == largo.strip()
    assert any("capa capa_a.descripcion" in x and "máximo del esquema es 500" in x for x in r.revisar())


def test_id_de_actividad_repetido_se_anota_con_las_dos_ubicaciones(convertir):
    seccion = SECCION_2.replace("m1_2_relacion", "m1_1_quiz")
    r = convertir(construir(seccion_2=seccion))
    assert any("id duplicado «m1_1_quiz»" in x and "ya lo usa actividad" in x for x in r.revisar())


def test_ilustracion_que_no_esta_en_la_tabla_se_anota(convertir):
    seccion = SECCION_1.replace("svg: m1_dibujo", "svg: m1_no_existe")
    r = convertir(construir(seccion_1=seccion))
    assert any("m1_no_existe" in x and "no está en la tabla" in x for x in r.revisar())


def test_pregunta_con_correcta_inexistente_se_anota(convertir):
    seccion = SECCION_1.replace("correcta: b\n", "correcta: z\n")
    r = convertir(construir(seccion_1=seccion))
    assert any("la opción correcta «z» no está entre las opciones" in x for x in r.revisar())


def test_yaml_invalido_se_anota_con_su_linea(convertir):
    seccion = SECCION_1.replace('titulo: "Explora el dibujo"', 'titulo: "Explora el dibujo')
    r = convertir(construir(seccion_1=seccion))
    assert any("no es YAML válido" in x and "m1_conociendo_el_hueso.md:" in x for x in r.revisar())


def test_la_capa_repetida_conserva_su_id_en_la_ilustracion_que_ya_la_tiene_dibujada(convertir):
    otra = (
        '##### Actividad m1_2_otro_dibujo\n\n```yaml\ntipo: multicapa\ntitulo: "Otro dibujo"\n'
        'instrucciones: "Toca cada capa del otro dibujo para leer qué es."\nobligatoria: false\npuntaje_max: 10\n'
        'concepto: "Otras capas"\nretroalimentacion:\n  acierto: "Muy bien, ya conoces las capas."\n  error: "Faltan capas por visitar."\n'
        'svg: m1_escena\nmodo: explorar\ncapas:\n  - id: capa_a\n    etiqueta: "Capa A"\n    descripcion: "La misma capa A en otro dibujo."\n'
        '  - id: zona_1\n    etiqueta: "Zona 1"\n    descripcion: "La zona uno del dibujo de escena."\n'
        "requeridas: [capa_a, zona_1]\n```\n\n"
    )
    duplicada = SECCION_2.replace("##### Actividad m1_2_arrastre", otra + "##### Actividad m1_2_arrastre")
    svg_escena = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><g id="capa_a"/><g id="zona_1"/></svg>'
    r = convertir(construir(seccion_2=duplicada), svgs={"m1_escena": svg_escena})
    # `m1_escena` ya tiene el grupo capa_a: lo conserva; la primera ilustración (m1_dibujo) se prefija.
    assert r.actividad("m1_2_otro_dibujo")["config"]["capas"][0]["id"] == "capa_a"
    assert [c["id"] for c in r.actividad("m1_1_multicapa")["config"]["capas"]] == ["dibujo_capa_a", "capa_b", "capa_c"]


def test_etiqueta_de_mas_de_40_caracteres_se_corta_en_una_preposicion_sin_perder_el_nombre(convertir):
    largo = "Receptor de la membrana de la célula osteoblástica en reposo"
    seccion = SECCION_2.replace('nombre: "Receptor uno"', f'nombre: "{largo}"')
    r = convertir(construir(seccion_2=seccion))
    receptor = r.actividad("m1_2_arrastre")["config"]["receptores"][0]
    assert receptor["etiqueta"] == "Receptor de la membrana"
    assert receptor["descripcion"].startswith(largo + ".")  # el nombre completo pasa a la descripción
    assert not any("etiqueta de" in x for x in r.revisar())


def test_etiqueta_que_no_se_puede_cortar_se_anota_sin_recortar(convertir):
    largo = "Supercalifragilisticoespialidosisimo" + "x" * 30
    seccion = SECCION_2.replace('nombre: "Receptor uno"', f'nombre: "{largo}"')
    r = convertir(construir(seccion_2=seccion))
    assert r.actividad("m1_2_arrastre")["config"]["receptores"][0]["etiqueta"] == largo
    assert any("etiqueta de 66 caracteres" in x for x in r.revisar())
