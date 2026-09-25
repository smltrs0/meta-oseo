"""Prompt de sistema del mentor.

Versión 0: es un punto de partida que se formaliza y versiona en F3-03. Vive en
`app/ai/prompts/mentor.md` y se carga UNA sola vez, al importar este módulo (al arrancar la API).
Si el archivo falta o está vacío, la API no arranca.

Debe seguir siendo un prefijo ESTABLE: sin fechas, ids ni datos del usuario. El contexto
pedagógico y los fragmentos del RAG van aparte (F3-04), después de este texto, para que el
prompt caching pueda reutilizar el prefijo.
"""

from functools import cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
MENTOR_PROMPT_FILE = PROMPTS_DIR / "mentor.md"
MENTOR_PROMPT_VERSION = 0


@cache
def load_mentor_prompt() -> str:
    """Lee el prompt del mentor. Normaliza saltos de línea y bordes para que el texto (y con él el
    prefijo cacheable) sea idéntico en Windows, Linux y Docker."""
    text = MENTOR_PROMPT_FILE.read_text(encoding="utf-8").replace("\r\n", "\n").strip()
    if not text:
        raise RuntimeError(f"El prompt del mentor está vacío: {MENTOR_PROMPT_FILE}")
    return text


MENTOR_SYSTEM_PROMPT = load_mentor_prompt()
