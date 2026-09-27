# Schema reset verification

Verified locally on macOS on 24 September 2026. Application version remains
0.8.0; the new database contract is integer `schema_version = 1`.

## Automated checks

| Boundary | Observed result |
|---|---|
| Backend locked tests | 101 library tests, 2 CLI tests and 53 project integration tests passed. The integration subprocess helper is exercised by its parent test. |
| Provisioned native models and benchmark | All 106 library tests passed with `--include-ignored`, using the local English UDPipe model for both model environment variables. This includes the dense Concordance benchmark and Quotation lifecycle tests. |
| Tauri locked tests | 33 passed. |
| Rust formatting and strict Clippy | Backend and Tauri passed, including all targets and features. |
| Frontend unit tests | 137 files and 616 tests passed with two workers. The final cache-test lint adjustment was followed by its four passing focused tests. |
| Frontend static checks | Formatting, lint, tooling TypeScript, production build, unused-code/source graph, documentation drift and version checks passed. |
| Browser WebdriverIO | All 28 suites passed across the initial run and targeted rerun. The final four-suite rerun passed 21 tests. |
| Native WebdriverIO | All 11 suites passed across the initial run and targeted reruns against the rebuilt Tauri application. |
| Quick Look | Extension build, contract tests and Swift reader/rendering tests passed. |

Browser and native tests retain unexpected-session-error detection. Normal pane
widths remain the main baseline, with additional narrow and light/dark coverage.
Fresh browser and native screenshots were inspected separately for the three
analyses and compatibility warnings.

The first runs exposed stale test fixtures for the removed table/pointer names,
an unquoted `data` schema in a custom-type cast, and a new-input selection timing
problem. Those were corrected. The initial preview-close browser failure passed
on its focused rerun without a production change. Two unit tests exceeded their
timeouts during concurrent heavy builds; the complete suite passed with two
workers without changing test timeouts.

## Actual Finder verification

A new named project with a Unicode filename, a registered Table and a completed
Frequency analysis was created and saved through the current backend. Finder's
actual Quick Look window rendered its description, file metadata, one Data Block,
Table kind and column count using the rebuilt extension.

The first attempt selected an older registered extension. Updating the extension
in the local build bundle, preserving its sandbox entitlement and re-registering
that bundle resolved it. `qlmanage` also crashed in ExtensionFoundation before
loading the extension; the direct Finder verification succeeded. No installed
application or saved user project was replaced. The temporary backend and Finder
window were closed after verification.

## Platform limits

Linux and Windows were not executed on this macOS host. Their existing CI matrix
checks remain in place; this record does not claim remote CI or signed release
verification. No release was published.

## Contract coverage

Regressions cover read-only rejection (including legacy `format_version = 1`),
atomic analysis replacement, publication rollback and deletion races, Clear
retaining the request, missing/broken outputs, independent published Tables,
qualified and nested Arrow annotations, source deletion, rename reconciliation,
late query responses and unrelated-cache preservation. Existing algorithm and
export checks continue to pass against the new ownership contracts.

The retired-name audit found only intentional legacy-rejection references in
active source/documentation. Historical and archived material is preserved.
