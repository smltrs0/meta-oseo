"""Lector de guiones: convierte el Markdown de `docs/guion-por-modulo/m{n}_{slug}.md` en una
estructura de Python, sin interpretar todavía el contenido pedagógico.

Los guiones tienen una estructura fija (ficha, objetivos, ilustraciones, secciones con contenido y
actividades en bloques yaml, glosario, referencias...) pero cada uno la escribe con pequeñas
variantes (ficha en lista o en tabla, glosario en lista o en tabla, id de sección en el título o en
una línea aparte...). Este módulo absorbe esas variantes; quien lo usa recibe siempre lo mismo.

Cada elemento lleva su número de línea (base 1) para poder citar la ubicación exacta.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .informe import Informe
from .util import a_plano, quitar_acentos

# --- Estructuras ---------------------------------------------------------------------------------


@dataclass
class ActividadGuion:
    id: str
    datos: dict
    linea: int  # línea del encabezado "##### Actividad ..."


@dataclass
class SeccionGuion:
    numero: str  # "1.1"
    titulo: str
    id: str
    linea: int
    contenido: str
    linea_contenido: int
    actividades: list[ActividadGuion] = field(default_factory=list)


@dataclass
class Ilustracion:
    id: str
    que_muestra: str
    capas: list[tuple[str, str]]  # (id, etiqueta)
    fila: str  # texto completo de la fila (para diagnóstico)
    linea: int
    es_modelo_3d: bool = False
    alt_sugerido: str = ""


@dataclass
class Guion:
    archivo: str
    numero: int
    titulo: str
    ficha: dict[str, str]
    objetivos: list[tuple[str, int]]  # (texto, línea)
    conexion: str
    ilustraciones: dict[str, Ilustracion]
    secciones: list[SeccionGuion]
    glosario: list[tuple[str, str, int]]  # (término, definición, línea)
    referencias: list[tuple[str, int]]  # (cita, línea)
    tiene_banco_mentor: bool
    tiene_ganchos: bool
    # Texto completo del guion (para recuperar las tildes de palabras que el guion escribe sin ellas).
    texto: str = ""


# --- Utilidades ----------------------------------------------------------------------------------


def clave(texto: str) -> str:
    """Clave normalizada de un encabezado o campo: sin tildes, minúsculas, sin adornos."""
    t = quitar_acentos(texto).lower()
    t = re.sub(r"[*`_]", "", t)
    return re.sub(r"\s+", " ", t).strip(" :.")


def _dividir_por_h2(lineas: list[str]) -> dict[str, tuple[int, list[str]]]:
    """Reparte las líneas por encabezados `## `, sin confundirse con las que van dentro de bloques
    de código. Devuelve {clave: (línea de inicio de su contenido, líneas)}."""
    secciones: dict[str, tuple[int, list[str]]] = {}
    actual: str | None = None
    en_bloque = False
    for i, linea in enumerate(lineas):
        if linea.lstrip().startswith("```"):
            en_bloque = not en_bloque
        m = None if en_bloque else re.match(r"^##\s+(?!#)(.+?)\s*$", linea)
        if m:
            actual = clave(m.group(1))
            if actual not in secciones:
                secciones[actual] = (i + 2, [])
            continue
        if actual is not None:
            secciones[actual][1].append(linea)
    return secciones


def _celdas(linea: str) -> list[str]:
    """Celdas de una fila de tabla Markdown (respeta `\\|`)."""
    fila = linea.strip()
    if fila.startswith("|"):
        fila = fila[1:]
    if fila.endswith("|") and not fila.endswith("\\|"):
        fila = fila[:-1]
    partes = re.split(r"(?<!\\)\|", fila)
    return [p.replace("\\|", "|").strip() for p in partes]


def es_fila_tabla(linea: str) -> bool:
    return bool(re.match(r"^\s*\|.*\|\s*$", linea))


def es_separador_tabla(celdas: list[str]) -> bool:
    return (
        bool(celdas)
        and all(re.fullmatch(r":?-{2,}:?", c.strip()) for c in celdas if c.strip() != "")
        and any(c.strip() for c in celdas)
    )


def celdas_de_tabla(linea: str) -> list[str]:
    return _celdas(linea)


# --- Partes del guion ----------------------------------------------------------------------------


def _leer_ficha(lineas: list[str]) -> dict[str, str]:
    ficha: dict[str, str] = {}
    for linea in lineas:
        m = re.match(r"^\s*[-*]\s+(?:\*\*)?([^:*]+?)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+)$", linea)
        if m:
            ficha.setdefault(clave(m.group(1)), m.group(2).strip())
            continue
        if es_fila_tabla(linea):
            celdas = _celdas(linea)
            if len(celdas) >= 2 and not es_separador_tabla(celdas) and clave(celdas[0]) not in ("campo", ""):
                ficha.setdefault(clave(celdas[0]), celdas[1])
    return ficha


def _leer_objetivos(lineas: list[str], inicio: int) -> list[tuple[str, int]]:
    objetivos: list[tuple[str, int]] = []
    for i, linea in enumerate(lineas):
        m = re.match(r"^\s*(?:\d{1,2}[.)]|[-*])\s+(.+)$", linea)
        if m:
            objetivos.append((m.group(1).strip(), inicio + i))
    return objetivos


_PAR_CAPA = re.compile(r"`([a-z0-9_]+)`\s*[:=]\s*([^;`|]+)")
_TITULO_ILUSTRACION = re.compile(r"^\s*\*\*[^*]*`(m\d_[a-z0-9_]+)`[^*]*\*\*\s*$")
_ALT_SUGERIDO = re.compile(r"[Tt]exto alternativo[^:«\"]*:\s*[«\"](.+?)[»\"]\s*\.?\s*$")


def _leer_ilustraciones(lineas: list[str], inicio: int) -> dict[str, Ilustracion]:
    """Tabla de ilustraciones y modelos. Admite las variantes de los seis guiones: una tabla con
    las capas en una columna (`id` = etiqueta), o una tabla de archivos más una tabla de capas por
    ilustración bajo un encabezado en negrita (con su texto alternativo sugerido)."""
    tabla: dict[str, Ilustracion] = {}
    modo = ""
    actual: str | None = None
    for i, linea in enumerate(lineas):
        m_titulo = _TITULO_ILUSTRACION.match(linea)
        if m_titulo:
            actual = m_titulo.group(1)
            modo = ""
            continue
        m_alt = _ALT_SUGERIDO.search(linea)
        if m_alt and actual in tabla:
            tabla[actual].alt_sugerido = m_alt.group(1).strip()
            continue
        if not es_fila_tabla(linea):
            if not linea.strip():
                continue
            if not linea.lstrip().startswith("|"):
                modo = "" if not linea.startswith("-") else modo
            continue
        celdas = _celdas(linea)
        if es_separador_tabla(celdas):
            continue
        cabecera = quitar_acentos(celdas[0]).lower().replace("_", " ").strip()
        if cabecera in ("id de archivo", "id archivo"):
            modo = "archivo"
            continue
        if cabecera in ("id de capa", "id capa"):
            modo = "capa"
            continue
        m = re.match(r"^`([a-z0-9_]+)`", celdas[0])
        if not m:
            modo = "" if modo == "" else modo
            continue
        ident = m.group(1)
        if modo == "capa":
            if actual in tabla and len(celdas) >= 2:
                tabla[actual].capas.append((ident, celdas[1].strip().rstrip(".").strip()))
            continue
        if modo == "archivo":
            capas: list[tuple[str, str]] = []
            for celda in celdas[2:]:
                for par in _PAR_CAPA.finditer(celda):
                    capas.append((par.group(1), par.group(2).strip().rstrip(".").strip()))
            tabla[ident] = Ilustracion(
                id=ident,
                que_muestra=celdas[1] if len(celdas) > 1 else "",
                capas=capas,
                fila=linea,
                linea=inicio + i,
                es_modelo_3d="modelo 3d" in quitar_acentos(celdas[0]).lower() or ident in ("mandibula", "celulas"),
            )
    return tabla


_TITULO_SECCION = re.compile(r"^###\s+Secci[oó]n\s+(\d+\.\d+)\s*:\s*(.+?)\s*$")
_ID_EN_TITULO = re.compile(r'\s*\(id\s*:?\s*"([A-Za-z0-9_]+)"\)\s*$')
_ID_LINEA = re.compile(r'^\s*id\s*:?\s*"([A-Za-z0-9_]+)"\s*$')


def _leer_secciones(lineas: list[str], inicio: int, archivo: str, informe: Informe) -> list[SeccionGuion]:
    # Posiciones de los encabezados de sección (fuera de bloques de código).
    marcas: list[tuple[int, str, str]] = []
    en_bloque = False
    for i, linea in enumerate(lineas):
        if linea.lstrip().startswith("```"):
            en_bloque = not en_bloque
        if en_bloque:
            continue
        m = _TITULO_SECCION.match(linea)
        if m:
            marcas.append((i, m.group(1), m.group(2)))
    secciones: list[SeccionGuion] = []
    for n, (i, numero, resto) in enumerate(marcas):
        fin = marcas[n + 1][0] if n + 1 < len(marcas) else len(lineas)
        cuerpo = lineas[i + 1 : fin]
        titulo = resto
        ident = ""
        m_id = _ID_EN_TITULO.search(resto)
        if m_id:
            ident = m_id.group(1)
            titulo = resto[: m_id.start()].strip()
        else:
            for linea in cuerpo[:6]:
                m2 = _ID_LINEA.match(linea)
                if m2:
                    ident = m2.group(1)
                    break
        donde = f"{archivo}:{inicio + i}"
        if not ident:
            informe.revisar(donde, f'la sección {numero} no declara su id (`id "..."`)')
        secciones.append(_leer_seccion(numero, titulo, ident, inicio + i, cuerpo, archivo, informe))
    return secciones


def _leer_seccion(
    numero: str,
    titulo: str,
    ident: str,
    linea: int,
    cuerpo: list[str],
    archivo: str,
    informe: Informe,
) -> SeccionGuion:
    # Reparto en Contenido / Actividades por los encabezados de nivel 4.
    partes: dict[str, tuple[int, list[str]]] = {}
    actual: str | None = None
    en_bloque = False
    for i, texto_linea in enumerate(cuerpo):
        if texto_linea.lstrip().startswith("```"):
            en_bloque = not en_bloque
        m = None if en_bloque else re.match(r"^####\s+(?!#)(.+?)\s*$", texto_linea)
        if m:
            actual = clave(m.group(1))
            partes.setdefault(actual, (i + 1, []))
            continue
        if actual is not None:
            partes[actual][1].append(texto_linea)
    contenido_ini, contenido = partes.get("contenido", (0, []))
    act_ini, act_lineas = partes.get("actividades", (0, []))
    seccion = SeccionGuion(
        numero=numero,
        titulo=a_plano(titulo),
        id=ident,
        linea=linea,
        contenido="\n".join(contenido).strip("\n"),
        linea_contenido=linea + 1 + contenido_ini,
    )
    if not contenido:
        informe.revisar(f"{archivo}:{linea}", f"la sección {numero} no tiene «#### Contenido»")
    seccion.actividades = _leer_actividades(act_lineas, linea + 1 + act_ini, archivo, informe)
    return seccion


def _leer_actividades(lineas: list[str], inicio: int, archivo: str, informe: Informe) -> list[ActividadGuion]:
    actividades: list[ActividadGuion] = []
    i = 0
    while i < len(lineas):
        m = re.match(r"^#####\s+Actividad\s+(\S+)\s*$", lineas[i])
        if not m:
            if lineas[i].strip() and not lineas[i].lstrip().startswith("```"):
                informe.revisar(f"{archivo}:{inicio + i}", f"texto fuera de una actividad ignorado: «{lineas[i][:60]}»")
            i += 1
            continue
        ident = m.group(1)
        encabezado = inicio + i
        i += 1
        # Busca el bloque yaml de esta actividad (antes del siguiente encabezado).
        while i < len(lineas) and not lineas[i].startswith("```yaml") and not lineas[i].startswith("#####"):
            i += 1
        if i >= len(lineas) or lineas[i].startswith("#####"):
            informe.revisar(f"{archivo}:{encabezado}", f"la actividad {ident} no tiene bloque yaml")
            continue
        i += 1
        bloque: list[str] = []
        while i < len(lineas) and not lineas[i].startswith("```"):
            bloque.append(lineas[i])
            i += 1
        i += 1  # cierre del bloque
        try:
            datos = yaml.safe_load("\n".join(bloque))
        except yaml.YAMLError as error:
            informe.revisar(f"{archivo}:{encabezado}", f"la actividad {ident} no es YAML válido: {error}")
            continue
        if not isinstance(datos, dict):
            informe.revisar(f"{archivo}:{encabezado}", f"la actividad {ident} no es un mapa YAML")
            continue
        actividades.append(ActividadGuion(id=ident, datos=datos, linea=encabezado))
    return actividades


_ELEMENTO_GLOSARIO = re.compile(r"^\s*[-*]\s+\*\*(.+?)\*\*\s*[:—–-]?\s*(.+)$")


def _leer_glosario(lineas: list[str], inicio: int) -> list[tuple[str, str, int]]:
    terminos: list[tuple[str, str, int]] = []
    for i, linea in enumerate(lineas):
        m = _ELEMENTO_GLOSARIO.match(linea)
        if m:
            termino = m.group(1).strip().rstrip(":").strip()
            definicion = m.group(2).strip()
            # "**Término:** definición": el ":" quedó dentro de la negrita.
            terminos.append((termino, definicion, inicio + i))
            continue
        if es_fila_tabla(linea):
            celdas = _celdas(linea)
            if len(celdas) >= 2 and not es_separador_tabla(celdas) and clave(celdas[0]) not in ("termino", ""):
                terminos.append((celdas[0], celdas[1], inicio + i))
    return terminos


def _leer_referencias(lineas: list[str], inicio: int) -> list[tuple[str, int]]:
    referencias: list[tuple[str, int]] = []
    for i, linea in enumerate(lineas):
        m = re.match(r"^\s*(?:\d{1,3}[.)]|[-*])\s+(.+)$", linea)
        if m:
            referencias.append((m.group(1).strip(), inicio + i))
    return referencias


# --- Punto de entrada ----------------------------------------------------------------------------


def leer_guion(ruta: Path, informe: Informe) -> Guion:
    texto = ruta.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
    if texto.startswith("﻿"):
        texto = texto[1:]
    lineas = texto.split("\n")
    archivo = ruta.name

    m = re.match(r"^#\s+M[oó]dulo\s+(\d+)\s*:\s*(.+?)\s*$", lineas[0]) if lineas else None
    if not m:
        raise ValueError(f"{archivo}:1: el guion debe empezar por «# Modulo N: Título»")
    numero, titulo = int(m.group(1)), a_plano(m.group(2))

    partes = _dividir_por_h2(lineas)

    def parte(nombre: str) -> tuple[int, list[str]]:
        return partes.get(nombre, (1, []))

    _, l_ficha = parte("ficha")
    ini_obj, l_obj = parte("objetivos de aprendizaje")
    _, l_conex = parte("conexion con el hueso mandibular")
    ini_ilu, l_ilu = parte("ilustraciones y modelos requeridos")
    ini_sec, l_sec = parte("secciones")
    ini_glo, l_glo = parte("glosario")
    ini_ref, l_ref = parte("referencias")

    for necesaria in ("ficha", "objetivos de aprendizaje", "secciones", "glosario", "referencias"):
        if necesaria not in partes:
            informe.revisar(archivo, f"falta la sección «## {necesaria}» del guion")

    return Guion(
        archivo=archivo,
        numero=numero,
        titulo=titulo,
        ficha=_leer_ficha(l_ficha),
        objetivos=_leer_objetivos(l_obj, ini_obj),
        conexion="\n".join(l_conex).strip(),
        ilustraciones=_leer_ilustraciones(l_ilu, ini_ilu),
        secciones=_leer_secciones(l_sec, ini_sec, archivo, informe),
        glosario=_leer_glosario(l_glo, ini_glo),
        referencias=_leer_referencias(l_ref, ini_ref),
        tiene_banco_mentor="banco de preguntas para el mentor" in partes,
        tiene_ganchos="ganchos para el mentor" in partes,
        texto=texto,
    )
