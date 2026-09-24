"""Utilidades de texto para que lo que llega por la API se pueda guardar sin sorpresas."""

_NUL = chr(0)


def ensure_storable(value: str) -> str:
    """Rechaza el texto que la base de datos no puede guardar (un 422 en lugar de un 500).

    - U+0000: PostgreSQL no lo admite en columnas de texto.
    - Sustitutos Unicode sueltos (p. ej. el escape JSON "\\ud800"): Python los acepta al leer el
      JSON, pero no se pueden codificar a UTF-8 y el controlador de la base de datos falla al
      escribirlos.
    """
    if _NUL in value:
        raise ValueError("No puede contener el carácter nulo.")
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        raise ValueError("Contiene caracteres Unicode no válidos.") from None
    return value


def printable_utf8(value: str) -> str:
    """Copia de `value` apta para volver a escribirse como JSON (sustitutos sueltos -> U+FFFD)."""
    return "".join("�" if 0xD800 <= ord(char) <= 0xDFFF else char for char in value)
