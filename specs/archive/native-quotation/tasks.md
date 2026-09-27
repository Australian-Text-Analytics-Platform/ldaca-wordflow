# Verification

- [x] Concordance backend, frontend, browser and native scenarios pass before implementation.
- [x] Archived Quotation source and native extractor reviewed.
- [x] Native extraction, Preview, saved queries and transactional publication.
- [x] Shared typed document capture, tab ownership and restored frontend.
- [x] Backend, library, adapter and frontend checks.
- [x] Browser workflow, light/dark themes and narrow-pane captures.
- [x] Final native workflow.
- [x] Independent visual finish review: ship, no material fixes.
- [x] Design documentation handoff: incumbent patterns confirmed, no drift.
- [x] Canonical documentation, tutorials, model notices and publication mirror.

## Verification evidence

Concordance passed its focused native backend and frontend suites plus browser and
actual macOS WebView scenarios before Quotation implementation began. After shared
code extraction its 11 ordinary backend tests and 13 combined frontend tests pass;
the combined browser Quotation/Concordance scenarios also pass.

The full backend suite passed 92 unit tests, two CLI tests and 51 project tests.
Quotation model acceptance is explicitly provisioned, not a live-network test.
It covers page-only Preview, NULLs, duplicate document identity, typed lists and
dates, source deletion, Save As/reopen, publication collision rollback and
cancellation preserving the previous result. Native quotation feature tests pass
16/16 including model ownership transfer between threads. The Polars quotation
and Concordance adapters pass 36 tests. The core-only library build passes.

Frontend: 531 tests in 127 files passed; the final focused suites pass 13 tests.
Lint, tooling types, production build and unused-code checks pass. Documentation
checks and the publication mirror pass. Tauri's 33 unit tests pass. Strict all-feature Tauri Clippy passed on macOS. Quotation's actual WebView scenario
passed in 10.3 seconds, and Concordance's regression scenario passed in 3.6 seconds.
The first native attempt used a frontend overwritten by a concurrent production
build; it was discarded and rebuilt in isolation. A later test clicked publication
while its saved projection was still loading; the scenario now waits for the action
to become enabled. No application timing workaround was added.

Five provisioned backend Quotation tests pass, including typed empty saved results.
Eight build-script tests, version checks, scoped formatting and diff checks pass.
Native and browser captures cover both themes and normal/narrow desktop panes,
plus full-document and publication dialogs. The independent visual reviewer inspected
all twelve captures and returned **ship**, with no material fixes. A final regression
test confirms Clear results retains a reopened input request as a window-local draft.

The implementation restores the built-in English extractor. Archived remote
providers remain unavailable. No Windows/Linux UI or signed packaging checks are
claimed. Existing broader native Frequency failures remain recorded separately
in the Concordance verification record; they are not Quotation failures.
