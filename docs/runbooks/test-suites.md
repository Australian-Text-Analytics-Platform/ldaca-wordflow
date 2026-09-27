# Test suites

Active application CI runs Rust, Tauri, frontend unit tests, Rust-preview E2E
and embedded-WebDriver native tests on macOS and Windows. The optional
`polars-text` adapter retains its independent Rust/Python checks. Retired FastAPI,
Playwright and serialized-plan tooling is reference material under
[archive/](../../archive/README.md), outside the active test commands.

Release workflows do not run these suites. CI also validates the server package
on Linux/macOS/Windows, direct browser file management, and the clean macOS
application's Quick Look and resource loading. See the
[release runbook](wordflow-release.md) for the job/platform mapping.

Tests protect observable results, caller boundaries and recoverable state. Prefer
exact values, error categories and persisted effects over implementation-name,
field-inventory or container-type snapshots. Keep rare failure cases when their
consequence is data loss, cross-user access or work continuing after cancellation.

## macOS GUI execution boundary

Run Chrome/WebDriver and Tauri GUI tests from a normal user session. When using
Codex, request approved execution outside its command sandbox for these test
commands. Unit tests, lint, type checks and builds can remain sandboxed where
their required files and services are accessible.

The browser launcher service rejects the known `CODEX_SANDBOX=seatbelt` macOS
environment before starting its hosts. The native runner checks before
allocating a profile or starting its cleanup helper; use the named native test
commands rather than invoking its WebDriver configuration directly. This prevents the observed
`_RegisterApplication` startup aborts; it is not a universal sandbox detector.
Do not unset the marker to bypass the guard: that does not remove restrictions.
Connection retries remain disabled. If startup still fails outside this known
environment, inspect the driver log and crash report before retrying.

Codex's execution restrictions are separate from Chrome's renderer sandbox and
macOS App Sandbox entitlements. macOS browser tests retain Chrome's sandbox;
the existing Linux CI `--no-sandbox` policy is unchanged and not validated by a
local macOS pass. Running outside Codex's sandbox requires neither administrator
access nor disabling macOS security. Temporary projects, browser profiles and
test-owned configuration remain required; see the
[native isolation procedure](desktop-runtime.md#automated-native-tests).

## Ownership and fixtures

The native backend keeps unit and runtime regressions beside the owning Rust
modules. `backend/tests/projects.rs` covers project persistence and
`backend/tests/cli.rs` exercises the standalone executable. Use temporary DuckDB
projects and local fixture files; do not point tests at a developer project.

Native text and data tests live in `ldaca-rs`, with data fixtures under
`tests/fixtures`. The core has no Python bindings. The independent
[polars-text repository](https://github.com/Australian-Text-Analytics-Platform/polars-text)
tests public Python calls, lazy execution, null handling and exact Series
schemas against its compiled extension.

Frontend Vitest tests stay beside the owning feature or component. Shared MSW
handlers provide typed transport fixtures; scenario-specific lifecycle changes
belong in the test's local handlers. Begin event tests in a different state from
their expected result so ignoring the event cannot pass the test. Restore spies,
timers and temporary files even when an assertion fails.

JSDOM can exercise measurement decisions with supplied bounds, but CSS class
inventories do not prove clipping, spacing or native window appearance. Preserve
real interaction, accessibility and data transformation checks. Browser tests live
under `frontend/e2e-browser`; each spec owns a fresh Rust runtime and each
scenario clears its temporary project after accepted tasks have settled. WebdriverIO scenarios under `frontend/e2e-native` exercise
the actual Tauri host; see the [native testing procedure](desktop-runtime.md#automated-native-tests).

## Representative file-import journeys

Default browser and native `research-*.spec.ts` suites import repository-owned
[synthetic research files](../../frontend/e2e/fixtures/README.md) through Data
Loader before configuring and running analyses through UI controls. They cover
Plots, Frequency, Concordance, Quotation, Topic Modelling and Annotation with
moderate-sized, varied data,
normal-width screenshots and supplementary narrow/light/dark checks. Read-only
queries assert complete output counts, aggregates and original-row publication.
The shared `research-workflow` journey joins two imported files with duplicate
and missing keys, analyses the result and publishes independent original rows.
Plot selections are checked against exact source identities, including coincident
Scatter points and overlapping Sankey transitions. Annotation exercises exact
label changes, Fill missing, partial failure, authentication rejection and
cancellation against a deterministic external HTTP provider.

Export tests parse all five formats and verify exact values and ZIP members.
Fresh standalone runtimes open selected and complete project exports; this is
file-format persistence evidence. The native `project-reopen.spec.ts` additionally
opens, deduplicates, closes and reopens a saved project window through the desktop
coordinator. It checks requests, analysis identities, values and absent task history.
It uses the real exporter to create a disposable project and does not automate the
OS save chooser or claim full application-quit/relaunch coverage. Test-only
capabilities permit focusing the native window for visible keyboard feedback and
the standard window-close command, which reaches the normal Close coordinator.
WebDriver window destruction would bypass that lifecycle and is not a substitute
for this check.

Native delivery uses the Data Loader file-drop path; OS chooser automation remains
separate. Small SQL-seeded regressions and optional capacity benchmarks retain
separate responsibilities. The fixture README owns regeneration and exact counts.

Run the shared journeys on either host:

```sh
pnpm -C frontend test:e2e:browser --spec e2e-browser/research-plots.spec.ts --spec e2e-browser/research-text.spec.ts
pnpm -C frontend test:e2e:native --spec e2e-native/research-plots.spec.ts --spec e2e-native/research-text.spec.ts
```

## Session error checks

Browser and native WebdriverIO tests automatically check application session
errors. Declare an intentional failure before triggering it:

```ts
import { expectAppError } from './diagnostics';

expectAppError(/missing_task_source/); // Exactly one occurrence.
```

Native specs import the same helper from `../e2e-browser/diagnostics`. Pass a
second argument for an exact count greater than one. Match the expected diagnostic
closely; do not allow every error in a scenario. Extra errors, missing expected
errors and a broken capture bridge fail Mocha teardown even when ordinary UI
assertions pass.

Instrumented hosts send each diagnostic to a temporary runner-owned loopback
HTTP collector. Only its endpoint configuration survives reload in test-only
session storage; application error history remains memory-only. Capture is
enabled by the Rust-preview E2E host or the native `e2e` build, never by ordinary
production builds. Teardown writes `<test-title>.errors.json` alongside browser
or native screenshots under `frontend/.tmp/wdio/`, including records from before
reload or Clear and any diagnostic-check failure. Capture adds no polling to
ordinary UI commands.

Before WebdriverIO forces a document reload, the test-only bridge aborts pending
reads through their cancellation signals. Accepted mutations and tasks retain
their normal lifetime. WebDriver can tear down a WebView's network requests
before DOM unload events run, so an unload handler alone is insufficient.

The pinned embedded driver (1.4) omits `MouseEvent.view` from its synthetic drag
events. Native test setup supplies the originating window for those events so
D3 can attach its drag listeners. This adapter does not run in ordinary builds
or change trusted user input. Graph drag tests must send an intermediate move
past React Flow's click threshold before moving to the destination.

That driver's special-key path also drops modifier flags. Shared plot journeys
use the supported Shift+Space selection gesture, whose regular-key path preserves
Shift, and assert the exact inclusive range of published source rows. Native
multi-window tests target IPC with `withExecuteOptions({ windowLabel })` explicitly;
switching the WebDriver window alone does not update the service's cached IPC target.

The native runner retains but does not fail on the embedded macOS driver's
`stale element reference` protocol signal when its stack contains only the
driver's injected document-root frames. The same message from an application
frame, or any other exception, still fails. This exception is test-only; the
application recorder has no driver-specific filtering.

## Ordinary checks

Run package commands from the indicated directory, without setting `PYTHONPATH`.
The [development runbook](development.md) covers environment setup.

| Directory | Checks |
|---|---|
| `backend` | `cargo fmt --check`, `cargo test --locked`, `cargo clippy --all-targets --all-features --locked -- -D warnings` |
| `frontend/src-tauri` | `cargo fmt --check`, `cargo test --locked`, `cargo clippy --all-targets --all-features --locked -- -D warnings` |
| Independent `polars-text` repository | `cargo test --locked`, `cargo clippy --all-targets --all-features --locked -- -D warnings`, `uvx ty check`, `uv run pytest -q -m 'not model and not network'` |
| `ldaca-rs` | `cargo test --locked --all-features`, minimal/data/text feature checks, `cargo clippy --all-targets --all-features --locked -- -D warnings` |
| Repository root (frontend) | `pnpm -C frontend test`, `pnpm -C frontend lint`, `pnpm -C frontend typecheck:tooling`, `pnpm -C frontend build`, `pnpm -C frontend docs:check` |

From the repository root, run browser checks with `pnpm test:e2e` or
`pnpm test:e2e:browser`. For native checks, run `pnpm build:e2e:native`, then
`pnpm test:e2e:native`. These aliases forward to the frontend scripts, including
extra arguments; spec paths remain relative to `frontend/`, for example
`pnpm test:e2e:browser --spec e2e-browser/concordance.spec.ts`.

WebdriverIO owns an Untitled
test project, the Rust backend and Vite server, then cleans up its processes.
On a clean checkout, first run
`cargo build --locked --manifest-path backend/Cargo.toml --bin wordflow-api-dev`
so the initial DuckDB build is outside the test host's readiness timeout.
Each browser scenario starts with fresh browser storage and an empty database.
A new backend process per spec prevents an engine/catalogue failure from
contaminating unrelated specs. Native scenarios release any previous editor by
reloading, settle/cancel tasks, dismiss completed tasks, clear test schemas and
tabs, and reload the empty project. Setup and cleanup failures fail the test;
they are not swallowed as expected application errors. Select
a file with `--spec ./e2e-browser/build.spec.ts` or scenarios with
`--mochaOpts.grep "palette drag"`; do not point tests at a developer project.
Screenshots, downloaded evidence and diagnostic records are uploaded on successful
and failed CI runs. Browser artifacts live in `frontend/.tmp/wdio/browser/`. Portal SDK acceptance is explicitly
provisioned with `WORDFLOW_SDK_ACCEPTANCE`; a skipped portal scenario is not portal
acceptance evidence. Native webview checks run through WebdriverIO; OS integration
and release packaging still require separate packaged-app checks. Native debug
and release-profile automation are separate CI gates; final acceptance uses the
clean release bundle. The [desktop runbook](desktop-runtime.md#automated-native-tests)
defines commands, build identities and evidence locations.

The shared browser/native reset removes every test-created user schema, including unregistered
objects and named types, before recreating `data`. Test cleanup must
wait for accepted mutations to complete before dropping their targets. A stale
preview label alone does not prove that a cast or Undo has finished.

Native polars-text CI executes base, tokenization, embedding,
tokenization-plus-embedding, topic-modeling, quotation and full configurations.
Compilation alone does not execute Rust assertions.

Saved-request compatibility has separate UI cases for all ten current analysis
kinds. They retain intentionally incompatible JSON, inspect escaped warning values
in light/dark and normal/narrow panes, and verify that only an accepted Run
replaces unsupported saved settings. These cases intentionally seed saved JSON
through SQL; ordinary file-import journeys do not bypass Data Loader.

Use event/notification handshakes to prove a request or competing operation has
started. Bound waits and cleanup, release blocked fixture requests in `finally`,
and repeat changed cancellation/concurrency cases. Do not introduce a parallel
runner just to hide an unnecessarily slow fixture.

## Model and network checks

Quotation browser and native E2E scenarios run by default. Before the first run,
prepare the pinned model from the repository root:

```sh
pnpm prepare:e2e:models
```

This explicit preparation command downloads the native extractor's pinned UDPipe
model, verifies its SHA-256, and installs it in the same OS cache used by the app.
An already valid model is reused without network access. Set
`WORDFLOW_QUOTATION_MODEL` to an absolute path to override the cache location for
both preparation and execution. The filename, URL and checksum come from the
native extractor's constants, rather than a second model inventory.

E2E scenarios verify the file offline before invoking Quotation. A missing or
corrupt model fails the scenario with preparation instructions; it is not silently
skipped or downloaded during testing. Selecting unrelated spec files does not
require the model. Browser and native CI jobs prepare it explicitly before testing.
The application still retains its normal download-on-first-use behavior.

Quotation model tests require a separately provisioned pinned UDPipe model. The
[polars-text development runbook](polars-text-development.md#quotation-verification)
contains the download and native/Python commands. `--require-models` makes an
explicit Python model job fail if its required model file is unavailable; the
ignored native model test similarly fails if explicitly selected without its
model. Missing/corrupt-model tests remain offline and run normally.

Backend Quotation acceptance uses ignored Rust model tests. Point both
`WORDFLOW_TEST_UDPIPE_MODEL` (engine tests) and `WORDFLOW_QUOTATION_MODEL`
(runtime/API tests) at the provisioned model, then run from `backend`:

```sh
cargo test --locked quotation -- --ignored
```

Live Hugging Face and dictionary tests remain opt-in via
`POLARS_TEXT_RUN_HF_TESTS=1`, `POLARS_TEXT_RUN_LINDERA_TESTS=1` and
`POLARS_TEXT_RUN_LINDERA_JIEBA_TESTS=1`. Run the applicable `-m network` tests only
when intentionally testing downloads and model predictions. Schema, null and
empty-input tests use the native tokenizer and need no such downloads.

## Installed artifacts

For the supported `polars-text` adapter, build wheels with Maturin, install the
exact artifact into a fresh environment,
change to a directory outside the checkout, then run pytest with the absolute
path to the package's tests. Do not use an editable installation as wheel evidence.

Full polars-text wheels run the binding suite and provisioned quotation cases.
Reduced base/tokenization/quotation wheels run `test_installed_features.py` to
exercise available calls and missing-feature errors. Source distributions are
rebuilt into wheels and exercised again, including quotation native source.
Platform CI covers Linux x86-64, macOS arm64 and Windows x86-64; a local macOS run
cannot substitute for the other platform jobs.

## Targeted audit tools

Use [Coverage.py measurement contexts](https://coverage.readthedocs.io/en/latest/contexts.html)
when investigating execution overlap. Set `dynamic_context = test_function` in a
temporary coverage configuration; shared executed lines do not prove duplicate
assertions. Keep coverage measurements separate from ordinary suite timings.

Bounded [Proptest](https://proptest-rs.github.io/proptest/intro.html) properties cover
Unicode offset/source mapping and tabular value preservation alongside readable
fixed regressions. Preserve useful generated counterexamples as fixed cases.

Use [cargo-mutants](https://mutants.rs/) selectively against the production
function whose assertions were strengthened. Record surviving changes and inspect
whether they are equivalent or expose a gap. Do not add a mutation score, coverage
percentage, deletion quota or test-count gate.

### Pane sizes in frontend E2E

Main workflows use the product's normal 70/30 tool/graph split. Browser scenarios
start in fresh sessions; native scenarios reset the persisted sidebar width
and graph ratio as part of project isolation, so earlier responsive checks cannot change a
later scenario's baseline. Tests still explicitly cover narrow tool panes and
wide layouts. Use the shared `setAnalysisPaneSize` helper, whose assertions follow
the splitter's measured bounds, and restore normal sizing after responsive checks.
Normal-width screenshots are the primary visual reference; narrow screenshots
supplement them. Persistence tests exercise resizing and reload within one scenario.
