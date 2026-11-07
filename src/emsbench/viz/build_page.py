"""Build the self-contained replay page by injecting exported data into the template.

Usage:
    python -m emsbench.viz.export          # once, writes results/raw/replay.json
    python -m emsbench.viz.build_page      # writes results/raw/replay.html
"""

from __future__ import annotations

import argparse
from pathlib import Path

PLACEHOLDER = "__REPLAY_DATA__"


def build(template: Path, data: Path, out: Path) -> None:
    html = template.read_text(encoding="utf-8")
    if PLACEHOLDER not in html:
        raise ValueError(f"{template} has no {PLACEHOLDER} placeholder")
    # "</" inside JSON could close the <script> tag early; escape it.
    payload = data.read_text(encoding="utf-8").replace("</", "<\\/")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html.replace(PLACEHOLDER, payload), encoding="utf-8")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template", type=Path, default=Path("web/replay.html"))
    parser.add_argument("--data", type=Path, default=Path("results/raw/replay.json"))
    parser.add_argument("--out", type=Path, default=Path("results/raw/replay.html"))
    args = parser.parse_args(argv)
    build(args.template, args.data, args.out)
    print(f"wrote {args.out} ({args.out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
