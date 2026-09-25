"""Informe del convertidor: todo lo que el convertidor decidió, corrigió u omitió, con su ubicación.

Regla de oro: nada se descarta ni se decide en silencio. Cada entrada lleva la ubicación exacta
(archivo del guion, línea, actividad y campo) para que quien refine el módulo sepa dónde mirar.

Niveles:
  - REVISAR:   el convertidor no pudo decidir con seguridad (texto que excede un límite, dato que
               falta, id repetido...). El valor se emite tal cual y el esquema lo marcará; hay que
               resolverlo a mano o con el docente.
  - CORREGIDO: el convertidor aplicó una regla determinista y segura (quitar una marca [verificar],
               normalizar un id, quitar un marcador de lista...). Se lista para poder auditarlo.
  - OMITIDO:   un dato del guion que el esquema no tiene dónde guardar (por ejemplo `interaccion`
               o `zona_anatomica`). Se agrupa por tipo de campo.
"""

from __future__ import annotations

import re
from collections import OrderedDict
from dataclasses import dataclass, field

REVISAR = "revisar"
CORREGIDO = "corregido"
OMITIDO = "omitido"
NIVELES = (REVISAR, CORREGIDO, OMITIDO)


def _plantilla(mensaje: str) -> str:
    """Mensaje sin sus partes variables (texto entre « », cifras), para agruparlo en el resumen."""
    p = re.sub(r"«[^»]*»", "«…»", mensaje)
    p = re.sub(r"\(.*?\)", "(…)", p) if "(" in p and len(p) > 90 else p
    return re.sub(r"\d+(?:[.,]\d+)?", "N", p)[:140]


@dataclass(frozen=True)
class Entrada:
    nivel: str
    donde: str
    mensaje: str
    # Clave de agrupación (por ejemplo el nombre del campo omitido); vacía si no se agrupa.
    clave: str = ""


@dataclass
class Informe:
    entradas: list[Entrada] = field(default_factory=list)

    def _agregar(self, nivel: str, donde: str, mensaje: str, clave: str = "") -> None:
        entrada = Entrada(nivel, donde, mensaje, clave)
        if entrada not in self.entradas:
            self.entradas.append(entrada)

    def revisar(self, donde: str, mensaje: str) -> None:
        self._agregar(REVISAR, donde, mensaje)

    def corregido(self, donde: str, mensaje: str) -> None:
        self._agregar(CORREGIDO, donde, mensaje)

    def omitido(self, donde: str, campo: str, mensaje: str = "") -> None:
        self._agregar(OMITIDO, donde, mensaje or f"campo «{campo}» sin lugar en el esquema", campo)

    def de_nivel(self, nivel: str) -> list[Entrada]:
        return [e for e in self.entradas if e.nivel == nivel]

    def texto(self, detalle_corregido: bool = False) -> str:
        """Informe en texto plano, estable (mismo orden que la conversión)."""
        lineas: list[str] = []
        revisar = self.de_nivel(REVISAR)
        lineas.append(f"A REVISAR (el convertidor no pudo decidir): {len(revisar)}")
        lineas.extend(f"  - {e.donde}: {e.mensaje}" for e in revisar)

        corregidos = self.de_nivel(CORREGIDO)
        lineas.append(f"CORREGIDO AUTOMÁTICAMENTE (reglas deterministas): {len(corregidos)}")
        if detalle_corregido:
            lineas.extend(f"  - {e.donde}: {e.mensaje}" for e in corregidos)
        else:
            resumen: OrderedDict[str, int] = OrderedDict()
            for e in corregidos:
                plantilla = _plantilla(e.mensaje)
                resumen[plantilla] = resumen.get(plantilla, 0) + 1
            lineas.extend(f"  - {n} x {m}" for m, n in resumen.items())

        omitidos = self.de_nivel(OMITIDO)
        lineas.append(f"OMITIDO (sin lugar en el esquema): {len(omitidos)}")
        por_campo: OrderedDict[str, list[str]] = OrderedDict()
        for e in omitidos:
            por_campo.setdefault(e.clave or e.mensaje, []).append(e.donde)
        for campo, donde in por_campo.items():
            muestra = ", ".join(donde[:3]) + (f" y {len(donde) - 3} más" if len(donde) > 3 else "")
            lineas.append(f"  - «{campo}» en {len(donde)} sitio(s): {muestra}")
        return "\n".join(lineas)
