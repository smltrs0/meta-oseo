"""Ensambla el `content.json` de un módulo a partir de su guion (docs/content-schema.md, sección 5).

El resultado es determinista: mismo guion (y mismos SVG presentes en `public/`), mismos bytes.
Las claves van siempre en el mismo orden, en UTF-8, sin marcas de tiempo.
"""

from __future__ import annotations

import re
from pathlib import Path

from .actividades import convertir_actividad
from .bloques import MAX_BLOQUES_SECCION, convertir_contenido, fusionar_para_limite
from .cobertura import palabras_perdidas
from .contexto import Contexto
from .formato_json import dumps_prettier
from .informe import Informe
from .lector import Guion, leer_guion
from .util import a_linea, a_plano, capitalizar_primera, normalizar_id, primera_oracion, slug

VERSION_ESTADO = "borrador"


def slug_del_archivo(ruta: Path) -> str:
    """`m1_conociendo_el_hueso.md` -> `conociendo_el_hueso`."""
    return re.sub(r"^m\d+_", "", ruta.stem)


# --- Piezas --------------------------------------------------------------------------------------


def _prescan_ids(guion: Guion, ctx: Contexto) -> None:
    """Reserva todos los ids del guion antes de crear los ids de los bloques (para no chocar)."""
    for s in guion.secciones:
        ctx.ids.add(normalizar_id(s.id))
        for act in s.actividades:
            ctx.ids.add(normalizar_id(act.id))
            d = act.datos
            for capa in d.get("capas") or []:
                if isinstance(capa, dict) and capa.get("id"):
                    ctx.ids.add(normalizar_id(capa["id"]))
            for mol in d.get("moleculas") or []:
                if isinstance(mol, dict) and mol.get("id"):
                    ident = normalizar_id(mol["id"])
                    ctx.ids.add(ident if ident.startswith("mol_") else f"mol_{ident}")
            for preg in d.get("preguntas") or []:
                if isinstance(preg, dict) and preg.get("id"):
                    ctx.ids.add(normalizar_id(preg["id"]))


def _svg_tiene_capa(ctx: Contexto, id_svg: str, capa: str) -> bool:
    archivo = ctx.raiz_web / "public" / "images" / f"m{ctx.numero}" / f"{id_svg}.svg"
    if not archivo.is_file():
        return False
    return f'id="{capa}"' in archivo.read_text(encoding="utf-8", errors="replace")


def _elegir_propietarios_de_capas(guion: Guion, ctx: Contexto) -> None:
    """Las capas son únicas en el módulo. Cuando dos ilustraciones DISTINTAS usan el mismo id de capa,
    una conserva el id del guion (la «propietaria») y la otra se prefija con el nombre de su figura.
    Conserva el id la ilustración que ya tiene ese grupo dibujado en `public/images`; si ninguna
    lo tiene, la primera del guion."""
    candidatas: dict[str, list[str]] = {}
    for s in guion.secciones:
        for act in s.actividades:
            d = act.datos
            if d.get("tipo") != "multicapa":
                continue
            id_svg = str(d.get("svg") or d.get("ilustracion") or "").strip()
            for capa in d.get("capas") or []:
                if isinstance(capa, dict) and capa.get("id"):
                    ident = normalizar_id(capa["id"])
                    if id_svg not in candidatas.setdefault(ident, []):
                        candidatas[ident].append(id_svg)
    for ident, svgs in candidatas.items():
        if len(svgs) > 1:
            dibujadas = [v for v in svgs if _svg_tiene_capa(ctx, v, ident)]
            ctx.propietario_capa[ident] = (dibujadas or svgs)[0]


def _texto_ficha(guion: Guion, *claves: str) -> tuple[str, str]:
    for c in claves:
        for k, v in guion.ficha.items():
            if k.startswith(c):
                return k, v
    return "", ""


def _duracion(guion: Guion, ctx: Contexto, ident: str) -> int:
    _, valor = _texto_ficha(guion, "duracion")
    limpio, marcas = ctx.extraer(valor)
    ctx.marcar(ident, marcas)
    m = re.search(r"(\d+)(?:\s*(?:a|-|–)\s*(\d+))?\s*minutos", limpio)
    if not m:
        ctx.informe.revisar(ctx.donde(None, "ficha"), f"no se pudo leer la duración estimada de «{valor[:60]}»")
        return 30
    minimo = int(m.group(1))
    maximo = int(m.group(2)) if m.group(2) else None
    minutos = minimo if maximo is None else (minimo + maximo + 1) // 2
    ctx.informe.corregido(
        ctx.donde(None, "ficha"),
        f"duracion_estimada_min = {minutos} (de «{limpio[:50]}»; si hay rango, su punto medio)",
    )
    return minutos


def _subtitulo_y_resumen(guion: Guion, ctx: Contexto, ident: str) -> tuple[str, str]:
    _, foco_bruto = _texto_ficha(guion, "foco")
    foco_bruto, marcas = ctx.extraer(foco_bruto)
    ctx.marcar(ident, marcas)
    foco = a_plano(foco_bruto)
    subtitulo = foco.rstrip(".").strip()
    if not subtitulo:
        ctx.informe.revisar(ctx.donde(None, "ficha"), "la ficha no trae «Foco», que se usa como subtítulo")
    # Resumen: el foco y la primera oración del texto de conexión con la mandíbula (todo del guion).
    conexion = guion.conexion.strip().split("\n\n")[0].strip() if guion.conexion.strip() else ""
    conexion, marcas = ctx.extraer(conexion)
    ctx.marcar(ident, marcas)
    frase = primera_oracion(a_linea(conexion)[0]) if conexion else ""
    resumen = foco if foco.endswith(".") else foco + "."
    if frase and not frase.endswith(":") and len(f"{resumen} {frase}") <= 600:
        resumen = f"{resumen} {frase}"
    ctx.informe.corregido(
        ctx.donde(None, "resumen"),
        "resumen del módulo armado con el «Foco» de la ficha y la primera oración de «Conexión con el hueso mandibular» (el guion no trae resumen)",
    )
    return subtitulo, resumen


def _objetivos(guion: Guion, ctx: Contexto, ident: str) -> list[str]:
    salida = []
    for texto, linea in guion.objetivos:
        limpio, marcas = ctx.extraer(texto)
        ctx.marcar(ident, marcas)
        resultado, correcciones = a_linea(limpio)
        for c in correcciones:
            ctx.informe.corregido(ctx.donde(linea, "objetivo"), c)
        if len(resultado) > 220:
            ctx.informe.revisar(
                ctx.donde(linea, "objetivo"),
                f"{len(resultado)} caracteres; el máximo del esquema es 220: «{resultado[:60]}…»",
            )
        salida.append(resultado)
    if not 2 <= len(salida) <= 8:
        ctx.informe.revisar(ctx.donde(None, "objetivos"), f"{len(salida)} objetivos; el esquema admite de 2 a 8")
    return salida


def _glosario(guion: Guion, ctx: Contexto) -> list[dict]:
    usados: set[str] = set()
    salida = []
    for termino, definicion, linea in guion.glosario:
        t, marcas_t = ctx.extraer(termino)
        d, marcas_d = ctx.extraer(definicion)
        etiqueta = a_plano(t)
        definicion_limpia, correcciones = a_linea(d)
        definicion_limpia = capitalizar_primera(definicion_limpia)  # el guion las escribe en minúscula tras «:»
        m_par = re.match(r"^(.+?)\s*\((.+)\)$", etiqueta)
        expandido = False
        if len(etiqueta) > 60 and m_par:
            # Término con la expansión entre paréntesis: la expansión pasa al inicio de la definición.
            expansion = m_par.group(2).strip()
            etiqueta = m_par.group(1).strip()
            definicion_limpia = f"{expansion[:1].upper()}{expansion[1:]}. {definicion_limpia}"
            expandido = True
        base = normalizar_id(slug(etiqueta, 50)) or "termino"
        ident, n = base, 2
        while ident in usados:
            ident, n = f"{base}_{n}", n + 1
        usados.add(ident)
        ctx.marcar(ident, marcas_t + marcas_d)
        if expandido:
            ctx.informe.corregido(
                ctx.donde(linea, f"glosario {ident}"),
                "término de más de 60 caracteres: la expansión entre paréntesis pasó al inicio de la definición",
            )
        for c in correcciones:
            ctx.informe.corregido(ctx.donde(linea, f"glosario {ident}"), c)
        if not 2 <= len(etiqueta) <= 60:
            ctx.informe.revisar(
                ctx.donde(linea, "glosario"), f"término de {len(etiqueta)} caracteres (2 a 60): «{etiqueta}»"
            )
        if not 10 <= len(definicion_limpia) <= 400:
            ctx.informe.revisar(
                ctx.donde(linea, f"glosario {ident}"),
                f"definición de {len(definicion_limpia)} caracteres (10 a 400): «{definicion_limpia[:50]}…»",
            )
        salida.append({"id": ident, "termino": etiqueta, "definicion": definicion_limpia})
    if not 3 <= len(salida) <= 60:
        ctx.informe.revisar(ctx.donde(None, "glosario"), f"{len(salida)} términos; el esquema admite de 3 a 60")
    return salida


def _referencias(guion: Guion, ctx: Contexto) -> list[dict]:
    salida = []
    for n, (cita, linea) in enumerate(guion.referencias, start=1):
        ident = f"ref_{n}"
        limpia, marcas = ctx.extraer(cita)
        ctx.marcar(ident, marcas)
        url = re.search(r"https://[^\s)>\]]+", limpia)
        referencia: dict = {"id": ident, "cita": a_plano(limpia)}
        if not 20 <= len(referencia["cita"]) <= 400:
            ctx.informe.revisar(
                ctx.donde(linea, "referencia"),
                f"cita de {len(referencia['cita'])} caracteres (20 a 400): «{referencia['cita'][:50]}»",
            )
        if url:
            referencia["url"] = url.group(0).rstrip(".,;")
        referencia["verificada"] = False
        salida.append(referencia)
    if not 1 <= len(salida) <= 30:
        ctx.informe.revisar(ctx.donde(None, "referencias"), f"{len(salida)} referencias; el esquema admite de 1 a 30")
    return salida


def _porcentaje_aprobacion(guion: Guion) -> float | None:
    """Umbral (0,5 a 1) que el guion propone para la evaluación final, si lo dice."""
    for valor in guion.ficha.values():
        if "evaluaci" in valor.lower() or "logro" in valor.lower():
            m = re.search(r"(?:al menos|m[ií]nimo de)\s+(?:el\s+)?(\d{2})\s*%", valor, re.IGNORECASE)
            if m:
                pct = int(m.group(1))
                if 50 <= pct <= 100:
                    return pct / 100
    return None


def _con_aprobacion(actividad: dict, umbral: float) -> dict:
    """Inserta `aprobacion_min` justo después de `obligatoria` (orden estable de las claves)."""
    salida: dict = {}
    for k, v in actividad.items():
        salida[k] = v
        if k == "obligatoria":
            salida["aprobacion_min"] = umbral
    return salida


# --- Módulo --------------------------------------------------------------------------------------


def convertir_modulo(ruta_guion: Path, raiz_web: Path, informe: Informe) -> dict:
    guion = leer_guion(ruta_guion, informe)
    ctx = Contexto(guion=guion, informe=informe, raiz_web=raiz_web)
    ident = f"m{guion.numero}"
    slug_modulo = slug_del_archivo(ruta_guion)
    _prescan_ids(guion, ctx)
    _elegir_propietarios_de_capas(guion, ctx)

    subtitulo, resumen = _subtitulo_y_resumen(guion, ctx, ident)
    duracion = _duracion(guion, ctx, ident)
    objetivos = _objetivos(guion, ctx, ident)
    umbral = _porcentaje_aprobacion(guion)

    secciones = []
    total_puntos = 0
    for s in guion.secciones:
        sid = normalizar_id(s.id)
        if sid != s.id:
            informe.corregido(ctx.donde(s.linea), f"id de sección «{s.id}» normalizado a «{sid}»")
        ctx.declarar(sid, ctx.donde(s.linea, f"sección {sid}"), "sección")
        bloques = convertir_contenido(s.contenido, s.linea_contenido, ctx, sid, s.titulo)
        actividades = []
        for ag in s.actividades:
            actividad = convertir_actividad(ag, ctx)
            if actividad is None:
                continue
            total_puntos += actividad.get("puntaje_max", 0)
            if (
                umbral is not None
                and actividad["id"].endswith("evaluacion_final")
                and actividad["tipo"] == "quiz"
                and actividad["obligatoria"]
            ):
                actividad = _con_aprobacion(actividad, umbral)
                informe.corregido(
                    ctx.donde(ag.linea, f"actividad {ag.id}"),
                    f"aprobacion_min = {umbral} (umbral que propone la ficha del guion, por acordar con el docente)",
                )
            previo = ctx.texto_previo.get(actividad["id"])
            if previo:
                actividades.append(
                    {"id": ctx.nuevo_id(f"t_{actividad['id']}_contexto"), "tipo": "texto", "markdown": previo}
                )
            actividades.append({"tipo": "actividad", "actividad": actividad})
        bloques = fusionar_para_limite(
            bloques, MAX_BLOQUES_SECCION - len(actividades), ctx, ctx.donde(s.linea, f"sección {sid}")
        )
        perdidas = palabras_perdidas(s.contenido, bloques)
        if perdidas:
            informe.revisar(
                ctx.donde(s.linea_contenido, f"sección {sid}"),
                f"palabras del contenido del guion que no están en los bloques generados: {perdidas}",
            )
        seccion = {"id": sid, "titulo": s.titulo, "bloques": bloques + actividades}
        secciones.append(seccion)

    _comprobar_puntaje(guion, total_puntos, ctx)
    glosario = _glosario(guion, ctx)
    referencias = _referencias(guion, ctx)

    pendientes = ctx.pendientes()
    estado = {
        "estado": VERSION_ESTADO,
        "notas": _notas(guion, len(ctx.marcas)),
        "pendientes": pendientes,
    }
    return {
        "id": ident,
        "numero": guion.numero,
        "slug": slug_modulo,
        "titulo": guion.titulo,
        "subtitulo": subtitulo,
        "resumen": resumen,
        "objetivos": objetivos,
        "duracion_estimada_min": duracion,
        "glosario": glosario,
        "referencias": referencias,
        "estado_revision": estado,
        "secciones": secciones,
    }


def _comprobar_puntaje(guion: Guion, total: int, ctx: Contexto) -> None:
    """La ficha del guion declara el puntaje total del módulo: debe coincidir con la suma."""
    for k, valor in guion.ficha.items():
        if "puntaje" in k:
            declarados = [int(n) for n in re.findall(r"\b(\d{3,4})\b", valor.replace(".", ""))]
            if declarados and total != declarados[0]:
                ctx.informe.revisar(
                    ctx.donde(None, "ficha"),
                    f"las actividades suman {total} puntos y la ficha del guion declara {declarados[0]}",
                )
            return


def _notas(guion: Guion, cantidad: int) -> str:
    destino = []
    if guion.tiene_banco_mentor:
        destino.append("el banco de preguntas del mentor")
    if guion.tiene_ganchos:
        destino.append("los ganchos para el mentor")
    resto = (
        f" No se transcribieron {' ni '.join(destino)}: alimentan al mentor (RAG), no van en el contenido del módulo."
        if destino
        else ""
    )
    return (
        f"Borrador generado desde {guion.archivo} (pendiente de validación del docente). "
        f"Las {cantidad} marcas de cifras dudosas del guion se quitaron del texto y están en «pendientes»; "
        "el detalle y las decisiones que se le piden al docente están en la sección 12 del guion "
        f"(«Notas de verificación para el docente»).{resto}"
    )[:600]


def serializar(modulo: dict) -> str:
    """JSON estable con el formato de prettier (lo que exige `pnpm format:check`): UTF-8, sangría
    de 2 espacios, claves en el orden de construcción, salto de línea final."""
    return dumps_prettier(modulo)
