# Verification — 2026-09-08

## Passed

- Shared Rust crate: four runtime tests and two executable configuration/bind
  failure tests; locked tests, formatting and strict Clippy.
- Tauri: 19 tests, formatting and strict Clippy. Startup cancellation, repeated
  stopping and the shutdown deadline are covered by supervisor tests.
- Frontend: 277 test files and 1,364 tests, plus three build-verification tests.
  Lint, tooling types, unused-code checks, theme checks, production build,
  documentation drift, version registry and engineering links passed.
- New/edited frontend files pass formatting. Workflow YAML parses successfully.
- Standalone executable: actual ephemeral-port HTTP readiness followed by
  SIGTERM and SIGINT. Both exited successfully and released the listener.
- Local Apple Silicon application and DMG built successfully with the committed
  frontend dependency versions. The app occupies approximately 29 MiB and has
  no `backend-runtime` directory or `libpython`. Local strict signature
  verification passed; this is an ad-hoc signed, non-notarized local build.
- Packaged native UI: ready screen visible; Window → Reload returned to verified
  readiness; main-window close exited with code zero and its listener refused
  connections afterward. Native Quit exited its independently reopened instance.
  The separate experimental app was left untouched.

## Existing failures and verification limits

- The full frontend `check` pipeline stops at 17 formatting errors in unrelated
  files. Every reported file was verified byte-for-byte identical to HEAD
  `0cabb77ac`; the remaining checks were run independently and passed.
- Browser E2E: two passed, one skipped, and quotation failed because analysis
  refresh emitted HTTP 409 and 404 console errors. A temporary copy of the
  unchanged HEAD frontend, using the same locked dependencies and unchanged
  backend environment, independently reproduced the quotation 404 failure.
  The current run's additional 409 was not reproduced in that comparison.
  Neither error was suppressed or repaired as part of this desktop migration.
- Rust reports a future-compatibility notice in the existing transitive `block`
  0.1.6 dependency. Strict Clippy nevertheless passes.
- Startup interruption and deadline behavior are verified by deterministic
  native tests; the packaged startup is too brief for a reliable manual close
  before binding. Live native close, Quit and reload were verified separately.
- Windows CI was updated but has not run in this local macOS session. Release
  signing, notarization and publication were not performed.

The first sandboxed E2E and DMG attempts needed normal cache/OS access; reruns
with that access completed. A temporary baseline dependency auto-install was
replaced with the repository's frozen lockfile before final checks and builds.
The baseline copy and dependency backup were removed after verification.
