"""Comprobación de cobertura: todo el texto del «Contenido» de una sección debe estar en sus bloques.

El convertidor parte, une y reordena texto (tablas a listas, avisos a bloques...), pero no debe
perder ni una palabra. Esta comprobación compara, por sección, el conjunto de palabras del
contenido del guion con el de los bloques generados. Sirve de red de seguridad contra
regresiones del convertidor y contra formatos de guion que aún no conoce.

Se ignoran las marcas [verificar] (que se quitan a propósito), las etiquetas de los avisos
(«Clinico:», que pasan al campo `variante`), la nota «(profundización para posgrado)» y el
título «Para profundizar (plegable; no se evalúa)» (que pasan al campo `nivel`) y las imágenes
(que pasan a un bloque `imagen` con su texto alternativo).
"""

from __future__ import annotations

import re
from collections import Counter

from .util import quitar_acentos


def _palabras(texto: str) -> Counter[str]:
    t = re.sub(r"\[\s*verificar[^\]]*\]", "", texto, flags=re.IGNORECASE)
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", t)
    t = re.sub(r"(?im)^\s*>\s*(cl[ií]nico|dato|atenci[oó]n|recuerda)\s*:", "", t)
    t = re.sub(r"\(profundizaci[oó]n para posgrado\)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"para profundizar \(plegable; no se eval[uú]a\)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"para quien quiera profundizar", "", t, flags=re.IGNORECASE)
    return Counter(re.findall(r"[a-z0-9]+", quitar_acentos(t).lower()))


def _texto_de_bloque(bloque: dict) -> str:
    tipo = bloque["tipo"]
    if tipo in ("texto", "callout"):
        return f"{bloque.get('titulo', '')} {bloque['markdown']}"
    if tipo == "tabla":
        filas = " ".join(f"{f['criterio']} {' '.join(f['celdas'])}" for f in bloque["filas"])
        return f"{bloque['titulo']} {bloque.get('encabezado_criterio', '')} {' '.join(bloque['columnas'])} {filas}"
    return ""


def palabras_perdidas(contenido: str, bloques: list[dict]) -> dict[str, int]:
    """Palabras del contenido del guion que no están en los bloques (vacío si no se perdió nada).

    Los bloques de contexto de una actividad (`*_contexto`) no cuentan: su texto viene de las
    instrucciones, no del contenido.
    """
    esperadas = _palabras(contenido)
    presentes = _palabras(
        " ".join(_texto_de_bloque(b) for b in bloques if b["tipo"] != "actividad" and not b["id"].endswith("_contexto"))
    )
    faltan = esperadas - presentes
    return dict(faltan.most_common(12))
