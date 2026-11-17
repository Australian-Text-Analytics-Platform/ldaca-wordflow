# Tauri App Icons

The Icon Composer document is the native source for the Wordflow app icon.
Rendered files provide fallbacks for older macOS versions and the other
desktop platforms.

## Contents

- `wordflow.icon` (Icon Composer source and macOS Liquid Glass icon)
- `Assets.car` (compiled macOS Liquid Glass asset catalog)
- `32x32.png`
- `128x128.png`
- `128x128@2x.png` (256×256)
- `icon.png` (1024×1024 flattened master)
- `icon.icns` (macOS fallback)
- `icon.ico` (Windows)

## Regenerating Icons

Export a 1024×1024 macOS image from `wordflow.icon`, save it as `icon.png`,
then regenerate the platform fallbacks with the repository's Tauri CLI:

```bash
pnpm -C frontend exec tauri icon src-tauri/icons/icon.png --output src-tauri/icons
```

Regenerate the compiled macOS asset catalog after changing `wordflow.icon`:

```bash
pnpm -C frontend compile:desktop:mac-icon
```

The startup icon (`frontend/src/wordflow-icon.png`) is rendered from the same
flattened master. Keep it in sync when the native composition changes.

The browser favicon is drawn separately for small sizes: a W and F in one white
stroke, from a source node through the W into the F's two derived nodes (the
Project Graph), on a tile that deepens from cyan to blue, left to right.
`frontend/public/favicon.svg` is the source, and `favicon.ico` (16, 32, 48 and
64 px) and `apple-touch-icon.png` (180 px, square corners) are rendered from it.

## Packaging

Tauri copies the compiled `Assets.car` into macOS packages. Keeping the catalog
under version control makes routine packaging independent of the Apple
toolchain's unreliable command-line Icon Composer compilation. `wordflow.icon`
remains the editable source, and `icon.icns` remains configured as a
compatibility fallback. Windows and development surfaces use the rendered PNG
or ICO files.
