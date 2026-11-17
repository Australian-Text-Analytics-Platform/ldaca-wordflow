# Tauri App Icons

Every Wordflow icon is drawn from one file, `frontend/public/favicon.svg`: a W
and F in one white stroke, from a source node through the W into the F's two
derived nodes (the Project Graph), on a tile that deepens from a toned-down
University of Sydney Ochre (`#D2522F`) to a deep ochre (`#8E2A16`), left to
right. `scripts/branding/make_app_icons.py` renders the rest from it.

## Contents

- `wordflow.icon` (Icon Composer source and macOS Liquid Glass icon): the white
  mark as a glass layer (`Assets/wordflow-mark.png`) over the tile's gradient
  (`Assets/wordflow-tile.png`). The gradient is a layer, not the icon's fill,
  because `actool` draws a fill gradient top to bottom whatever its orientation.
- `Assets.car` (compiled macOS Liquid Glass asset catalog)
- `32x32.png`, `128x128.png`, `128x128@2x.png` (256×256) and `icon.ico` (16 to
  256 px): the rounded tile on a transparent background, for Windows, Linux and
  the window icon
- `icon.png` (1024×1024 master, the same rounded tile)
- `icon.icns` (macOS before 26), drawn on Apple's icon grid: an 824 px tile in a
  1,024 px canvas

## Regenerating Icons

After changing `favicon.svg`, render every icon file, including the browser's
`favicon.ico` and `apple-touch-icon.png` and the app pages' copy
`frontend/src/wordflow-icon.svg`, then compile the macOS 26 catalog:

```bash
uv run --no-project --with resvg-py --with pillow python scripts/branding/make_app_icons.py
pnpm -C frontend compile:desktop:mac-icon
```

`icon.icns` needs `iconutil`, and the catalog needs Xcode's `actool`, so run
both on a Mac.

`frontend/public/wordflow-logo.svg` is the same mark for 128 px and larger, with
words in several languages inside the stroke and marks traced from the LDaCA
logo, in its Charcoal. It is drawn by `scripts/branding/make_wordflow_logo.py`;
change the words or marks there and run it again. The READMEs (and so the PyPI
page) show it.

## Packaging

Tauri copies the compiled `Assets.car` into macOS packages. Keeping the catalog
under version control makes routine packaging independent of the Apple
toolchain's unreliable command-line Icon Composer compilation. `wordflow.icon`
remains the editable source, and `icon.icns` remains configured as a
compatibility fallback. Windows and development surfaces use the rendered PNG
or ICO files.

The app is named "Wordflow (by LDaCA)" (`productName`). The Windows installer's
upgrade code is pinned in `tauri.conf.json` (`bundle.windows.wix.upgradeCode`)
to the one Tauri derived from the old name, "LDaCA Wordflow", so a new
installer still replaces an old install. Never change it.
