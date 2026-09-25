"""Convierte el «#### Contenido» de una sección del guion en bloques del esquema.

Un contenido mezcla párrafos, listas, títulos en negrita (`**Un tejido dinámico**`), tablas,
avisos (`> Clinico: ...`) e imágenes (`![alt](id_svg)`). Cada uno pasa a su bloque:

  - texto: los párrafos y listas entre dos elementos especiales. Un título en negrita solo en su
    línea abre un bloque nuevo y pasa a ser su `titulo`. Un bloque se parte solo en el límite entre
    párrafos (o entre oraciones si un solo párrafo supera el límite del esquema).
  - callout: cada aviso; la etiqueta (Clinico, Dato, Atencion, Recuerda, con o sin tilde) da la
    variante.
  - tabla: cada tabla Markdown. Una de dos columnas (criterio y valor, sin nada que comparar) no
    cabe en el bloque `tabla` (que compara al menos dos elementos): se convierte en lista.
  - imagen: cada `![alt](id)`; el `src` es `/images/m{n}/{id}.svg`.

Nunca se resume ni se reescribe: solo se parte, se limpia el Markdown y se quitan las marcas
[verificar] (que pasan a `estado_revision.pendientes`, con el id del bloque donde estaban).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .contexto import Contexto
from .lector import celdas_de_tabla, es_fila_tabla, es_separador_tabla
from .util import a_linea, a_plano, capitalizar_primera, dividir_oraciones, normalizar_id, quitar_acentos, slug

# Límites del esquema (schema.ts).
MAX_TEXTO = 2500
OBJETIVO_TEXTO = 1800  # se empaqueta hasta aquí para no pasar de 15 bloques por sección
MIN_TEXTO = 20
MAX_CALLOUT = 900
MAX_TABLA_FILAS = 12
MAX_BLOQUES_SECCION = 15

_IMAGEN = re.compile(r"^\s*!\[(.*?)\]\(([^)\s]+)\)\s*$")
_TITULO_NEGRITA = re.compile(r"^\s*\*\*([^*\n]+?)\*\*\s*[:.]?\s*$")
_TITULO_MD = re.compile(r"^\s*#{3,4}\s+(.+?)\s*$")
_LISTA = re.compile(r"^(\s*)(?:[-*+]|\d{1,3}[.)])\s+\S")
_VALOR_CON_SIGNO = re.compile(r"^ {0,3}(?:>|[-+])\s*[\d≥≤<>=.,±~]")
_AVISO = re.compile(r"^(cl[ií]nico|dato|atenci[oó]n|recuerda)\s*:\s*(.*)$", re.IGNORECASE | re.DOTALL)
_PROFUNDIZAR_PARENTESIS = re.compile(
    r"\s*\((?:profundizaci[oó]n para posgrado|para posgrado|profundizaci[oó]n)\)", re.IGNORECASE
)
_PROFUNDIZAR_INICIO = re.compile(r"^para quien quiera profundizar\s*[:.]?\s*", re.IGNORECASE)


def _es_lista(linea: str) -> bool:
    return bool(_LISTA.match(linea)) and not _VALOR_CON_SIGNO.match(linea)


def _es_cita(linea: str) -> bool:
    return linea.lstrip().startswith(">") and not _VALOR_CON_SIGNO.match(linea)


# --- Elementos ---------------------------------------------------------------------------------


@dataclass
class Elemento:
    tipo: str  # 'parrafo' | 'lista' | 'titulo' | 'imagen' | 'tabla' | 'aviso'
    texto: str = ""
    lineas: list[str] = field(default_factory=list)
    linea: int = 0  # línea del guion donde empieza
    marcas: list[str] = field(default_factory=list)  # dudas [verificar] que llevaba el elemento


def tokenizar(contenido: str, linea_base: int) -> list[Elemento]:
    lineas = contenido.split("\n")
    elementos: list[Elemento] = []
    i = 0
    n = len(lineas)
    while i < n:
        linea = lineas[i]
        if not linea.strip():
            i += 1
            continue
        pos = linea_base + i
        m_img = _IMAGEN.match(linea)
        if m_img:
            elementos.append(Elemento("imagen", texto=m_img.group(1), lineas=[m_img.group(2)], linea=pos))
            i += 1
            continue
        if es_fila_tabla(linea):
            fin = i
            while fin < n and es_fila_tabla(lineas[fin]):
                fin += 1
            elementos.append(Elemento("tabla", lineas=lineas[i:fin], linea=pos))
            i = fin
            continue
        if _es_cita(linea):
            fin = i
            while fin < n and lineas[fin].lstrip().startswith(">"):
                fin += 1
            elementos.append(Elemento("aviso", lineas=lineas[i:fin], linea=pos))
            i = fin
            continue
        m_t = _TITULO_NEGRITA.match(linea) or _TITULO_MD.match(linea)
        if m_t:
            elementos.append(Elemento("titulo", texto=m_t.group(1).strip(), linea=pos))
            i += 1
            continue
        if _es_lista(linea):
            items: list[str] = []
            fin = i
            while fin < n and lineas[fin].strip():
                actual = lineas[fin]
                if _es_lista(actual):
                    items.append(actual)
                elif actual.startswith("  ") and items:
                    items[-1] = items[-1].rstrip() + " " + actual.strip()  # continuación del ítem
                else:
                    break
                fin += 1
            elementos.append(Elemento("lista", lineas=items, linea=pos))
            i = fin
            continue
        # Párrafo: líneas seguidas que no son de otro tipo.
        fin = i
        partes: list[str] = []
        while fin < n and lineas[fin].strip():
            actual = lineas[fin]
            if fin > i and (
                _IMAGEN.match(actual)
                or es_fila_tabla(actual)
                or _es_cita(actual)
                or _es_lista(actual)
                or _TITULO_NEGRITA.match(actual)
            ):
                break
            partes.append(actual.strip())
            fin += 1
        elementos.append(Elemento("parrafo", texto=" ".join(partes), linea=pos))
        i = fin
    return elementos


# --- Limpieza de texto ---------------------------------------------------------------------------


def _limpiar_parrafo(texto: str) -> str:
    return re.sub(r"[ \t]+", " ", texto.replace("`", "")).strip()


def _limpiar_multilinea(texto: str) -> str:
    return "\n".join(_limpiar_parrafo(linea) for linea in texto.split("\n"))


def _lista_a_texto(lineas: list[str], ctx: Contexto, donde: str) -> str:
    salida: list[str] = []
    aplanada = False
    for linea in lineas:
        m = re.match(r"^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$", linea)
        if not m:
            continue
        if len(m.group(1)) >= 2:
            aplanada = True
        marca = "-" if m.group(2) in ("-", "*", "+") else m.group(2)
        salida.append(f"{marca} {_limpiar_parrafo(m.group(3))}")
    if aplanada:
        ctx.informe.corregido(donde, "lista anidada aplanada a lista plana")
    return "\n".join(salida)


def _partir_parrafo_largo(parrafo: str, maximo: int) -> list[str]:
    """Parte un párrafo que no cabe en el límite, en el límite entre oraciones."""
    trozos: list[str] = []
    actual = ""
    for oracion in dividir_oraciones(parrafo):
        if actual and len(actual) + 1 + len(oracion) > maximo:
            trozos.append(actual)
            actual = oracion
        else:
            actual = f"{actual} {oracion}".strip()
    if actual:
        trozos.append(actual)
    return trozos


# --- Constructor de bloques ----------------------------------------------------------------------


class _Constructor:
    """Acumula elementos y produce los bloques de una sección."""

    def __init__(self, ctx: Contexto, seccion_id: str, seccion_titulo: str) -> None:
        self.ctx = ctx
        self.seccion_id = seccion_id
        self.base_id = re.sub(r"^m\d+_\d+_", "", seccion_id) or slug(seccion_titulo)
        self.bloques: list[dict] = []
        self.titulo: str | None = None
        self.nivel: str | None = None
        self.linea_titulo = 0
        self.buffer: list[tuple[str, list[str]]] = []  # (texto, dudas [verificar])
        self.linea_buffer = 0

    def donde(self, linea: int, extra: str = "") -> str:
        return self.ctx.donde(linea, f"sección {self.seccion_id}", extra)

    def _con_nivel(self, bloque: dict) -> dict:
        if self.nivel:
            bloque["nivel"] = self.nivel
        return bloque

    # -- texto --
    def agregar_chunk(self, texto: str, linea: int, marcas: list[str] | None = None) -> None:
        if not self.buffer:
            self.linea_buffer = linea
        self.buffer.append((texto, marcas or []))

    def volcar_texto(self) -> None:
        if not self.buffer:
            return
        chunks = self.buffer
        titulo = self.titulo
        self.buffer = []
        self.titulo = None
        # Se parten los párrafos que exceden el máximo por sí solos.
        trozos: list[tuple[str, list[str]]] = []
        for chunk, marcas in chunks:
            if len(chunk) > MAX_TEXTO:
                partes = _partir_parrafo_largo(chunk, MAX_TEXTO - 100)
                self.ctx.informe.corregido(
                    self.donde(self.linea_buffer),
                    f"párrafo de {len(chunk)} caracteres partido por oraciones en {len(partes)} bloques",
                )
                trozos.extend((p, marcas if k == 0 else []) for k, p in enumerate(partes))
            else:
                trozos.append((chunk, marcas))
        # Empaquetado voraz: se llena cada bloque hasta OBJETIVO_TEXTO.
        paquetes: list[tuple[str, list[str]]] = []
        actual = ""
        marcas_actual: list[str] = []
        for trozo, marcas in trozos:
            if actual and len(actual) + 2 + len(trozo) > OBJETIVO_TEXTO:
                paquetes.append((actual, marcas_actual))
                actual, marcas_actual = trozo, list(marcas)
            else:
                actual = f"{actual}\n\n{trozo}" if actual else trozo
                marcas_actual = marcas_actual + list(marcas)
        if actual:
            paquetes.append((actual, marcas_actual))
        # Un último paquete demasiado corto se une al anterior.
        if len(paquetes) > 1 and len(paquetes[-1][0]) < MIN_TEXTO:
            (t1, m1), (t2, m2) = paquetes[-2], paquetes[-1]
            paquetes[-2] = (f"{t1}\n\n{t2}", m1 + m2)
            paquetes.pop()
        for k, (markdown, marcas) in enumerate(paquetes):
            base = f"t_{slug(titulo, 40)}" if (titulo and k == 0) else f"t_{self.base_id}"
            bloque: dict = {"id": self.ctx.nuevo_id(base), "tipo": "texto"}
            if titulo and k == 0:
                bloque["titulo"] = titulo
            bloque["markdown"] = markdown
            self.bloques.append(self._con_nivel(bloque))
            self.ctx.marcar(bloque["id"], marcas)

    # -- títulos --
    def titulo_nuevo(self, texto: str, linea: int) -> None:
        self.volcar_texto()
        if self.titulo:
            self.ctx.informe.revisar(
                self.donde(self.linea_titulo), f"título «{self.titulo}» sin contenido a continuación"
            )
        titulo = a_plano(texto).rstrip(":.").strip()
        self.nivel = None
        if quitar_acentos(titulo).lower().startswith("para profundizar"):
            titulo = "Para profundizar"
            self.nivel = "posgrado"
            self.ctx.informe.corregido(
                self.donde(linea), "bloque «Para profundizar» marcado con nivel posgrado (profundización)"
            )
        if len(titulo) > 80:
            self.ctx.informe.revisar(self.donde(linea), f"título de más de 80 caracteres: «{titulo}»")
        self.titulo = titulo
        self.linea_titulo = linea

    # -- tablas --
    def tabla(self, el: Elemento) -> None:
        self.volcar_texto()
        titulo_tabla = self.titulo
        self.titulo = None
        filas: list[list[str]] = []
        for linea in el.lineas:
            celdas = celdas_de_tabla(linea)
            if es_separador_tabla(celdas):
                continue
            filas.append(celdas)
        donde = self.donde(el.linea, "tabla")
        if len(filas) < 2:
            self.ctx.informe.revisar(donde, "tabla sin filas de datos")
            return
        cabecera, datos = filas[0], filas[1:]
        ancho = len(cabecera)
        for k, fila in enumerate(datos):
            if len(fila) != ancho:
                self.ctx.informe.revisar(donde, f"la fila {k + 1} tiene {len(fila)} celdas y la cabecera {ancho}")
                fila.extend([""] * (ancho - len(fila)))
                del fila[ancho:]
        # Tabla de criterio y valor (dos columnas): no hay nada que comparar, pasa a lista.
        if ancho < 3:
            self._tabla_como_lista(cabecera, datos, titulo_tabla, el)
            return
        columnas = [a_plano(c) for c in cabecera[1:]]
        criterio_cab = a_plano(cabecera[0])
        motivo = _motivo_no_cabe(columnas, datos)
        if motivo:
            self._tabla_como_lista_larga(cabecera, datos, titulo_tabla, el, motivo)
            return
        titulo = titulo_tabla or _titulo_de_respaldo(criterio_cab, columnas)
        partes = [datos[k : k + MAX_TABLA_FILAS] for k in range(0, len(datos), MAX_TABLA_FILAS)]
        if len(partes) > 1:
            self.ctx.informe.corregido(donde, f"tabla de {len(datos)} filas partida en {len(partes)} tablas")
        for k, parte in enumerate(partes):
            rotulo = titulo if len(partes) == 1 else f"{titulo} (parte {k + 1} de {len(partes)})"
            ident = self.ctx.nuevo_id(f"tb_{slug(titulo, 40)}")
            bloque: dict = {"id": ident, "tipo": "tabla", "titulo": rotulo[:100]}
            if criterio_cab:
                bloque["encabezado_criterio"] = criterio_cab
            bloque["columnas"] = columnas
            bloque["filas"] = [{"criterio": a_plano(f[0]) or "—", "celdas": [_celda(c) for c in f[1:]]} for f in parte]
            self.bloques.append(self._con_nivel(bloque))
            self.ctx.marcar(ident, el.marcas if k == 0 else [])

    def _tabla_como_lista_larga(
        self, cabecera: list[str], datos: list[list[str]], titulo: str | None, el: Elemento, motivo: str
    ) -> None:
        """Tabla que no cabe en el esquema (celda o criterio demasiado largo, demasiadas columnas):
        cada fila pasa a un párrafo en negrita con una lista de sus valores. No se pierde nada."""
        self.ctx.informe.corregido(
            self.donde(el.linea, "tabla"),
            f"tabla convertida en lista porque no cabe en el bloque «tabla» ({motivo}); no se pierde texto",
        )
        if titulo is not None:
            self.titulo = titulo
        columnas = [a_plano(c) for c in cabecera[1:]]
        for k, fila in enumerate(datos):
            criterio = a_plano(fila[0]) or "—"
            rotulo = f"{a_plano(cabecera[0])}: {criterio}" if a_plano(cabecera[0]) else criterio
            self.agregar_chunk(f"**{rotulo}**", el.linea, el.marcas if k == 0 else [])
            items = [f"- **{col}:** {_celda(c)}" for col, c in zip(columnas, fila[1:], strict=False)]
            self.agregar_chunk("\n".join(items), el.linea)

    def _tabla_como_lista(self, cabecera: list[str], datos: list[list[str]], titulo: str | None, el: Elemento) -> None:
        """Tabla de dos columnas: no hay elementos que comparar, pasa a texto sin perder nada.
        Si sus encabezados son frases largas o hay celdas vacías, son DOS LISTAS independientes
        (cada columna es un grupo: se escribe cada encabezado en negrita y debajo sus elementos);
        si no, es una lista de criterio y valor («- **criterio:** valor»)."""
        donde = self.donde(el.linea, "tabla")
        encabezados = [a_plano(c) for c in cabecera]
        dos_listas = any(not (f[0].strip() and f[1].strip()) for f in datos) or all(len(h) > 30 for h in encabezados)
        if titulo is not None:
            self.titulo = titulo
        if dos_listas:
            self.ctx.informe.corregido(donde, "tabla de dos columnas independientes convertida en dos listas")
            for k in range(2):
                items = [f"- {_celda(f[k])}" for f in datos if f[k].strip()]
                self.agregar_chunk(f"**{encabezados[k] or '—'}**", el.linea, el.marcas if k == 0 else [])
                self.agregar_chunk("\n".join(items), el.linea)
            return
        self.ctx.informe.corregido(
            donde, "tabla de dos columnas (criterio y valor) convertida en lista: no hay elementos que comparar"
        )
        if any(encabezados):
            rotulo = " y ".join(f"**{h}**" for h in encabezados if h)
            self.agregar_chunk(f"{rotulo}:", el.linea, el.marcas)
            marcas: list[str] = []
        else:
            marcas = el.marcas
        items = []
        for fila in datos:
            criterio = a_plano(fila[0]).rstrip(":").strip()
            valor = _limpiar_parrafo(fila[1]) if len(fila) > 1 else ""
            items.append(f"- **{criterio}:** {valor}" if criterio else f"- {valor}")
        self.agregar_chunk("\n".join(items), el.linea, marcas)

    # -- imágenes --
    def imagen(self, el: Elemento) -> None:
        self.volcar_texto()
        alt = a_plano(el.texto)
        ident_svg = el.lineas[0]
        ruta = ident_svg if ident_svg.startswith("/") else f"/images/m{self.ctx.numero}/{ident_svg}"
        if not re.search(r"\.(svg|webp|png|jpg|jpeg|avif)$", ruta):
            ruta += ".svg"
        if len(alt) < 10:
            self.ctx.informe.revisar(
                self.donde(el.linea, "imagen"), f"el texto alternativo «{alt}» es demasiado corto (mínimo 10)"
            )
        # El guion solo trae una descripción por figura: sirve de texto alternativo y de pie.
        pie = alt if alt.endswith(".") else alt + "."
        ident = self.ctx.nuevo_id("i_" + re.sub(r"^m\d+_", "", normalizar_id(ident_svg)))
        self.bloques.append(self._con_nivel({"id": ident, "tipo": "imagen", "src": ruta, "alt": alt, "pie": pie}))

    # -- avisos --
    def aviso(self, el: Elemento) -> None:
        self.volcar_texto()
        titulo_pendiente = self.titulo
        self.titulo = None
        donde = self.donde(el.linea, "aviso")
        # Se quita el «>» y se conservan los párrafos (una línea «>» vacía separa párrafos).
        partes: list[str] = []
        actual: list[str] = []
        for linea in el.lineas:
            cuerpo = re.sub(r"^\s*>\s?", "", linea)
            if not cuerpo.strip():
                if actual:
                    partes.append(" ".join(actual))
                    actual = []
            elif _es_lista(cuerpo):
                if actual:
                    partes.append(" ".join(actual))
                    actual = []
                partes.append(cuerpo.strip())
            else:
                actual.append(cuerpo.strip())
        if actual:
            partes.append(" ".join(actual))
        texto = "\n\n".join(partes)
        m = _AVISO.match(texto)
        if not m:
            self.ctx.informe.revisar(
                donde, f"aviso sin etiqueta reconocible (Clinico/Dato/Atencion/Recuerda): «{texto[:50]}»"
            )
            self.agregar_chunk(_limpiar_multilinea(texto), el.linea, el.marcas)
            return
        variante = quitar_acentos(m.group(1)).lower()
        # El guion escribe «Dato: el hueso...»: tras quitar la etiqueta, la frase empieza en mayúscula.
        cuerpo = capitalizar_primera(m.group(2).strip())
        titulo: str | None = None
        nivel = self.nivel
        if _PROFUNDIZAR_PARENTESIS.search(cuerpo):
            cuerpo = _PROFUNDIZAR_PARENTESIS.sub("", cuerpo).strip()
            nivel = "posgrado"
            self.ctx.informe.corregido(
                donde, "aviso de profundización para posgrado: nivel posgrado y sin la nota entre paréntesis"
            )
        elif _PROFUNDIZAR_INICIO.match(cuerpo):
            cuerpo = _PROFUNDIZAR_INICIO.sub("", cuerpo, count=1).strip()
            cuerpo = cuerpo[:1].upper() + cuerpo[1:]
            titulo = "Para quien quiera profundizar"
            nivel = "posgrado"
            self.ctx.informe.corregido(donde, "aviso «para quien quiera profundizar»: nivel posgrado con ese título")
        if titulo is None and titulo_pendiente:
            if len(titulo_pendiente) <= 60:
                titulo = titulo_pendiente
            else:
                self.ctx.informe.revisar(
                    donde, f"título «{titulo_pendiente}» perdido antes de un aviso (más de 60 caracteres)"
                )
        for k, pieza in enumerate(self._partir_aviso(cuerpo, donde)):
            ident = self.ctx.nuevo_id(f"c_{variante}_{slug(pieza, 26)}")
            bloque: dict = {"id": ident, "tipo": "callout", "variante": variante}
            if titulo and k == 0:
                bloque["titulo"] = titulo
            bloque["markdown"] = _limpiar_multilinea(pieza)
            if nivel:
                bloque["nivel"] = nivel
            self.bloques.append(bloque)
            self.ctx.marcar(ident, el.marcas if k == 0 else [])

    def _partir_aviso(self, cuerpo: str, donde: str) -> list[str]:
        if len(cuerpo) <= MAX_CALLOUT:
            return [cuerpo]
        paquetes: list[str] = []
        actual = ""
        for p in cuerpo.split("\n\n"):
            if actual and len(actual) + 2 + len(p) > MAX_CALLOUT:
                paquetes.append(actual)
                actual = p
            else:
                actual = f"{actual}\n\n{p}" if actual else p
        if actual:
            paquetes.append(actual)
        if any(len(p) > MAX_CALLOUT for p in paquetes):
            self.ctx.informe.revisar(
                donde, f"aviso de {len(cuerpo)} caracteres con un párrafo que no cabe en el máximo de {MAX_CALLOUT}"
            )
        elif len(paquetes) > 1:
            self.ctx.informe.corregido(donde, f"aviso de {len(cuerpo)} caracteres partido en {len(paquetes)} avisos")
        return paquetes


def _celda(texto: str) -> str:
    limpio, _ = a_linea(texto)
    return limpio if limpio else "—"


def _titulo_de_respaldo(criterio: str, columnas: list[str]) -> str:
    """Nombre accesible de una tabla que el guion no titula: sus encabezados."""
    partes = [p for p in [criterio, *columnas] if p]
    titulo = "Tabla: " + ", ".join(partes)
    if len(titulo) > 100:
        titulo = titulo[:99].rsplit(" ", 1)[0].rstrip(",") + "…"
    return titulo


def _motivo_no_cabe(columnas: list[str], datos: list[list[str]]) -> str:
    """Por qué una tabla no cabe en el bloque `tabla` (vacío si cabe)."""
    if len(columnas) > 6:
        return f"{len(columnas)} columnas; el máximo es 6"
    largas = [c for c in columnas if not 1 <= len(c) <= 40]
    if largas:
        return f"encabezado de columna de más de 40 caracteres: «{largas[0][:30]}…»"
    for fila in datos:
        if not 2 <= len(a_plano(fila[0])) <= 60:
            return f"criterio de más de 60 caracteres: «{a_plano(fila[0])[:30]}…»"
        for celda in fila[1:]:
            if len(_celda(celda)) > 200:
                return f"celda de {len(_celda(celda))} caracteres; el máximo es 200"
    return ""


def convertir_contenido(
    contenido: str, linea_base: int, ctx: Contexto, seccion_id: str, seccion_titulo: str
) -> list[dict]:
    """Bloques de lectura (sin actividades) de una sección."""
    c = _Constructor(ctx, seccion_id, seccion_titulo)
    for el in tokenizar(contenido, linea_base):
        if el.tipo == "titulo":
            c.titulo_nuevo(el.texto, el.linea)
        elif el.tipo == "parrafo":
            texto, marcas = ctx.extraer(_limpiar_parrafo(el.texto))
            c.agregar_chunk(texto, el.linea, marcas)
        elif el.tipo == "lista":
            texto, marcas = ctx.extraer(_lista_a_texto(el.lineas, ctx, c.donde(el.linea, "lista")))
            c.agregar_chunk(texto, el.linea, marcas)
        elif el.tipo in ("tabla", "aviso"):
            limpias = []
            for linea in el.lineas:
                limpia, marcas = ctx.extraer(linea)
                limpias.append(limpia)
                el.marcas.extend(marcas)
            el.lineas = limpias
            (c.tabla if el.tipo == "tabla" else c.aviso)(el)
        elif el.tipo == "imagen":
            c.imagen(el)
    c.volcar_texto()
    if c.titulo:
        ctx.informe.revisar(c.donde(c.linea_titulo), f"título «{c.titulo}» sin contenido a continuación")
    return c.bloques


def fusionar_para_limite(bloques: list[dict], maximo: int, ctx: Contexto, donde: str) -> list[dict]:
    """Si la sección tiene más bloques de los que admite el esquema, une bloques de texto
    consecutivos (el título del segundo pasa a un subtítulo `####` dentro del primero)."""
    if len(bloques) <= maximo:
        return bloques
    resultado = list(bloques)
    k = 0
    while len(resultado) > maximo and k < len(resultado) - 1:
        a, b = resultado[k], resultado[k + 1]
        puede = (
            a["tipo"] == "texto"
            and b["tipo"] == "texto"
            and a.get("nivel") == b.get("nivel")
            and len(a["markdown"]) + len(b["markdown"]) + 100 <= MAX_TEXTO
        )
        if puede:
            cabecera = f"#### {b['titulo']}\n\n" if b.get("titulo") else ""
            a["markdown"] = f"{a['markdown']}\n\n{cabecera}{b['markdown']}"
            # Las dudas de `b` pasan a `a`.
            ctx.marcas = [(a["id"] if ident == b["id"] else ident, f) for ident, f in ctx.marcas]
            ctx.informe.corregido(
                donde, f"bloques de texto «{a['id']}» y «{b['id']}» unidos (límite de {maximo} bloques)"
            )
            del resultado[k + 1]
        else:
            k += 1
    # Segunda pasada: avisos seguidos de la misma variante y nivel se unen en un solo aviso.
    k = 0
    while len(resultado) > maximo and k < len(resultado) - 1:
        a, b = resultado[k], resultado[k + 1]
        if (
            a["tipo"] == "callout"
            and b["tipo"] == "callout"
            and a["variante"] == b["variante"]
            and a.get("nivel") == b.get("nivel")
            and "titulo" not in b
            and len(a["markdown"]) + len(b["markdown"]) + 2 <= MAX_CALLOUT
        ):
            a["markdown"] = f"{a['markdown']}\n\n{b['markdown']}"
            ctx.marcas = [(a["id"] if ident == b["id"] else ident, f) for ident, f in ctx.marcas]
            ctx.informe.corregido(
                donde, f"avisos «{a['id']}» y «{b['id']}» de la misma variante unidos (límite de {maximo} bloques)"
            )
            del resultado[k + 1]
        else:
            k += 1
    # Tercera pasada (último recurso): un aviso pasa a párrafo con su etiqueta en negrita dentro del
    # bloque de texto anterior si tiene el mismo nivel. Se conserva todo el texto y la variante.
    etiquetas = {"clinico": "Caso clínico", "dato": "Dato clave", "atencion": "Atención", "recuerda": "Recuerda"}
    k = 1
    while len(resultado) > maximo and k < len(resultado):
        a, b = resultado[k - 1], resultado[k]
        if (
            a["tipo"] == "texto"
            and b["tipo"] == "callout"
            and a.get("nivel") == b.get("nivel")
            and len(a["markdown"]) + len(b["markdown"]) + 40 <= MAX_TEXTO
        ):
            rotulo = b.get("titulo") or etiquetas[b["variante"]]
            a["markdown"] = f"{a['markdown']}\n\n**{rotulo}.** {b['markdown']}"
            ctx.marcas = [(a["id"] if ident == b["id"] else ident, f) for ident, f in ctx.marcas]
            ctx.informe.corregido(
                donde, f"aviso «{b['id']}» pasado a párrafo del texto «{a['id']}» (límite de {maximo} bloques)"
            )
            del resultado[k]
        else:
            k += 1
    if len(resultado) > maximo:
        ctx.informe.revisar(
            donde,
            f"la sección tiene {len(resultado) + (MAX_BLOQUES_SECCION - maximo)} bloques y el esquema admite {MAX_BLOQUES_SECCION}: "
            "hay que dividirla en dos secciones o reducir avisos y tablas",
        )
    return resultado
