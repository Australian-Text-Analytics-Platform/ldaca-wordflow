# Acceptance tracking

- [ ] Server package, CLI, resources and graceful shutdown
- [ ] Library upload/list/download/delete/import and filename safety
- [ ] Project New/Open/Save/Save As/upload/download/delete and session ownership
- [ ] Generated OpenAPI and browser controls, graph file drops, proxy prefix
- [ ] Release archives/checksums, native dependency audits, workflow asset preservation
- [ ] Binder notebook/environment/helper and launcher tests
- [ ] Rust/frontend checks and browser workflows
- [ ] Extracted package and visual checks
- [ ] Canonical docs, links and diff checks
- [ ] External-platform and live Binder verification reported accurately

## Latest verification (2026-09-28)

The lightweight policy now covers desktop and server: ICU and MediaPipe
model/runtime files download on first use into host caches. No optional binary
is copied into either package. ICU retains DuckDB signature verification;
language assets use pinned SHA-256 verification. Explicit offline overrides
remain available.

Passed locally on macOS: 242 ordinary Rust backend/server tests, the explicit
ICU first-download/offline-reuse probe, 715 frontend tests with two workers,
15 Node tooling tests, strict backend/server Clippy, desktop compilation check,
frontend types/lint/format/build/unused-source checks, API drift and documentation
checks. Direct browser E2E covers upload/import, Save, New/Open, reload and narrow
file-library presentation. All five language files passed real HTTP download
and checksum checks. The encoded Data Block regression now asserts a successful
schema read, catching inherited outer route parameters.

An extracted ad-hoc-signed macOS server archive passed startup without downloads,
first-use ICU, embedded-asset serving and project saving. The final server archive was rebuilt and passed again after the routing fix.
A fresh uninstrumented desktop release bundle passed deep signature verification
and inspection confirmed no ICU/TFLite/WASM payloads, with Quick Look retained.
Expanded native visual checks remain a separate gate. Windows/Linux and a real
Binder launch are not locally verified. Binder testing is deferred to the actual
website, as requested; no local Binder simulation is part of acceptance evidence.
