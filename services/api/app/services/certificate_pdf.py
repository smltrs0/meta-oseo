"""PDF del certificado con reportlab (Python puro: sin GTK, Cairo ni otras bibliotecas del sistema).

Las fuentes son DejaVu (`app/assets/fonts`, licencia en `docs/atribuciones.md`): cubren el latín
con todos sus diacríticos, además de griego y cirílico, así que los nombres reales salen bien.
Un carácter que la fuente no trae (por ejemplo ideogramas) se dibuja como el glifo vacío de la
fuente en lugar de romper la emisión.

Página A4 apaisada, sobria: fondo marfil, doble borde, título, nombre completo, nombre del OVA, los
seis módulos, puntaje, fecha, código de verificación y un QR con la URL pública de verificación.
"""

import contextlib
import io
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

from app.core.constants import CERT_UTC_OFFSET_HOURS, MODULE_TITLES, OVA_TITLE
from app.models.certificate import Certificate
from app.models.enums import TIPO_IDENTIFICACION_ETIQUETAS, TipoIdentificacion
from app.services.certificate import percentage

FONTS_DIR = Path(__file__).resolve().parents[1] / "assets" / "fonts"
SANS = "OVA-Sans"
SANS_BOLD = "OVA-Sans-Bold"
SERIF = "OVA-Serif"
SERIF_BOLD = "OVA-Serif-Bold"
_FONT_FILES = {
    SANS: "DejaVuSans.ttf",
    SANS_BOLD: "DejaVuSans-Bold.ttf",
    SERIF: "DejaVuSerif.ttf",
    SERIF_BOLD: "DejaVuSerif-Bold.ttf",
}

# Paleta: marfil, azul petróleo y un dorado apagado para los filetes.
PAPER = HexColor("#FBF9F4")
NAVY = HexColor("#1E3A4C")
TEAL = HexColor("#2F6F73")
GOLD = HexColor("#A8853D")
INK = HexColor("#2B333B")
MUTED = HexColor("#5B6670")
HAIRLINE = Color(0.66, 0.52, 0.24, alpha=0.45)

_MONTHS = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)

_fonts_lock = threading.Lock()
_fonts_ready = False


def _register_fonts() -> None:
    global _fonts_ready
    with _fonts_lock:
        if _fonts_ready:
            return
        for name, filename in _FONT_FILES.items():
            pdfmetrics.registerFont(TTFont(name, str(FONTS_DIR / filename)))
        _fonts_ready = True


def format_spanish_date(moment: datetime) -> str:
    """`24 de septiembre de 2026`, en la hora de Colombia (UTC-5, sin horario de verano)."""
    local = moment.astimezone(timezone(timedelta(hours=CERT_UTC_OFFSET_HOURS)))
    return f"{local.day} de {_MONTHS[local.month - 1]} de {local.year}"


def _fit_lines(text: str, font: str, max_width: float, start: int, minimum: int, max_lines: int):
    """Mayor tamaño de letra (de `start` a `minimum`) con que el texto cabe en `max_lines`."""
    for size in range(start, minimum - 1, -1):
        lines = simpleSplit(text, font, size, max_width)
        if len(lines) <= max_lines:
            return size, lines
    return minimum, simpleSplit(text, font, minimum, max_width)


def _centered(c: Canvas, x: float, y: float, text: str, font: str, size: float, color) -> None:
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawCentredString(x, y, text)


def _spaced_caps(c: Canvas, x: float, y: float, text: str, font: str, size: float, color) -> None:
    """Texto centrado con espaciado entre letras (rótulos en versalitas)."""
    spacing = 2.2
    width = pdfmetrics.stringWidth(text, font, size) + spacing * (len(text) - 1)
    text_object = c.beginText(x - width / 2, y)
    text_object.setFont(font, size)
    text_object.setFillColor(color)
    text_object.setCharSpace(spacing)
    text_object.textOut(text)
    text_object.setCharSpace(0)  # el espaciado persiste en la página: restablecerlo
    c.drawText(text_object)


def _draw_frame(c: Canvas, width: float, height: float) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, width, height, stroke=0, fill=1)
    # Borde exterior grueso y filete interior dorado, con cuadritos en las esquinas.
    outer, inner = 22, 32
    c.setStrokeColor(NAVY)
    c.setLineWidth(2.2)
    c.rect(outer, outer, width - 2 * outer, height - 2 * outer, stroke=1, fill=0)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    c.rect(inner, inner, width - 2 * inner, height - 2 * inner, stroke=1, fill=0)
    c.setFillColor(GOLD)
    corner = 5
    for cx in (inner, width - inner):
        for cy in (inner, height - inner):
            c.rect(cx - corner / 2, cy - corner / 2, corner, corner, stroke=0, fill=1)


def _draw_rule(c: Canvas, cx: float, y: float, half_width: float) -> None:
    """Filete dorado con un rombo al centro."""
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    gap = 9
    c.line(cx - half_width, y, cx - gap, y)
    c.line(cx + gap, y, cx + half_width, y)
    c.setFillColor(GOLD)
    path = c.beginPath()
    path.moveTo(cx, y + 4)
    path.lineTo(cx + 4, y)
    path.lineTo(cx, y - 4)
    path.lineTo(cx - 4, y)
    path.close()
    c.drawPath(path, stroke=0, fill=1)


def _draw_modules(c: Canvas, cx: float, top: float) -> float:
    """Los seis módulos en 3 columnas por 2 filas. Devuelve la `y` inferior de la cuadrícula."""
    column_width = 230
    row_height = 30
    size = 10.5
    start_x = cx - 1.5 * column_width
    for index, (numero, titulo) in enumerate(sorted(MODULE_TITLES.items())):
        row, column = divmod(index, 3)
        x = start_x + column * column_width
        y = top - row * row_height
        c.setFillColor(TEAL)
        c.circle(x + 10, y + 3.5, 8.5, stroke=0, fill=1)
        _centered(c, x + 10, y, str(numero), SANS_BOLD, 9.5, PAPER)
        c.setFillColor(INK)
        c.setFont(SANS, size)
        c.drawString(x + 26, y, titulo)
    return top - row_height


def _draw_qr(c: Canvas, url: str, x: float, y: float, size: float) -> None:
    widget = QrCodeWidget(url, barLevel="M", barBorder=0)
    x0, y0, x1, y1 = widget.getBounds()
    drawing = Drawing(size, size, transform=[size / (x1 - x0), 0, 0, size / (y1 - y0), 0, 0])
    drawing.add(widget)
    renderPDF.draw(drawing, c, x, y)


def verification_url(public_base_url: str, code: str) -> str:
    return f"{public_base_url.rstrip('/')}/verify/{code}"


def render_certificate_pdf(certificate: Certificate, public_base_url: str) -> bytes:
    """Bytes del PDF del certificado (una página A4 apaisada)."""
    _register_fonts()
    width, height = landscape(A4)
    cx = width / 2
    buffer = io.BytesIO()
    # invariant=1: mismos bytes cada vez que se descarga el mismo certificado.
    c = Canvas(buffer, pagesize=(width, height), invariant=1, pageCompression=1)
    full_name = f"{certificate.nombre} {certificate.apellido}".strip()
    url = verification_url(public_base_url, certificate.codigo)
    c.setTitle(f"Certificado de finalización - {full_name}")
    c.setAuthor("OVA Metabolismo óseo")
    c.setSubject(OVA_TITLE)
    c.setCreator("OVA Metabolismo óseo (API)")

    _draw_frame(c, width, height)

    y = height - 66
    _spaced_caps(c, cx, y, "OBJETO VIRTUAL DE APRENDIZAJE", SANS_BOLD, 8.5, TEAL)
    y -= 50
    _centered(c, cx, y, "Certificado de finalización", SERIF_BOLD, 34, NAVY)
    y -= 22
    _draw_rule(c, cx, y, 150)

    y -= 38
    _centered(c, cx, y, "Se certifica que", SANS, 11.5, MUTED)

    name_size, name_lines = _fit_lines(full_name, SERIF_BOLD, 640, 32, 10, 2)
    y -= 14 + name_size
    for line in name_lines:
        _centered(c, cx, y, line, SERIF_BOLD, name_size, NAVY)
        y -= name_size * 1.18
    y += name_size * 1.18  # `y` queda en la línea base de la última línea del nombre

    tipo_label = certificate.tipo_identificacion
    with contextlib.suppress(ValueError):  # tipo fuera del catálogo: se imprime el código tal cual
        tipo_label = TIPO_IDENTIFICACION_ETIQUETAS[TipoIdentificacion(tipo_label)]
    y -= 23
    _centered(
        c,
        cx,
        y,
        f"identificado(a) con {tipo_label}, n.º {certificate.numero_identificacion}",
        SANS,
        9.5,
        MUTED,
    )

    y -= 34
    _centered(c, cx, y, "ha completado el recorrido interactivo", SANS, 11.5, MUTED)
    ova_size, ova_lines = _fit_lines(OVA_TITLE, SERIF_BOLD, 640, 16, 12, 2)
    y -= 6
    for line in ova_lines:
        y -= ova_size * 1.35
        _centered(c, cx, y, line, SERIF_BOLD, ova_size, INK)

    y -= 34
    _centered(c, cx, y, "y sus seis módulos:", SANS, 9.5, MUTED)
    y -= 28
    _draw_modules(c, cx, y)

    # Pie: puntaje | fecha | código y QR. Fijo respecto al borde inferior.
    base = 62
    _draw_rule(c, cx, base + 78, 300)
    left_x, mid_x = cx - 260, cx - 20

    _centered(c, left_x, base + 52, "PUNTAJE", SANS_BOLD, 8, TEAL)
    _centered(c, left_x, base + 22, str(certificate.puntaje_total), SERIF_BOLD, 26, NAVY)
    if certificate.puntaje_obligatorias is not None and certificate.puntaje_maximo:
        pct = percentage(certificate.puntaje_obligatorias, certificate.puntaje_maximo)
        detail = f"{pct:.1f} % de las actividades obligatorias".replace(".", ",")
    else:
        detail = "puntos acumulados"
    _centered(c, left_x, base + 6, detail, SANS, 8.5, MUTED)

    _centered(c, mid_x, base + 52, "FECHA DE EMISIÓN", SANS_BOLD, 8, TEAL)
    date_text = format_spanish_date(certificate.created_at)
    _centered(c, mid_x, base + 24, date_text, SERIF_BOLD, 14, NAVY)

    qr_size = 66
    qr_x = width - 32 - 30 - qr_size
    _draw_qr(c, url, qr_x, base - 2, qr_size)
    code_x = qr_x - 18
    c.setFillColor(TEAL)
    c.setFont(SANS_BOLD, 8)
    c.drawRightString(code_x, base + 52, "CÓDIGO DE VERIFICACIÓN")
    c.setFillColor(NAVY)
    c.setFont(SERIF_BOLD, 17)
    c.drawRightString(code_x, base + 28, certificate.codigo)
    c.setFillColor(MUTED)
    c.setFont(SANS, 7.5)
    c.drawRightString(code_x, base + 14, "Comprueba su autenticidad en:")
    c.setFillColor(TEAL)
    c.setFont(SANS, 7.5)
    c.drawRightString(code_x, base + 3, url)
    url_width = pdfmetrics.stringWidth(url, SANS, 7.5)
    c.linkURL(url, (code_x - url_width, base, code_x, base + 11), relative=0)

    c.showPage()
    c.save()
    return buffer.getvalue()
