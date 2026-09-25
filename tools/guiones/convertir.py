#!/usr/bin/env python3
"""Convierte los guiones de docs/guion-por-modulo/ en apps/web/src/modules/m{n}_{slug}/content.json.

Uso (desde la raíz del repositorio; PyYAML se pide a uv sin tocar el proyecto):

    uv run --no-project --with pyyaml python tools/guiones/convertir.py 3
    uv run --no-project --with pyyaml python tools/guiones/convertir.py todos
    uv run --no-project --with pyyaml python tools/guiones/convertir.py todos --comprobar

Sin argumentos de módulo se convierten los seis. `--comprobar` no escribe nada: compara lo que se
generaría con el `content.json` actual y sale con código 1 si difiere o no existe (sirve para saber
si alguien editó el guion o el JSON a mano).

El guion es la fuente de verdad. La conversión es determinista: mismo guion (y mismos SVG en
`apps/web/public/images/`, de donde se lee el viewBox), mismos bytes. Nada se descarta en
silencio: el informe lista lo que hay que revisar, lo corregido y lo omitido, con su ubicación.

Códigos de salida: 0 todo bien (o al día con --comprobar); 1 difiere (--comprobar) o hay elementos
«A REVISAR» con --estricto; 2 error de uso o un guion que no se pudo leer.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from conversor.informe import Informe  # noqa: E402
from conversor.modulo import convertir_modulo, serializar, slug_del_archivo  # noqa: E402


def guiones_disponibles(carpeta: Path) -> dict[int, Path]:
    encontrados: dict[int, Path] = {}
    for ruta in sorted(carpeta.glob("m[1-6]_*.md")):
        m = re.match(r"^m([1-6])_", ruta.name)
        if m:
            encontrados[int(m.group(1))] = ruta
    return encontrados


def main(argv: list[str] | None = None) -> int:
    # En Windows la consola usa cp1252: el informe lleva tildes y comillas angulares.
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Convierte guiones de módulo en content.json.")
    parser.add_argument("modulos", nargs="*", help="números de módulo (1 a 6) o «todos»; por defecto todos")
    parser.add_argument("--comprobar", action="store_true", help="compara sin escribir; sale con 1 si difiere")
    parser.add_argument("--estricto", action="store_true", help="sale con 1 si el informe tiene elementos a revisar")
    parser.add_argument(
        "--forzar", action="store_true", help="sobrescribe un content.json editado a mano (pierde esas ediciones)"
    )
    parser.add_argument("--detalle", action="store_true", help="lista cada corrección automática")
    parser.add_argument("--silencioso", action="store_true", help="no imprime el informe, solo el resumen")
    parser.add_argument(
        "--guiones", type=Path, default=RAIZ / "docs" / "guion-por-modulo", help="carpeta de los guiones"
    )
    parser.add_argument("--web", type=Path, default=RAIZ / "apps" / "web", help="carpeta apps/web")
    parser.add_argument(
        "--salida", type=Path, default=None, help="carpeta donde escribir (por defecto apps/web/src/modules)"
    )
    args = parser.parse_args(argv)

    disponibles = guiones_disponibles(args.guiones)
    if not args.modulos or "todos" in args.modulos:
        numeros = sorted(disponibles)
    else:
        try:
            numeros = sorted({int(x) for x in args.modulos})
        except ValueError:
            parser.error("los módulos son números del 1 al 6 o «todos»")
        for n in numeros:
            if n not in disponibles:
                parser.error(f"no hay guion del módulo {n} en {args.guiones}")

    salida_base = args.salida or (args.web / "src" / "modules")
    codigo = 0
    for n in numeros:
        ruta = disponibles[n]
        informe = Informe()
        try:
            modulo = convertir_modulo(ruta, args.web, informe)
        except ValueError as error:
            print(f"Módulo {n}: {error}", file=sys.stderr)
            return 2
        texto = serializar(modulo)
        destino = salida_base / f"m{n}_{slug_del_archivo(ruta)}" / "content.json"
        revisar = len(informe.de_nivel("revisar"))
        if not args.silencioso:
            print(f"=== Módulo {n}: {ruta.name}")
            print(informe.texto(detalle_corregido=args.detalle))
        if args.comprobar:
            actual = destino.read_bytes().decode("utf-8") if destino.is_file() else None
            if actual is None:
                print(f"Módulo {n}: NO EXISTE {destino}")
                codigo = 1
            elif actual != texto:
                print(f"Módulo {n}: DIFIERE de {destino} (el guion cambió o el JSON se editó a mano)")
                codigo = 1
            else:
                print(f"Módulo {n}: al día ({destino})")
        else:
            nuevo = texto.encode("utf-8")
            existente = destino.read_bytes() if destino.is_file() else None
            if existente is not None and existente != nuevo and not args.forzar:
                # Tras la conversión los módulos se pulen a mano (enlaces al glosario, figuras, posiciones
                # de los receptores). Sobrescribir en silencio destruiría ese trabajo.
                print(
                    f"Módulo {n}: NO SE ESCRIBIÓ. {destino} difiere de lo que generaría el guion "
                    "(se editó a mano o el guion cambió). Revisa la diferencia con --comprobar y usa "
                    "--forzar solo si quieres perder esas ediciones.",
                    file=sys.stderr,
                )
                codigo = 3
                continue
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_bytes(nuevo)  # bytes: sin conversión de saltos de línea
            print(f"Módulo {n}: escrito {destino} ({len(nuevo) / 1024:.0f} KB, {revisar} a revisar)")
        if args.estricto and revisar:
            codigo = 1
    return codigo


if __name__ == "__main__":
    sys.exit(main())
