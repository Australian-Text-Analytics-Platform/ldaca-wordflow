# Tasks and verification

- [x] Clean-checkout baseline: 158 Vitest files and 715 tests, plus 15 Node tests.
- [x] Baseline format, lint, tooling types, Knip, build, docs and versions pass.
- [x] Pin global/local Vite+ and the Node/pnpm environment.
- [x] Review migrator warnings and preserve original dependency-build permissions.
- [x] Replace tooling configuration, imports, commands and API output formatter.
- [x] Update CI setup and development instructions.
- [x] Complete frontend check with identical clean-checkout discovery and no new skips.
- [x] Verify API drift, root script tests, documentation links and clean diff.
- [x] Verify fresh frozen installation and aligned Vite/Vitest package versions.
- [x] Exercise browser development/HMR, browser/server E2E and native E2E.
- [x] Validate Quick Look and the uninstrumented macOS release bundle.
- [x] Verify Tauri development startup, frontend serving and embedded backend readiness.
- [ ] Execute Windows packaging acceptance on a Windows runner.
- [x] Integrate the reviewed change while preserving unrelated work.

## Toolchain and source checks

Vite+ 1.0.0 selects Node 24.15.0 and pnpm 11.24.0 in fresh shells and after
directory changes. Environment diagnostics pass. A fresh temporary workspace
installs successfully with `vp install --frozen-lockfile`. The lockfile has one
Vite+ version, one core-alias version and one Vitest version; multiple peer
contexts remain. No upstream Vite package remains alongside the core alias.

The full frontend check passes in the isolated checkout: 158 files, 715 Vitest
tests and 15 Node tests. A temporary combined checkout containing the original
unrelated work also passes its full check: 162 files, 728 Vitest tests and 15
Node tests. No assertion was removed or weakened and no skip was introduced.
The combined run preserves the user's deleted naming test and ports only the
public test imports in five newly added tests.

Root development-script tests (7), Markdown-checker tests (3), all 327 engineering
Markdown files, clean-checkout API drift and `git diff --check` pass. The original
dirty checkout also passes its existing API drift check before integration.
The final integrated original checkout passes a fresh frozen installation, API
drift, the full frontend check (162 files and 728 tests), all root development
tests, and internal links in 328 Markdown files. The Git index is unchanged;
unrelated work remains uncommitted.

Actionlint validates the updated workflows. Babel produces identical virtualizer
code before and after the lint directive change.

## Runtime acceptance

The documented `vp run dev` starts the Rust preview and Vite+ on isolated test
ports. A temporary source edit and its restoration both appear through HMR;
a page sentinel survives, proving no full reload. The source and test hosts are
restored and cleaned up afterward. The packaged-server E2E workflow passes. `vp run dev:desktop` builds and starts
the separate Dev-identity executable, serves Vite+ on port 3001 and exposes a
ready embedded backend with an empty temporary graph. The unbundled executable
is not exposed by the app automation inventory; direct visual acceptance uses
the uninstrumented release bundle. The task-owned Dev session is stopped afterward.

All 35 browser spec files were exercised. Thirty-three pass across the full run
and continuation. Two unchanged assertions fail identically under Vite 8.2.2:
the tokenizer recommendation remains unselected, and the Samples picker reports
one checkbox where the test expects four. The initial Filter assertion passes
both its original-toolchain control and the migrated full-spec rerun. A native
rebuild sharing Cargo output interrupted one browser worker's readiness; the
remaining specs were rerun after the preview build completed.

The migrated native suite passes all 21 spec files and 77 tests when run alone,
matching the original-toolchain native bundle. Concurrent runs had Frequency
sorting and keyboard-cleanup timing failures; the focused rerun also passes.
Unit tests likewise timed out under concurrent builds/GUI suites and pass on
serial reruns without timeout changes.

The macOS bundle uses the release profile and has no E2E instrumentation. It
builds with the Quick Look extension, passes deep signature verification and
cached ICU catalogue/daylight-saving checks, and renders the main and updater
entries. Local signing is ad hoc; Developer ID signing and notarization were
not exercised. Quick Look native checks pass, including offline catalogue,
rendering, read-only integrity, lock release and damaged-file handling.

The updater's existing up-to-date screen has a blank version label: the unchanged
Rust enum emits `current_version` while the UI reads `currentVersion`. This is
recorded separately from asset-loading acceptance; no application API was changed.
The user's installed Wordflow application was reopened after production-identity
QA. Windows jobs, updater paths and artifact contracts remain intact, but actual
Windows packaging and installation need a Windows runner.

## Migration review and timings

The migrator initially could not resolve the root source Vitest version. A
temporary node_modules link to the installed frontend Vitest 4.1.11 allowed the
root preflight; it was removed after migration. Retired-source edits were
reverted. Dynamic test configuration required manual compatibility settings.
Text-content warnings refer to browser-mode assertions; these tests use jsdom
and the existing jest-dom assertions remain unchanged.

Native correctness lint intentionally replaces the former strict/stylistic
ESLint, TanStack Query and Testing Library policies. The development runbook
records the coverage changes and preserved transpile-only test compilation.

Baseline command wall times in seconds (single local run): format 2.82, lint
20.36, tooling types 2.27, tests 23.84, Knip 5.18, build 10.06, docs 1.69 and
versions 1.77. Comparing the same test-runner boundary, Vitest reported 20.23
seconds before migration and 21.63 seconds afterward for 715 tests. These are
single local observations, not a controlled performance benchmark. Lint timings
cannot establish equivalent-policy gains because the rule coverage changed.
