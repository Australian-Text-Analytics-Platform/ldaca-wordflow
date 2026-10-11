# Settings restoration verification

This record describes the original local work preserved in `81defecd0`.
Its later reconciliation with the approved v0.7 integration retains permanent
server projects, inline window-memory LDaCA tokens and the theme audit. The
current combined acceptance record is in
[v0.7 integration acceptance](../../active/v07-native-integration/acceptance.md).

Local implementation and acceptance completed on 2026-10-03 (Australia/Sydney).
No project-format change, legacy credential migration, production storage edit,
commit, push or release publication was performed.

## Visual and usability review

Every setup, action, results and follow-up lesson was inspected in the rendered
application before browser E2E acceptance: Data Loader, Preprocessing, Frequency,
Concordance, Plots, Topic Modelling, Quotation, Annotation and Export (36 lessons).
Synthetic data and real local analysis results made the results/follow-up targets
available. Light/dark, desktop, 992px and 390px layouts were inspected, along with
startup and workspace Settings. Subsequent browser resize acceptance inspected
the Preview controls at 1280px and 800px window widths.

An independent Luna agent used a nontechnical humanities-researcher persona to
review the live Test app. This was a simulated novice review, not human research.
Its findings led to explicit repeated-import wording, an Annotation setup anchor
covering Document/Annotation/Codebook controls, and narrower Export setup copy.
An independent Impeccable reviewer inspected the 36 lesson captures and additional
layout captures, then approved the fixes to Concordance, Topic Modelling and
Quotation action placement after fresh desktop/narrow captures.

The final native webview screenshots were also inspected: General Settings and
the direct-import Data Loader action hint. The latter highlights Choose files
and explains that desktop imports happen immediately. Web hints instead explain
the library Import action. The Settings screenshot waits for the opening
animation to settle.

Review captures remain local test artifacts in `/private/tmp/wordflow-driver-visual`,
`.impeccable/review`, and `frontend/.tmp/wdio/{server,native-debug}`. They contain
synthetic data only and are not distributable application assets.

## Observed checks

| Check | Result |
| --- | --- |
| Frontend tests | 172 files, 778 tests passed; 17 Node tests passed |
| Focused guidance tests | 10 passed, including temporary target loss and Driver visibility closure recovery |
| Frontend lint, formatting, tooling typecheck, build | Passed |
| Knip and source graph | Passed; no unused reachable source, four existing configuration hints |
| Server browser E2E | 10 passed across guidance, isolation and project/data workflow specs |
| Annotation browser E2E | 2 passed, manual drafts and real inference through a synthetic local provider |
| Native webview E2E | Settings, preferences and Annotation: 4 passed; opt-in Apple inference case skipped |
| Native Settings capture rerun | Passed with settled animation and inspected screenshot |
| Native process restart | Both phases passed; UI preferences retained, session Portal credential absent after restart |
| Affected Rust package tests | 312 passed, 15 existing ignored tests |
| Rust formatting and strict Clippy | Passed for affected packages |
| API drift, version checks | Passed |
| Bundled help drift and publication sync | Passed |
| Documentation links and Mermaid fences | Passed |
| Whitespace diff check | Passed |

Browser acceptance used Chrome 154 on macOS, isolated Test directories and
synthetic credentials. Native acceptance used the actual Tauri WebKit webview,
`au.edu.ldaca.wordflow.test`, a **debug, instrumented** bundle, fresh test-owned
browser stores and Test preferences. Tests removed their owned stores, projects
and caches at teardown. None of this is uninstrumented release acceptance.

The tests cover startup availability, focus restoration, workspace draft
preservation, shared AI/Portal shortcuts, disabled and reset guidance, protected
Data Loader visibility, all nine setup targets, real Frequency results, project
exports, acknowledgment persistence, outside/Escape deferral, modal/editing/work
suppression, viewport containment and resize recovery. Native tests additionally
cover Portal save/replace/confirmed clear, metadata-only credential reads, absence
of synthetic secrets from preferences, cross-window updates and process lifetime.
Unit/Rust checks cover preference upgrades and merging, invalid/future file
preservation, browser-account partitioning, operation headers and credential-store
failure behavior.

## Reproducible commands

Run GUI suites serially: they share the isolated Test storage owner.

```sh
vp -C frontend run test
vp -C frontend run lint
vp -C frontend run format:check
vp -C frontend run typecheck:tooling
vp -C frontend run knip
vp -C frontend run build
vp -C frontend run test:e2e:server
vp -C frontend run test:e2e:browser --spec e2e-browser/annotation.spec.ts
vp -C frontend run build:e2e:native
vp -C frontend run test:e2e:native --spec e2e-native/settings.spec.ts --spec e2e-native/preferences.spec.ts --spec e2e-native/annotation.spec.ts
vp -C frontend run test:e2e:native:preferences
cargo fmt --all --check
cargo test -p wordflow-backend -p wordflow-server -p wordflow-storage -p ldaca-wordflow --locked
cargo clippy -p wordflow-backend -p wordflow-server -p wordflow-storage -p ldaca-wordflow --all-targets --all-features --locked -- -D warnings
vp run api:check
vp -C frontend run versions:check
vp -C frontend run docs:sync-publish
vp -C frontend run docs:check
vp run docs:links
git diff --check
```

## Acceptance limits

The real multi-user Linux worker lane was not run on this macOS host. The proxy
browser tests demonstrate prefixed URLs and HTTP isolation; they do not substitute
for rootless containers, cgroup/network limits or the actual Binder deployment.
Run the existing Linux acceptance lane before shipping affected worker changes.

Signed/notarized production packaging, Windows acceptance, uninstrumented release
visual/performance checks, native file choosers/Finder integration, actual OS
credential-store interaction and live Apple Foundation Models inference were not
validated in this local lane. Use the isolated release/OS acceptance lanes described
in the [desktop runbook](../../../docs/runbooks/desktop-runtime.md). Synthetic
credential adapters exercised success/failure paths without real user secrets.
