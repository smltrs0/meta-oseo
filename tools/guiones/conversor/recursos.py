"""Datos de apoyo del convertidor: ancla de los hotspots 3D, viewBox de los SVG y animaciones.

Ninguno de estos datos está en los guiones (los guiones describen QUÉ se muestra, no dónde ni con
qué geometría), así que aquí viven como tablas explícitas y revisables. Todo lo que se deduce de
ellos queda marcado en el informe del convertidor para que el docente o quien dibuja lo confirme.
"""

from __future__ import annotations

import re
from pathlib import Path

from .util import quitar_acentos

# --- viewBox -------------------------------------------------------------------------------------

# Cuando el SVG todavía no existe se usa este viewBox provisional (el de los SVG ya entregados);
# al regenerar con el SVG presente, el convertidor lee el viewBox real del archivo.
VIEWBOX_PROVISIONAL = {
    1: "0 0 800 600",
    2: "0 0 1000 900",
    3: "0 0 800 600",
    4: "0 0 800 600",
    5: "0 0 800 600",
    6: "0 0 800 600",
}

_VIEWBOX = re.compile(r'<svg\b[^>]*?\bviewBox\s*=\s*"([^"]+)"', re.IGNORECASE | re.DOTALL)


def viewbox_de_svg(raiz_web: Path, numero: int, id_svg: str) -> tuple[str, bool]:
    """(viewBox, es_real): el del archivo si existe y es entero, o el provisional del módulo."""
    archivo = raiz_web / "public" / "images" / f"m{numero}" / f"{id_svg}.svg"
    if archivo.is_file():
        m = _VIEWBOX.search(archivo.read_text(encoding="utf-8", errors="replace")[:4000])
        if m:
            partes = m.group(1).replace(",", " ").split()
            if len(partes) == 4 and all(re.fullmatch(r"\d+", p) for p in partes):
                return " ".join(partes), True
    return VIEWBOX_PROVISIONAL.get(numero, "0 0 800 600"), False


# --- Ancla de los hotspots de la mandíbula ---------------------------------------------------------

# La mandíbula del proyecto es UNA sola malla (BodyParts3D): sus zonas se marcan con `ancla`
# {x, y, z} en la caja envolvente (docs/content-schema.md, sección 9). Ejes del SUJETO: x 0 = su
# lado derecho y 1 = el izquierdo; y 0 = borde inferior y 1 = punta del cóndilo; z 0 = atrás y 1 =
# el mentón. Las estructuras pares se sitúan en el lado derecho del sujeto (x pequeña).
# PROVISIONAL: los guiones dicen «la posición exacta la fija quien modele la malla». Son
# posiciones razonables según la descripción anatómica del guion, para que la actividad funcione
# hoy; hay que ajustarlas al inspeccionar el modelo (F0-08/F1-12).
ANCLAS_MANDIBULA: dict[str, tuple[float, float, float]] = {
    "cuerpo": (0.20, 0.30, 0.60),
    "rama": (0.06, 0.55, 0.15),
    "angulo": (0.06, 0.10, 0.03),
    "condilo": (0.08, 0.98, 0.05),
    "cuello_condilo": (0.07, 0.88, 0.07),
    "apofisis_coronoides": (0.08, 0.95, 0.30),
    "escotadura_mandibular": (0.07, 0.82, 0.17),
    "sinfisis": (0.50, 0.35, 1.00),
    "foramen_mentoniano": (0.28, 0.35, 0.80),
    "agujero_mentoniano": (0.28, 0.35, 0.80),
    "foramen_mandibular": (0.14, 0.60, 0.17),
    "proceso_alveolar": (0.22, 0.50, 0.60),
    "apofisis_alveolar": (0.22, 0.50, 0.60),
    "cuerpo_molares": (0.13, 0.30, 0.35),
    "borde_basal": (0.20, 0.02, 0.55),
    "cortical_basal": (0.20, 0.05, 0.55),
    "cuerpo_mandibular_basal": (0.20, 0.12, 0.55),
    "lamina_dura": (0.24, 0.50, 0.55),
    "hueso_trabecular_cuerpo": (0.20, 0.30, 0.50),
    "cresta_alveolar": (0.25, 0.55, 0.60),
    "tabla_cortical_vestibular": (0.20, 0.40, 0.65),
    "tabla_cortical_lingual": (0.30, 0.40, 0.65),
    "septo_interdental": (0.25, 0.52, 0.60),
    "canino_zona_compresion": (0.36, 0.55, 0.96),
    "canino_zona_tension": (0.38, 0.55, 0.88),
    "linea_milohioidea": (0.28, 0.35, 0.50),
}

# Texto alternativo genérico del modelo (el guion no trae uno).
ALT_MODELO_3D = {
    "mandibula": "Modelo tridimensional de la mandíbula que se puede girar y acercar; sus zonas se tocan para leer su ficha.",
    "celulas": "Modelo tridimensional de las células óseas que se puede girar y acercar; cada célula se toca para leer su ficha.",
}

# --- Animación del efecto (arrastre molecular) -----------------------------------------------------

# Vocabulario cerrado del esquema. Cuando el guion no la da, se deduce del texto del efecto con
# estas reglas, en este orden; la primera que coincide gana. Se avisa en el informe.
_REGLAS_ANIMACION: list[tuple[str, tuple[str, ...]]] = [
    (
        "inhibicion",
        ("inhib", "frena", "neutraliza", "bloque", "impide", "captura", "secuestr", "sin llegar", "no llega"),
    ),
    ("mineralizacion", ("mineraliz", "cristal", "hidroxiapatita", "nucleacion")),
    ("reabsorcion", ("reabsor", "resorc", "disuelv", "digier", "degrada")),
    ("liberacion", ("libera", "secret", "expulsa", "exocitosis", "gránulos", "granulos")),
    (
        "transformacion",
        (
            "diferenci",
            "se fusion",
            "se convierte",
            "transforma",
            "madura",
            "compromete",
            "fundido",
            "cambia de",
            "pasa de",
        ),
    ),
    ("crecimiento", ("prolifera", "se divide", "crece", "aumenta el n", "multiplica")),
    ("cascada", ("cascada", "núcleo", "nucleo", "fosforila", "vía", "via ", "señal avanza")),
    ("activacion", ("activa", "estimula", "enciende", "se ilumina", "pulso")),
]


def inferir_animacion(*textos: str) -> str:
    plano = quitar_acentos(" ".join(textos)).lower()
    for animacion, claves in _REGLAS_ANIMACION:
        if any(quitar_acentos(c).lower() in plano for c in claves):
            return animacion
    return "union"
