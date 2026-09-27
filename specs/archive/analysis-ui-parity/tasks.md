# Verification checklist

- [x] Stopword immediate deltas, sorting, constraints and rollback
- [x] Frequency rank, clear/count and cloud accessibility
- [x] Preview admission, completion, changed drafts, failure and clearing
- [x] Bounded tables and row inspection
- [x] Concordance search, metadata, summaries and publication controls
- [x] Quotation display modes, role cues, paging and publication controls
- [x] Focused and package frontend/backend checks
- [x] Browser/native E2E and visual review
- [x] Documentation, publication mirror, links and diff checks

## Verification evidence

- Frontend: 131 files / 568 tests passed, including the inactive-result refresh
  regression. Eight Node tooling tests passed.
- Native backend: 147 locked tests passed; four additional Quotation tests passed
  against the provisioned local model. Optional benchmarks remained ignored.
- Desktop shell: 33 locked tests passed. The instrumented macOS application built.
- Strict backend Clippy, Rust formatting, frontend lint, build, formatting,
  tooling typecheck and unused-code checks passed.
- Browser: all nine affected scenarios passed (six Frequency, two Concordance,
  one Quotation).
- macOS Tauri WebView: all nine affected scenarios passed against the final
  instrumented build. Light/dark and narrow-pane captures were inspected
  separately from browser captures.
- Documentation drift checks, regenerated publication mirror, internal links and
  diff checks passed. Existing vendored C++ warnings and development chart/resize
  logging remain; final scenarios reported no unexpected application errors.
