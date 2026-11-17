"""Render every Wordflow icon file from frontend/public/favicon.svg.

From the repository root:

    uv run --no-project --with resvg-py --with pillow python scripts/branding/make_app_icons.py

It writes:

- frontend/public: favicon.ico (16 to 64 px) and apple-touch-icon.png (180 px,
  square corners; iOS rounds them itself).
- frontend/src/wordflow-icon.svg: a copy of favicon.svg for the app's own
  pages (the title bar, sign-in and blocking screens), which import it.
- frontend/src-tauri/icons: icon.png (the 1,024 px master), 32x32.png,
  128x128.png, 128x128@2x.png and icon.ico (16 to 256 px) as rounded tiles on
  a transparent background, for Windows, Linux and the window icon; icon.icns
  for macOS before 26, drawn on Apple's icon grid (an 824 px tile in a
  1,024 px canvas), made with iconutil on macOS only; and the Liquid Glass
  layers in wordflow.icon/Assets: wordflow-mark.png, the white mark alone (glass),
  over wordflow-tile.png, the tile's left-to-right gradient. The gradient is a
  layer, not the icon's fill, because actool draws a fill gradient top to
  bottom whatever its orientation (wordflow.icon/icon.json).

After it, compile the macOS 26 icon: pnpm -C frontend compile:desktop:mac-icon
"""

import io
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import resvg_py
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "frontend" / "public"
ICONS = ROOT / "frontend" / "src-tauri" / "icons"
SOURCE = PUBLIC / "favicon.svg"

TILE = re.compile(r'\s*<rect width="64" height="64"( rx="14")? fill="url\(#g\)"/>')


def render(svg: str, size: int) -> Image.Image:
    data = resvg_py.svg_to_bytes(svg_string=svg, width=size, height=size)
    return Image.open(io.BytesIO(bytes(data))).convert("RGBA")


def save_png(image: Image.Image, path: Path) -> None:
    image.save(path, optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({image.width} px)")


def save_ico(svg: str, sizes: list[int], path: Path) -> None:
    images = [render(svg, size) for size in sorted(sizes, reverse=True)]
    images[0].save(
        path,
        format="ICO",
        sizes=[(image.width, image.height) for image in images],
        append_images=images[1:],
    )
    print(
        f"wrote {path.relative_to(ROOT)} ({', '.join(str(s) for s in sorted(sizes))} px)"
    )


def apple_grid(svg: str) -> str:
    """The tile at 824 px inside a 1,024 px canvas, as macOS app icons are drawn."""
    inner = svg.split(">", 1)[1].rsplit("</svg>", 1)[0]
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
        f'<svg x="100" y="100" width="824" height="824" viewBox="0 0 64 64">{inner}</svg></svg>'
    )


def save_icns(svg: str, path: Path) -> None:
    if shutil.which("iconutil") is None:
        print(f"skipped {path.relative_to(ROOT)}: iconutil is macOS only")
        return
    grid = apple_grid(svg)
    with tempfile.TemporaryDirectory() as work:
        iconset = Path(work) / "icon.iconset"
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            render(grid, size).save(iconset / f"icon_{size}x{size}.png")
            render(grid, size * 2).save(iconset / f"icon_{size}x{size}@2x.png")
        subprocess.run(
            ["iconutil", "-c", "icns", str(iconset), "-o", str(path)], check=True
        )
    print(f"wrote {path.relative_to(ROOT)} (16 to 1,024 px, Apple grid)")


def main() -> None:
    svg = SOURCE.read_text(encoding="utf-8")
    if len(TILE.findall(svg)) != 1:
        sys.exit(
            f"{SOURCE} should have one tile <rect>; the script finds the tile by it"
        )
    square = TILE.sub('\n  <rect width="64" height="64" fill="url(#g)"/>', svg)
    mark = TILE.sub("", svg)
    tile = re.sub(r"<g.*</g>", "", square, flags=re.DOTALL)

    save_ico(svg, [16, 32, 48, 64], PUBLIC / "favicon.ico")
    save_png(render(square, 180), PUBLIC / "apple-touch-icon.png")
    shutil.copyfile(SOURCE, ROOT / "frontend" / "src" / "wordflow-icon.svg")
    print("wrote frontend/src/wordflow-icon.svg (copy of favicon.svg)")

    save_png(render(svg, 1024), ICONS / "icon.png")
    save_png(render(svg, 32), ICONS / "32x32.png")
    save_png(render(svg, 128), ICONS / "128x128.png")
    save_png(render(svg, 256), ICONS / "128x128@2x.png")
    save_ico(svg, [16, 24, 32, 48, 64, 256], ICONS / "icon.ico")
    save_icns(svg, ICONS / "icon.icns")
    save_png(
        render(mark, 1024), ICONS / "wordflow.icon" / "Assets" / "wordflow-mark.png"
    )
    save_png(
        render(tile, 1024), ICONS / "wordflow.icon" / "Assets" / "wordflow-tile.png"
    )


if __name__ == "__main__":
    main()
