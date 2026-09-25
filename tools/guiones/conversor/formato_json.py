"""Serialización JSON con el formato exacto que produce prettier (printWidth 100, sangría de 2).

El proyecto ejecuta `prettier --check .` en `apps/web` y eso incluye los `content.json`. Si el
convertidor los escribiera con `json.dumps(indent=2)`, `pnpm format:check` fallaría en los seis
módulos y cualquier `prettier --write` (por ejemplo de quien refina un módulo a mano) los reformatearía,
con lo que `convertir.py --comprobar` dejaría de servir para detectar cambios. Por eso el convertidor
escribe ya el formato de prettier:

  - Los objetos se escriben siempre expandidos (prettier conserva el salto tras «{»).
  - Un arreglo que contiene un objeto o un arreglo no vacío se expande, un elemento por línea.
  - Un arreglo de valores simples (textos, números, booleanos) se escribe en una línea si cabe en
    100 columnas, contando la sangría, la clave y la coma final; si no cabe, un elemento por línea.

Una prueba (tests/test_modulo.py) comprueba que `prettier --check` acepta la salida.
"""

from __future__ import annotations

import json
from typing import Any

ANCHO = 100
SANGRIA = "  "


def _simple(valor: Any) -> str:
    return json.dumps(valor, ensure_ascii=False)


def _es_compuesto_no_vacio(valor: Any) -> bool:
    return isinstance(valor, (dict, list)) and len(valor) > 0


def _formatear(valor: Any, nivel: int, columna: int, coma: bool) -> str:
    """`columna` es la columna donde empieza el valor en su línea; `coma` si le sigue una coma."""
    if isinstance(valor, dict):
        if not valor:
            return "{}"
        interior = SANGRIA * (nivel + 1)
        partes = []
        items = list(valor.items())
        for i, (clave, v) in enumerate(items):
            prefijo = f"{interior}{_simple(clave)}: "
            partes.append(prefijo + _formatear(v, nivel + 1, len(prefijo), i < len(items) - 1))
        return "{\n" + ",\n".join(partes) + "\n" + SANGRIA * nivel + "}"
    if isinstance(valor, list):
        if not valor:
            return "[]"
        if not any(_es_compuesto_no_vacio(v) for v in valor):
            plano = "[" + ", ".join(_simple(v) for v in valor) + "]"
            if columna + len(plano) + (1 if coma else 0) <= ANCHO:
                return plano
        interior = SANGRIA * (nivel + 1)
        partes = []
        for i, v in enumerate(valor):
            partes.append(interior + _formatear(v, nivel + 1, len(interior), i < len(valor) - 1))
        return "[\n" + ",\n".join(partes) + "\n" + SANGRIA * nivel + "]"
    return _simple(valor)


def dumps_prettier(valor: Any) -> str:
    """JSON formateado como prettier, con salto de línea final."""
    return _formatear(valor, 0, 0, False) + "\n"
