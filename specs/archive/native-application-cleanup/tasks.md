# Delivery checklist

- [x] Remove modification tracking and use the permanent path for Untitled close decisions.
- [x] Split explicit reads from write-capable execution and support request-local SQL settings.
- [x] Consolidate editing snapshots and retained completion in runtime editor ownership.
- [x] Make graph inspection metadata-only and add coherent Arrow schema/page and row-count reads.
- [x] Export directly into destination-adjacent staging under one native task through installation.
- [x] Update frontend read contracts, hover-count caching, targeted invalidation and column reconciliation.
- [x] Allow concurrent independent SQL cells while retaining per-cell save/execution ownership.
- [x] Preserve structured HTTP/IPC errors and one accepted-task notification owner.
- [x] Archive retired frontend application code, generated contracts, exclusive tests and old guides.
- [x] Remove obsolete dependencies, configuration and native commands; enforce production-entry reachability.
- [x] Run backend/Tauri regression gates and frontend tests, lint, build and unused-code checks.
- [x] Run Chromium-with-Rust E2E and native visual checks; record the existing hover intermittency below.
- [x] Update canonical documentation/tutorials and publication mirror, then verify links and whitespace.

## Verification — 15 September 2026

| Check | Result |
| --- | --- |
| Backend locked tests | 70 passed; one intentionally ignored subprocess helper is exercised by its parent test. |
| Backend and Tauri Rust formatting and strict Clippy | Passed, both crates, all targets/features for Clippy. |
| Tauri locked tests | 24 passed, including all export formats, replacement, cleanup, cancellation, detached callers and lifecycle decisions. |
| Frontend unit/component tests | 421 passed across 92 files, plus four Node build/source-graph checks. |
| Frontend lint, tooling typecheck, build, theme contracts | Passed. |
| Production-entry source check and Knip | Passed: 212 reachable modules and no unused production modules. Roots cover desktop/Rust preview, updater and Quick Look. |
| Chromium with Rust preview | First full run passed 33/33. Final full run passed 32/33; the existing graph-hover toolbar test timed out in `objects.spec.ts:25`. It passed twice and timed out once in three isolated repeats. No test was removed or relaxed. |
| Focused sorting and casts | All four interaction tests passed after fixing a schema-refresh race that could discard a renamed sort. No invalid page requests occurred after rename/Undo; incompatible metadata and preferences were removed by casts. |
| Quick Look | Native checks and regular macOS debug-app packaging passed: offline catalogue, unavailable objects, read-only integrity, lock release and format-6 validation. |
| Documentation | Drift checks, regenerated publication mirror and Markdown links passed. |
| Whitespace | `git diff --check` passed. |

Native QA used the owned `pnpm dev:desktop` session first. Native automation
could not address its unbundled development binary, so checks continued in the
regular bundled debug app built through the existing Tauri configuration.
Light and dark appearances, untouched/populated Untitled prompts, Save-chooser
cancellation, named-project Close, independent-window Quit cancellation, native
import, hover-only counting, Materialize, table-editor protection for Save/Close/
Reload, and native export replacement were exercised. The exported CSV contained
all 125 synthetic rows rather than the displayed page. One task covered export
through installation. The original light preference was restored and the owned
QA app was closed normally.

Windows native execution and signed-release verification were not performed on
this macOS host. The intermittent graph-hover test remains a separate known QA
limitation; table/data operations and the other interaction tests passed.

Format 6, concurrent DuckDB connections, archived backend source, hidden raw
objects, ENUM types and reserved analysis metadata are retained. No migration,
automatic retries, global operation queue or shutdown deadline was introduced.
