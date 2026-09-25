"""Estado compartido de la conversión de UN módulo: informe, ids usados y pendientes de revisión."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .informe import Informe
from .lector import Guion
from .util import contiene_marca, fragmentos_con_marca, normalizar_id, quitar_acentos, quitar_marcas

# Límite de `estado_revision.pendientes` en el esquema.
MAX_PENDIENTES = 250
# La nota de un pendiente es texto plano de 5 a 300 caracteres.
MAX_NOTA = 300


@dataclass
class Contexto:
    guion: Guion
    informe: Informe
    # Ids de alcance módulo ya ocupados (secciones, bloques, actividades, capas, moléculas, preguntas).
    ids: set[str] = field(default_factory=set)
    # (id del elemento, fragmento de la frase que llevaba la marca [verificar]).
    marcas: list[tuple[str, str]] = field(default_factory=list)
    # Ids de alcance módulo declarados por elementos del guion: {id: «tipo en ubicación»}.
    declarados: dict[str, str] = field(default_factory=dict)
    # Capas que usan varias ilustraciones: {id de capa: ilustración que conserva el id}.
    propietario_capa: dict[str, str] = field(default_factory=dict)
    # Texto que no cupo en las instrucciones de una actividad: {id de actividad: texto}.
    texto_previo: dict[str, str] = field(default_factory=dict)
    # Carpeta apps/web (para leer el viewBox de los SVG que ya existen).
    raiz_web: Path = field(default_factory=Path)
    numero: int = 0

    def __post_init__(self) -> None:
        self.numero = self.guion.numero
        self._vocabulario: dict[str, str] | None = None

    def con_tildes(self, palabra: str) -> str:
        """La forma con tildes que el propio guion usa para `palabra` (la más frecuente); si el
        guion no la escribe con tildes, la misma palabra. Sirve para conceptos escritos como id."""
        if self._vocabulario is None:
            cuentas: dict[str, dict[str, int]] = {}
            for w in re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}", self.guion.texto):
                clave = quitar_acentos(w).lower()
                cuentas.setdefault(clave, {})
                cuentas[clave][w.lower()] = cuentas[clave].get(w.lower(), 0) + 1
            self._vocabulario = {}
            for clave, formas in cuentas.items():
                # Prefiere una forma con tildes; entre varias, la más frecuente y luego la alfabética.
                con = {f: n for f, n in formas.items() if f != clave}
                pool = con or formas
                self._vocabulario[clave] = sorted(pool.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        return self._vocabulario.get(palabra.lower(), palabra)

    @property
    def archivo(self) -> str:
        return self.guion.archivo

    def donde(self, linea: int | None = None, *partes: str) -> str:
        """Ubicación legible: `archivo:línea · parte · parte`."""
        base = self.archivo if linea is None else f"{self.archivo}:{linea}"
        return " · ".join([base, *[p for p in partes if p]])

    # --- ids -------------------------------------------------------------------------------------

    def reservar(self, ident: str) -> None:
        self.ids.add(ident)

    def nuevo_id(self, base: str) -> str:
        """Id único en el módulo a partir de `base` (se añade _2, _3... si hace falta)."""
        base = normalizar_id(base)[:56] or "x"
        candidato = base
        n = 2
        while candidato in self.ids:
            candidato = f"{base}_{n}"
            n += 1
        self.ids.add(candidato)
        return candidato

    def declarar(self, ident: str, donde: str, tipo: str) -> None:
        """Registra un id de alcance módulo (sección, actividad, capa, molécula, pregunta) y avisa
        con las dos ubicaciones si ya lo usa otro elemento."""
        previo = self.declarados.get(ident)
        if previo is not None:
            self.informe.revisar(
                donde,
                f"id duplicado «{ident}» ({tipo}): ya lo usa {previo}. Los ids de sección, bloque, "
                "actividad, capa, molécula y pregunta no se repiten en un módulo",
            )
        else:
            self.declarados[ident] = f"{tipo} en {donde}"
        self.ids.add(ident)

    # --- marcas [verificar] ----------------------------------------------------------------------

    def depurar(self, texto: str, id_elemento: str) -> str:
        """Quita las marcas [verificar] del texto y anota la duda para el docente."""
        if not isinstance(texto, str) or not contiene_marca(texto):
            return texto
        for fragmento in fragmentos_con_marca(texto):
            self.marcas.append((id_elemento, fragmento))
        return quitar_marcas(texto)

    def extraer(self, texto: str) -> tuple[str, list[str]]:
        """Como `depurar`, pero devuelve las dudas en lugar de anotarlas (aún no se sabe el id)."""
        if not isinstance(texto, str) or not contiene_marca(texto):
            return texto, []
        return quitar_marcas(texto), fragmentos_con_marca(texto)

    def marcar(self, id_elemento: str, fragmentos: list[str]) -> None:
        for fragmento in fragmentos:
            self.marcas.append((id_elemento, fragmento))

    def pendientes(self) -> list[dict[str, str]]:
        """Pendientes para `estado_revision.pendientes`: uno por marca, o uno por elemento si son
        demasiados para el límite del esquema."""
        ordenados = [{"id": ident, "nota": _nota(fragmento)} for ident, fragmento in self.marcas if ident]
        if len(ordenados) <= MAX_PENDIENTES:
            return ordenados
        # Demasiados: se agrupan las notas de un mismo elemento en una sola.
        por_id: dict[str, list[str]] = {}
        for ident, fragmento in self.marcas:
            por_id.setdefault(ident, []).append(fragmento)
        return [
            {"id": ident, "nota": _nota(" / ".join(fragmentos), varios=len(fragmentos))}
            for ident, fragmentos in por_id.items()
        ]


def _nota(fragmento: str, varios: int = 1) -> str:
    """Nota plana (5 a 300 caracteres) que dice qué confirmar."""
    prefijo = "Confirmar: " if varios == 1 else f"Confirmar {varios} datos: "
    cuerpo = fragmento.replace("**", "").strip()
    limite = MAX_NOTA - len(prefijo) - 2
    if len(cuerpo) > limite:
        cuerpo = "…" + cuerpo[-(limite - 1) :].lstrip()
    return f"{prefijo}«{cuerpo}»"
