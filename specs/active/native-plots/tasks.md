# Delivery checks

- [x] Typed contracts and retained-row native execution
- [x] All five DuckDB projections and invalid-value reporting
- [x] Offline ICU assets and host integration on macOS arm64
- [x] Shared request decoding and Plots navigation
- [x] Trends parity and five chart modes
- [x] Original-row publication and browser/native chart downloads
- [x] Lifecycle, metadata, selections and aggregation regressions
- [x] Browser and native performance measurements
- [x] Backend/Tauri locked tests, formatting and strict Clippy
- [x] Frontend tests, lint, type checks, formatting, build and unused-code checks
- [x] Browser/native Plots light/dark and narrow-pane checks
- [x] Canonical docs, tutorials, publication mirror and diff checks
- [ ] Resolve the independent native Frequency stopword-suite failure
- [ ] Verify Windows/Linux ICU packaging and rendering on their hosts

## Verification recorded 25 September 2026

- Backend: 115 unit tests, 2 CLI tests and 53 integration tests passed; 8 explicitly
  provisioned/benchmark tests ignored in the ordinary run. The offline ICU test
  and million-row benchmark were run separately and passed.
- Tauri: 33 locked tests and strict Clippy passed.
- Frontend: 138 files / 622 tests passed; 14 Node tooling tests and 7 desktop
  contract tests passed. Lint, tooling type checks, format, build, unused-code,
  documentation drift, internal links and diff checks passed.
- Browser: Plots, Frequency, Concordance, Quotation, compatibility and layout
  suites passed. Plots additionally verified real SVG/PNG/JPEG downloads.
- Native: Plots, Concordance, Quotation, compatibility and layout passed.
  Frequency's stopword scenario fails independently on rerun: its edit dialog
  remains open when cleanup tries to reset the right-panel ratio (67 rather than
  30). Six other Frequency scenarios passed. No claim of a fully green native
  regression gate is made; this remains outside the Plots implementation.
- Actual macOS app bundle: Plots workflow passed, including runtime timezone
  catalogue access. Bundle signature, ICU checksum/licences, clean-cache asset
  loading, rejection of a damaged signature and DST offsets passed. Actual
  native Save dialogs installed SVG/PNG/JPEG files with verified formats.
  The test bundle is ad-hoc signed and instrumented, not a release/notarization.
- Final visual review: ship; narrow Calendar uses local horizontal scrolling,
  dark labels use theme colors, and Calendar/Sankey keyboard inspection is visible.
- Performance evidence and limits: [Plots display capacity](../../../docs/reference/plots-performance.md).

Windows/Linux target mapping is implemented but not locally verified. Browser
and WebView peak-memory measurements remain separate from the measured native
million-row process benchmark. Keep this specification active until remaining
verification gaps are resolved.
