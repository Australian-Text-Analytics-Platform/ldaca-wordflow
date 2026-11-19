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

The browser favicon and startup icon are rendered from the same flattened
master. Keep them in sync when the native composition changes.

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
