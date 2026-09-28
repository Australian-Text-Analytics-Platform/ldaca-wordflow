---
status: accepted
---

# Use native Liquid Glass for the macOS window backplane

## Context

Wordflow's desktop layout is already composed from opaque cards separated by
title-bar and workspace gutters. On macOS those outer areas can use the system
window material without weakening the legibility of the sidebar, analysis
panels, graph, or data table. The selected Tauri plugin uses Apple's private
`NSGlassEffectView` on macOS 26 and later and falls back to
`NSVisualEffectView` on older supported macOS releases. The private API may
change without notice and can prevent Mac App Store acceptance.

Wordflow is distributed directly as a signed and notarized application. Mac
App Store compatibility is not a release goal, so the visual integration is
worth that maintenance and distribution risk.

## Decision

Normal macOS development and packaged builds enable the pinned
`tauri-plugin-liquid-glass` and `tauri-plugin-liquid-glass-api` version 0.1.6.
The Rust plugin is compiled and registered only on macOS. A platform-specific
Tauri configuration enables `macOSPrivateApi` and makes only the existing main
window transparent. It retains Tauri's `Overlay` titlebar style so the native
traffic lights occupy Wordflow's 35-pixel React header instead of a separate
row above it. A macOS-only capability grants that window the plugin's default
commands. The updater window receives no Liquid Glass permission and keeps its
opaque configuration.

Before React renders, the main entry requests the Clear material with zero
corner radius and no tint. Only a successful request adds the
`data-native-glass="active"` document marker.
Semantic window and title-bar backplanes become transparent under that marker,
while the sidebar interior, content cards, analysis panels, graph, data table,
and startup or login card retain their existing opaque theme surfaces.

Amended 2026-09-28 (issue 214): the first version put white text and icons
directly on the Clear glass titlebar, which became almost invisible over a
light desktop. The titlebar strip now carries an 88% CSS tint of the theme's
titlebar background over the glass, and its items use the theme's titlebar
foreground. The tint is in CSS rather than the plugin's `tintColor` so it
follows a theme change without reinitialising the native effect. The gutters
around the cards stay untinted glass.

Initialization failure is fail-opaque: Wordflow logs a warning, leaves the
marker unset, and retains the browser-equivalent solid backgrounds. Browser,
Windows, Linux, and the updater entry never load or invoke the JavaScript API.

## Consequences

- macOS 26 and later use the plugin's Clear Liquid Glass implementation;
  earlier supported macOS versions use its vibrancy fallback.
- The native effect has no user-facing setting and does not alter persisted
  preferences or public application APIs.
- Plugin updates require deliberate review because the exact dependency pin
  and private AppKit integration are part of the accepted release risk.
- macOS release acceptance must cover transparent gutters and titlebar behavior
  as well as opaque content surfaces, fallback behavior, and failure opacity.
