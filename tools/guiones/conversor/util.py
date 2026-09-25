"""Utilidades de texto del convertidor de guiones: ids, limpieza de Markdown y marcas [verificar].

Todo son funciones puras (sin acceso a archivos), para poder probarlas solas. Las reglas de texto
replican las de `apps/web/src/content/texto.ts` (esquema de contenido): la fuente de verdad sigue
siendo ese archivo, aquí solo se preparan los textos para que lo cumplan.
"""

from __future__ import annotations

import re
import unicodedata

# --- Marca [verificar] ---------------------------------------------------------------------------

# Igual que MARCA_VERIFICAR de texto.ts: "[verificar]", "[ verificar: cifra ]"...
MARCA_VERIFICAR = re.compile(r"\s*\[\s*verificar[^\]\n]*\]", re.IGNORECASE)


def contiene_marca(texto: str) -> bool:
    return bool(MARCA_VERIFICAR.search(texto))


def quitar_marcas(texto: str) -> str:
    """Quita las marcas [verificar] junto con el espacio que las precede, sin tocar nada más."""
    limpio = MARCA_VERIFICAR.sub("", texto)
    # "cifra [verificar]." deja "cifra." ; "[verificar] Texto" al inicio deja "Texto".
    return limpio.lstrip() if texto.lstrip().lower().startswith("[verificar") else limpio


def fragmentos_con_marca(texto: str, maximo: int = 200) -> list[str]:
    """Para cada marca, el fragmento de frase que la precede (para redactar la nota al docente)."""
    fragmentos: list[str] = []
    for m in MARCA_VERIFICAR.finditer(texto):
        antes = quitar_marcas(texto[: m.start()])
        # Inicio de la frase: tras el último ". ", "? ", "! " o salto de línea.
        corte = max(antes.rfind(". "), antes.rfind("? "), antes.rfind("! "), antes.rfind("\n"))
        frase = antes[corte + 1 :].strip() if corte >= 0 else antes.strip()
        frase = a_plano(frase)
        if len(frase) > maximo:
            frase = "…" + frase[-(maximo - 1) :].lstrip()
        fragmentos.append(frase)
    return fragmentos


# --- Ids -----------------------------------------------------------------------------------------

PATRON_ID = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


def quitar_acentos(texto: str) -> str:
    descompuesto = unicodedata.normalize("NFD", texto)
    return "".join(c for c in descompuesto if unicodedata.category(c) != "Mn")


def slug(texto: str, maximo: int = 40) -> str:
    """snake_case sin tildes; se corta en un límite de palabra para no dejar palabras a medias."""
    base = quitar_acentos(texto).lower()
    base = re.sub(r"[^a-z0-9]+", "_", base).strip("_")
    if len(base) <= maximo:
        return base
    corte = base.rfind("_", 0, maximo + 1)
    return base[: corte if corte > 0 else maximo].strip("_")


def normalizar_id(valor: object) -> str:
    """Lleva un id del guion al patrón del esquema (minúsculas, sin tildes, snake_case)."""
    texto = str(valor).strip()
    limpio = re.sub(r"[^a-z0-9_]+", "_", quitar_acentos(texto).lower()).strip("_")
    limpio = re.sub(r"_+", "_", limpio)
    if limpio and not limpio[0].isalpha():
        limpio = "x_" + limpio
    return limpio[:64]


def es_id_valido(valor: str) -> bool:
    return bool(PATRON_ID.match(valor))


# --- Limpieza de Markdown ------------------------------------------------------------------------

_NEGRITA = re.compile(r"\*\*(.+?)\*\*", re.DOTALL)
_CURSIVA = re.compile(r"(?<![*\w])\*([^*\n]+?)\*(?![*\w])")
_ENLACE = re.compile(r"\[([^\]\n]*)\]\(([^)\n]*)\)")


def a_plano(texto: str) -> str:
    """Texto plano de una línea: sin Markdown, sin comillas invertidas, con espacios normalizados."""
    t = texto.replace("`", "")
    t = _ENLACE.sub(r"\1", t)
    t = _NEGRITA.sub(r"\1", t)
    t = _CURSIVA.sub(r"\1", t)
    t = t.replace("**", "")
    return re.sub(r"\s+", " ", t).strip()


def normalizar_espacios(texto: str) -> str:
    return re.sub(r"[ \t]+", " ", texto).strip()


_LISTA = re.compile(r"^(\s*)(?:[-*+]|\d{1,3}[.)])\s+\S")
_VALOR_CON_SIGNO = re.compile(r"^ {0,3}(?:>|[-+])\s*[\d≥≤<>=.,±~]")


def a_linea(texto: str) -> tuple[str, list[str]]:
    """Texto de una sola línea con énfasis y enlaces permitidos.

    Devuelve (texto, correcciones): las correcciones son avisos de lo que se cambió (para el
    informe). Quita las comillas invertidas, une saltos de línea y elimina un marcador de lista, de
    título o de cita al inicio (el orden lo da la posición del elemento, no un número).
    """
    correcciones: list[str] = []
    t = texto.replace("`", "")
    if "\n" in t.strip():
        t = re.sub(r"\s*\n\s*", " ", t.strip())
        correcciones.append("saltos de línea unidos en una sola línea")
    t = normalizar_espacios(t)
    if re.match(r"^ {0,3}#{1,6}(?:\s|$)", t):
        t = re.sub(r"^ {0,3}#{1,6}\s*", "", t)
        correcciones.append("marca de título '#' quitada del inicio")
    if _LISTA.match(t) and not _VALOR_CON_SIGNO.match(t):
        anterior = t
        t = re.sub(r"^\s*(?:[-*+]|\d{1,3}[.)])\s+", "", t)
        correcciones.append(f"marcador de lista quitado del inicio ({anterior[:12]!r})")
    if re.match(r"^ {0,3}>", t) and not _VALOR_CON_SIGNO.match(t):
        t = re.sub(r"^ {0,3}>\s*", "", t)
        correcciones.append("marca de cita '>' quitada del inicio")
    return t, correcciones


def capitalizar_primera(texto: str) -> str:
    """Pone en mayúscula la primera palabra si es una palabra corriente en minúscula ("cuando…").

    No toca siglas ni nombres con mayúsculas o dígitos internos ("pH", "mTOR", "sRANKL", "1α"), ni
    lo que empieza con un símbolo.
    """
    m = re.match(r"^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)", texto)
    if not m:
        return texto
    palabra = m.group(1)
    if not palabra[0].islower() or any(c.isupper() for c in palabra[1:]):
        return texto
    if texto[len(palabra) : len(palabra) + 1].isdigit():
        return texto
    return palabra[0].upper() + texto[1:]


def recortar_numeracion(texto: str) -> str:
    """Quita "1. " o "2) " del inicio: en un `ordenar` el orden lo da la posición."""
    return re.sub(r"^\s*\d{1,2}[.)]\s+", "", texto)


def primera_oracion(texto: str) -> str:
    """Primera oración (hasta el primer punto seguido de espacio y mayúscula, o el final)."""
    m = re.search(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡«\"'])", texto)
    return texto[: m.start()].strip() if m else texto.strip()


def dividir_oraciones(texto: str) -> list[str]:
    """Oraciones de un texto (corte tras . ! ? seguido de espacio y mayúscula, dígito o comilla)."""
    partes = re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡«\"'0-9])", texto.strip())
    return [p for p in partes if p]
