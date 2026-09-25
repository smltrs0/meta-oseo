"""Genera el manifiesto de actividades a partir de los `content.json` de los módulos.

Uso (desde services/api):

    uv run python -m app.scripts.build_manifest
    uv run python -m app.scripts.build_manifest --contenido ruta/modulo.json --salida /tmp/m.json
    uv run python -m app.scripts.build_manifest --comprobar

Sin argumentos lee `apps/web/src/modules/m{n}_{slug}/content.json` (ruta relativa a la raíz del
repositorio) y escribe `services/api/app/data/actividades_manifest.json`, que la API carga al
arrancar para validar resultados y el progreso (ver `app/services/manifest.py`). Hay que volver a
ejecutarlo, y versionar el resultado, cada vez que cambie una actividad de los módulos.

- `--contenido` (repetible) usa esos archivos en lugar de la carpeta de módulos (útil con el
  módulo de muestra `apps/web/src/content/__fixtures__/modulo_muestra.json`).
- `--salida` cambia el archivo de destino.
- `--comprobar` no escribe: sale con código 1 si el archivo de destino no coincide con el contenido
  (pensado para CI).

Códigos de salida: 0 = listo, 1 = el manifiesto está desactualizado (`--comprobar`),
2 = contenido inválido o no encontrado.
"""

import argparse
import json
import re
import sys
from collections.abc import Sequence
from pathlib import Path

from app.core.constants import MODULE_COUNT
from app.core.settings import DEFAULT_MANIFEST_PATH, REPO_ROOT
from app.services.manifest import ManifestError, build_manifest, render_manifest

MODULES_DIR = REPO_ROOT / "apps" / "web" / "src" / "modules"
_MODULE_FOLDER = re.compile(r"^m(?P<numero>[1-6])_(?P<slug>[a-z0-9_]+)$")

EXIT_OK = 0
EXIT_OUTDATED = 1
EXIT_INVALID = 2


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.scripts.build_manifest",
        description="Genera el manifiesto de actividades que usa la API para validar.",
    )
    parser.add_argument(
        "--contenido",
        action="append",
        type=Path,
        metavar="ARCHIVO",
        help="content.json de un módulo (repetible). Por defecto, los de apps/web/src/modules.",
    )
    parser.add_argument(
        "--salida",
        type=Path,
        default=DEFAULT_MANIFEST_PATH,
        help=f"Archivo de destino (por defecto {DEFAULT_MANIFEST_PATH}).",
    )
    parser.add_argument(
        "--comprobar",
        action="store_true",
        help="No escribe: falla si el archivo de destino no está al día.",
    )
    return parser


def discover_content_files(modules_dir: Path | None = None) -> list[Path]:
    """`content.json` de cada carpeta `m{n}_{slug}` de la carpeta de módulos, en orden de módulo."""
    modules_dir = modules_dir or MODULES_DIR
    found: list[Path] = []
    if modules_dir.is_dir():
        for folder in sorted(modules_dir.iterdir()):
            if _MODULE_FOLDER.match(folder.name) and (folder / "content.json").is_file():
                found.append(folder / "content.json")
    return found


def read_content(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ManifestError(f"No se pudo leer {path}: {error}") from error
    if not isinstance(data, dict):
        raise ManifestError(f"{path} debe ser un objeto JSON.")
    match = _MODULE_FOLDER.match(path.parent.name)
    if match and data.get("numero") != int(match["numero"]):
        raise ManifestError(
            f"{path}: la carpeta {path.parent.name!r} dice módulo {match['numero']} "
            f"pero el JSON dice {data.get('numero')!r}."
        )
    return data


def _use_utf8_output() -> None:
    """La consola de Windows usa cp1252 y desfigura los acentos de los mensajes."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    paths = args.contenido or discover_content_files()
    if not paths:
        print(
            f"No hay content.json en {MODULES_DIR} (se esperan carpetas m1_..., m6_...). "
            "Para probar con otro archivo usa --contenido.",
            file=sys.stderr,
        )
        return EXIT_INVALID
    try:
        manifest = build_manifest(read_content(path) for path in paths)
    except ManifestError as error:
        print(f"Error: {error}", file=sys.stderr)
        return EXIT_INVALID

    text = render_manifest(manifest)
    missing = [n for n in range(1, MODULE_COUNT + 1) if n not in manifest.modules]
    if missing:
        print(
            "Aviso: el manifiesto no incluye los módulos " + ", ".join(map(str, missing)) + ". "
            "Con ese manifiesto la API rechazará sus actividades y no dejará completarlos.",
            file=sys.stderr,
        )

    if args.comprobar:
        current = args.salida.read_text(encoding="utf-8") if args.salida.is_file() else None
        if current != text:
            print(f"{args.salida} no está al día: ejecuta build_manifest sin --comprobar.")
            return EXIT_OUTDATED
        print(f"{args.salida} está al día.")
        return EXIT_OK

    args.salida.parent.mkdir(parents=True, exist_ok=True)
    # newline="\n": el archivo se versiona y debe ser idéntico en Windows y en Linux.
    with args.salida.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
    totals = manifest.overall_totals()
    print(
        f"Manifiesto escrito en {args.salida}: {totals['actividades']} actividades "
        f"({totals['obligatorias']} obligatorias), {len(manifest.modules)} módulo(s), "
        f"{totals['puntaje_max_obligatorias']} puntos obligatorios."
    )
    return EXIT_OK


if __name__ == "__main__":
    _use_utf8_output()
    sys.exit(main())
