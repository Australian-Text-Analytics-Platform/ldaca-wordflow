# Integration acceptance record

## Batch 1 foundation: shared contracts and presentation

Implemented public CSV/XLSX/JSON/Parquet exports, original-text publication with
native collision rejection/suffixing, guarded asynchronous rename, full-source
strict conversion, friendly type labels, exact timestamp decoding and local
Data View/conversion/publication/result error panels. Tab task cleanup is included
at the shared runtime boundary; server/window acceptance continues in batch 3.

Observed checks:

- Backend library: 194 passed, 14 explicitly optional tests ignored. Includes
  export reopening, reserved-source-text publication, strict View conversion,
  name collision and deleted-tab late-completion regression tests.
- Backend integration: 57 passed, one subprocess helper ignored. Public formats
  reopen as expected and internal Arrow retains extension metadata/exact values.
- Frontend: 725 unit tests and 17 script tests pass, including one-record
  diagnostic capture under Strict Mode.
- Frontend production build, lint, Knip, generated API checks, docs drift and
  internal Markdown links pass. Existing vendor C++/macOS linker warnings remain.
- Chromium export acceptance passes: all 480 source rows across four formats,
  single `Data` worksheet, ZIP members and portable project reopening. All six
  Chromium conversion tests and the diagnostics browser test pass.

Form-specific error adoption continues with the Editor and analysis batches.
Native macOS/WebKit, Windows, broader analyses and full browser acceptance remain
outstanding. This record does not mark the complete integration accepted.

## Batch 2 foundation: native file planning and server library

Added shared inspection/atomic import for all approved table formats, workbook
sheets and mixed text/table folders and ZIPs. Arrow extension annotations map to
the native nested schema. Server folder selection, moves, multiselection, batch
deletion and structure-preserving ZIP downloads use existing owners. Upload cards
and receiving-folder protection are included at this shared file boundary.

Observed checks:

- Backend: 204 library tests passed, 14 optional tests ignored; 57 integration
  tests passed, one subprocess helper ignored; two CLI tests passed. Ten import
  tests cover every reader, exact large integers/nanoseconds/nested annotations,
  workbook selection, encoding policies, overlapping paths, hidden/link/nested-ZIP
  handling, traversal bounds, cancellation and atomic failure.
- Server: nine library and seven lifecycle tests passed. Concurrent upload tests
  verify protected ancestors, complete-batch preflight, unrelated-folder use and
  protection release. ZIP entries retain original folder paths.
- Frontend: 730 unit and 17 script tests passed. Focused import/schema/upload
  tests passed. Production build, lint, Knip, generated API checks, docs drift,
  Markdown links, Rust formatting/strict Clippy and diff whitespace checks pass.
- Chromium: the existing two themed Loader journeys pass. The mixed ZIP journey
  passes sheet selection, original text order, skipped-file reporting and an
  immediate text-only folder import. A discovered macOS OS-alias rejection was
  fixed and covered by a regression test.

LDaCA catalogue/member imports remain outstanding in batch 2. Permanent server
projects and remaining task navigation follow in batch 3. Native OS picker,
WebKit, Windows and broader server-browser acceptance remain outstanding.

## Batch 2 LDaCA completion

The collection catalogue loads on opening LDaCA and filters locally. Text access
and public metadata-only choices remain distinct. Member crates use bounded
index discovery, nonrecursive metadata requests, sequential preparation and one
atomic combined import. Referenced speaker/person fields accompany documents and
metadata. Invalid encoding uses replacement plus affected-file reporting; local
text-folder skipping remains a separate policy. Tokens remain in window memory.

Observed checks:

- The live portal configuration and OpenAPI were checked before implementation.
- All-feature library suite: 107 unit tests and 23 data integration tests passed;
  two explicitly model/download-dependent tests ignored. Data-only compilation
  and the 19 focused client/tabulation tests pass.
- Native LDaCA fixtures verify member failure rollback, retained invalid text,
  speaker fields, metadata-only zero downloads, task ownership and cancellation.
- Frontend: 731 unit and 17 script tests passed; focused LDaCA/import/schema
  tests passed. Production build, lint, Knip, generated API, docs and links pass.
- Chromium: all three Loader journeys pass, including both themes and mixed ZIP
  sheet selection. Live authenticated collection import and platform-native
  picker acceptance remain outside this local fixture evidence.

Batch 2 behavior is implemented; global native/platform acceptance remains open.

## Batch 3: permanent server projects and task lifecycle

New creates an immediately permanent `Untitled-X.wfpj`. Server Rename preserves
the runtime identity, data, subscriptions and task history, rejects active work
and Table editing, and updates attached windows. Duplicate creates a library
file without opening or selecting it. Close retains the project file. Switching
keeps independent inputs and background work. Tasks use current tab names and
Open tab; deleting a tab purges associated history while retaining import tasks.

Registry, preferences and native events share one SSE connection per server
window, including root-path deployments. This fixes observed HTTP/1 connection
starvation with three attached windows. File-operation workers retain their
mutation gate and upload protection through completion even if HTTP disconnects.

Observed checks:

- Backend full suite: 206 library tests and 57 integration tests passed, with
  14 optional library tests and one subprocess helper ignored; two CLI tests
  passed. The subsequent case-only rename regression also passes. Five focused
  rename library tests and three integration tests pass, including idle/editor
  guards, collision rollback, case-only names and reopen with subsequent writes.
- Server: nine library and nine lifecycle tests passed. The latter includes
  disconnected-upload cleanup and combined native/registry event delivery.
- Frontend: 735 unit and 17 script tests passed; the later root-path regression
  passes within 11 focused task/event tests. Production build, lint, Knip,
  generated API, documentation and link checks pass. Strict Rust Clippy and
  formatting pass. Isolated server documentation tests pass after avoiding a
  concurrent generated-API cargo build that replaced compiler artifacts.
- Chromium: all five server isolation tests and the file/project workflow pass.
  They cover three-window rename/preference broadcasting, shared close,
  independent inputs, switching during a running SQL task, current tab names,
  Open tab, deletion/history cleanup, permanent library reopening and restart
  persistence. The workflow also exercises a narrow pane and project download.

No public release or production storage was modified. WebKit, native macOS and
Windows acceptance remain in the global platform lane.

## Batch 4: native Data Editor and Data Builder

The Editor occupies the former graph area above a collapsible Data View. Its
existing window-local draft owner feeds ordinary SQL into shared Preview/Apply.
Successful Apply closes its captured form; failed Apply keeps editable values and
an inline original diagnostic. Multi-column changes/deletion are atomic, preserve
Table physical types and constraints, and add one undoable live View layer.
Native text functions remain registered after project reopening.

Builder now offers Filter, Group, Join, Aggregate, Sample, Deduplicate, Stack,
Build and SQL. Group outputs and the Deduplicate pair use one native batch
transaction. Exact filter bounds, guarded statistics prefilling, whole-day date
ends and Topic Coverage STRUCT access use the same SQL for Preview and Apply.

Observed checks:

- Backend: 213 library tests, 57 integration tests and two CLI tests passed;
  14 optional library tests and one subprocess helper remain explicitly ignored.
  Seven focused mutation tests cover rollback, exact decimal/nested metadata,
  simultaneous edits, lazy Views, one Undo and atomic View batches. Three native
  text-function tests include saved View reopening.
- Native text/data library: 108 unit and 23 integration tests passed; two
  model/download-dependent tests remain ignored. No-default, tokenisation-only
  and data-only compilation pass. The tokenisation-only lane retains its existing
  unused cache-fingerprint warning. Strict all-feature Clippy and formatting pass
  for the library and backend.
- Frontend: all 739 unit tests and 17 script tests passed. One diagnostics test
  required a focused rerun with permission for its loopback fixture. Production
  build, lint, Knip, generated API, bundled-doc drift and internal links pass.
  Seven focused header tests also pass, including the subsequent regression for
  retaining an open menu and name draft when refreshed column definitions arrive.
- Chromium: all five Editor and ten Builder journeys pass. These exercise
  literal/Regex/CJK matching, templates and zero-row constants, all Count modes,
  directional splitting, parser-based XML, exact types and copied nested metadata,
  atomic failure, live source updates and one Undo. Group date/range counts,
  optional aggregate order, NULL-excluding distinct counts and duplicate kept flags
  are checked against native values.
- All six native conversion browser checks pass, including named SQL types,
  exact decimal/nested casts, full-source failures, datetime discovery and manual
  formats. An observed menu remount during refresh was fixed and retested.
- Editor browser checks retain typing focus, accept suggested names with Tab,
  preserve failed drafts without a toast, close on successful Apply and collapse
  Data View. Malformed XML after the first 200 rows is counted and inspectable
  without changing Apply membership. Actual light/dark screenshots at 1000×760
  were inspected; wrapping and scrolling remain available.

The bundled tutorial and canonical native contracts/domain/ownership pages are
updated. Shell labels, compact headers and content-based panel sizing continue in
batch 7. WebKit and native macOS/Windows acceptance remain open globally.

## Batch 5: retained Topic stages and captured metadata

Explicit Run always enters the full segmentation, embedding-cache, reduction,
clustering and representative-word path. Automatic segmentation keeps paragraphs
separate and retains short text. The native maximum-size setting is fixed or
unlimited; independent library Auto behavior remains intact. Concrete reduced
vectors, labels and projection context belong to the analysis, while full segment
embeddings remain in the existing exact cache. Adjustments start at clustering or
representative words, preserve the last valid model on failure and replace derived
artifacts atomically. Missing older intermediates require explicit Rerun.

One-input metadata groups and assignments are captured with source documents.
Dominant-document counts and each group's own share appear throughout the UI and
figures, independently of the retained Top-N bubble-area measure. Larger bubbles
draw first with unchanged coordinates. Search supports escaped glob matching over
joined and individual representative words.

Observed checks:

- Backend: 215 library tests, 57 project integration tests and two CLI tests pass;
  14 optional library tests and one subprocess helper remain explicitly ignored.
  Atomic/stale/cancelled replacement, old-intermediate errors, Clear cleanup,
  captured metadata, Unicode whitespace and stale publication regressions pass.
- Text engine: 110 all-feature library tests and 23 data integration tests pass;
  two optional model tests remain ignored. Focused retained-stage tests verify
  reduction/cache reuse, no inference/backfill, tokenizer-only clustering reuse
  and independent Auto policy. Topic-only and data-only feature checks pass.
- Frontend: 743 unit and 17 script tests pass. Nineteen focused Topic/API tests
  pass after revision guarding; production build, lint, Knip, generated API,
  docs drift, Markdown links, Rust formatting and strict Clippy pass.
- Chromium: both real-model journeys pass. The 60/40 sampled Preview and 96/64
  full Run retain typed source data; publication follows original row order and
  disables colliding optional metadata. Figure PNG/SVG/JPEG/ZIP downloads pass.
  Captured one-input metadata survives later source edits; downstream adjustment
  preserves original Run provenance and one task row, rejects stale revisions,
  and retains the visible chart after a missing-intermediate failure.

Windows and native WebKit acceptance remain open. Explicit full-stage Run entry
is source-verified and exercised with real models; this record does not claim
per-stage profiling counters. Existing vendor/linker warnings remain unchanged.

## Batch 6: research results and charts

Frequency preserves explicit corpus roles and presentation order, while new
keyness results measure Study against Reference without changing saved historical
mathematics. Full-token per-million values and exact file exports share native
statistics. The multilingual picker labels licensed LDaCA presets and library
alternatives, with readable tokenizer names and About links.

Concordance stores contiguous document bands outside captured source metadata,
after whole-result sorting/filtering and before pagination. Quotation uses
three-line cells, clipped-only full highlighted hover and anchored details;
Annotation's full-row viewer includes unsaved drafts and comparison masks.
Result sort reset, chart wheel policy, raw-count overviews, selected bands/markers,
explicit Trends presentations and descriptive figure captions use shared helpers.

Observed checks:

- Backend: 218 library tests, 57 project integration tests and two CLI tests pass;
  14 optional library tests and one subprocess helper remain ignored. Native
  regressions cover historical keyness, exact denominators, cross-page bands,
  DATE periods and duplicate grouping. Strict all-target/all-feature Clippy and
  formatting pass.
- Text/data library: 110 library and 23 integration tests pass; three optional
  model/download tests remain ignored. A separate fresh-cache Neologd test passed
  download, load and reuse in 24.86 seconds with the 160 MiB budget. Strict Clippy
  and formatting pass.
- Frontend: all 752 unit tests and 17 script tests pass. Production build, lint,
  Knip, generated API checks, bundled-doc drift, Markdown links and diff checks
  pass. The later Compare regression verifies that reversing visual stacks does
  not reverse keyboard point order.
- Chromium: normal Frequency journeys, Concordance (two), Quotation (one),
  Annotation (two) and all seven representative/dense plot journeys pass across
  the full run and focused reruns. The focused rerun passes damaged-result
  Retry/Rerun and the three previously failing plot cases. Original engine errors
  remain beside the results, and stale tests now use the agreed labels.
- Concurrent timezone discovery reproduced a DuckDB ICU catalogue invalidation.
  Cloned project connections now reuse the primary connection's registered
  native functions. The matched DuckDB 1.5.6 ICU fixture passes 24 concurrent
  timezone requests and DST/date assertions after the fix.

Japanese classic-list attribution is available in the reviewed archived source;
its original primary website was unavailable for fresh verification. Native
macOS/WebKit and Windows acceptance remain open globally. Batch 7 completes
form-owned Run errors and shell wording. No publication or production storage
mutation was performed.

## Batch 7: shell, bundled Help and native windows

Tab Rename awaits confirmation, guards duplicate submission and retains editable
failed drafts. Active tabs reveal on mount, activation and target-slot changes;
resize preserves manual scrolling. Graph box selection and confirmed dependency
deletion share the native catalogue and one transaction, including cleanup of a
registered Data Block whose source was removed through SQL. No MiniMap remains.

Tools initially fits its content; manual resizing starts at the visible size.
Loader, Builder and Topics use short sidebar labels and full headers/accessibility
names. Builder actions use Add to Project. Editor and right-panel ratios remain
window-local until reload. The compact
Editor strip always offers an alphabetical Data Block picker. Bundled Help has
one initial anchor scroll below its measured header, responsive partner marks,
current terminology and the approved acknowledgement/concept DOI. Remote Help
loading and configuration are removed. The logo strip has two explained,
file-and-colour-specific theme exemptions.

Original Run, import, Preview, stopword and result errors remain with their visible
owners, with Retry and diagnostic actions. Import forms observe the existing task
query; they create no additional stream or task-state authority. Intentional navigation cancellation
does not appear as failure. A rejected result adapter no longer races an extra
projection request that produces a duplicate version error. Native feedback uses
independent windows; server feedback remains a dialog. Website links use the
external desktop browser, and Windows updater window creation is asynchronous.

Observed checks:

- Backend: 220 library tests, 58 project integration tests and two CLI tests pass;
  14 optional library tests and one subprocess helper remain ignored. The final
  missing-registration/case-insensitive deletion regression also passes. Strict
  all-target/all-feature Clippy and formatting pass.
- Tauri: 36 Rust tests and strict all-target/all-feature Clippy pass. Server:
  nine library and nine lifecycle tests pass; four storage tests pass. No
  production application process or project storage was modified.
- Frontend: 765 unit tests across 177 files and 17 script tests pass. The new
  regressions cover accepted-task diagnostic deduplication, cancelled reads and
  a failed enabled stopword list retaining its last valid display. Formatting,
  lint, tooling types, Knip and generated API checks pass.
- Chromium: all 37 spec files pass across the full run and focused reruns. The
  final reruns cover short sidebar labels, real failed-import Retry with one
  diagnostic and atomic recovery, file/workbook selection, both themes, current
  graph controls, pane minimums, sample Views/Tables and reopening, real-model
  Topics retained adjustments and PNG/SVG/JPEG/ZIP figures. The Topics selection
  action has a specific accessible name so it cannot be confused with stopwords.
- The live sample catalogue now includes non-Parquet collections. Its native
  Parquet-only contract remains unchanged: unsupported empty collections are
  omitted. Reddit plus Hansard GST import seven commit-pinned Views; individual
  speaker-detail selection materialises one Table in both themes.
- Fresh shell and anchored bundled Help screenshots were inspected in both
  themes. The shared tutorial screenshot now depicts the current three-column
  shell, Editor strip and upper/lower Data View. Help contrast checks pass.
- macOS WebKit: all 24 native spec files pass in one refreshed full run
  (five minutes). This includes both themes, Table/View Editor Apply and Undo, dependency
  deletion, independent feedback windows, task recovery, real-model Topics,
  representative-word and stopword adjustments, figure exports and whole-document
  publication. The embedded driver's native-select event adapter is test-only;
  this is not a physical OS picker or menu check.
- Native acceptance used the isolated Test identity, debug profile and
  instrumentation, final build 2026-10-09T20:10:40.383Z, executable SHA-256
  `974ffdd4290c5fb593154f1e9ca773765c0a08b96c32cb2dbf5f82907735b498`.
  All 24 spec files pass again against this final build (five minutes), with
  test-owned browser/cache storage removed after teardown.
  This evidence is not uninstrumented production packaging acceptance.

- Uninstrumented macOS release bundle: normal production frontend guards and
  optimized native build pass. Deep/strict code-signature and Quick Look extension
  checks pass with ad-hoc signing, identity `au.edu.ldaca.wordflow`, version 8.0.0,
  final executable SHA-256 `c3ff7a709a8dd4a34c82cf2016b3ebf48c7d1a21264ef153f1cd6ae5a26fb1f9`.
  The final main executable links only permitted macOS system libraries; its
  bundled Quick Look extension also passes deep/strict signature verification.
  The production bundle was not launched. This verifies static packaging, not
  Developer ID/notarization or production-runtime acceptance in a dedicated VM.

Chromium emits the existing benign ResizeObserver-loop warnings already filtered
by the application. Native UDPipe/linker warnings and expected jsdom canvas
limitations remain; no Safari remount or geometry workaround was introduced.
Windows native behavior, physical native pickers/Help menus and signed production
packaging remain open.

## Batch 8: original production artifact promotion

The manual production build resolves the requested source ref once and passes
that immutable commit to desktop/server builds. Package evidence records the
actual checkout, version, production identity, profile, workflow/run/attempt and
file digests. Promotion requires a previous successful production build run and
an existing matching version tag. It validates all five platform artifact sets,
expiry, identities, server checksums and updater signatures before any release
mutation. Packages are copied without repacking; checksums and updater manifests
are derived from those unchanged bytes. There is no rebuild fallback.

Observed checks:

- All six nonpublishing fixture tests pass. They cover a source commit different
  from the workflow head, incorrect run/tag/version/identity, ordinary CI,
  unsuccessful/expired/missing artifacts, debug/instrumented packages, changed
  bytes, missing signatures, unexpected files/links, wrong signing keys and
  modified trusted comments. Prepared packages are byte-for-byte equal.
- A fresh fixture signed by the installed Tauri CLI 2.12.1 verifies with the
  promotion validator; the temporary private key was removed. No release signing
  key was changed or exposed.
- Checksum-verified actionlint 1.7.12 validates every workflow. CI runs the new
  fixtures; build workflows retain build-only ownership.
- Canonical storage guidance documents hard-link requirements for upload,
  new-project/Save As and ICU destinations. Unrestricted application upload
  guidance and the existing manual cutover/rollback procedure remain canonical.
- The package linkage audit caught Arrow Avro's XZ codec selecting Homebrew
  liblzma. The backend now enables the codec's bundled static feature, preserving
  the strict packaging audit. All 11 native import tests pass, including a new
  compressed-Avro fixture that checks Unicode source values after import. The
  final uninstrumented macOS bundle passes the native dependency audit without
  that system-library dependency.
- Locked tests for backend, Tauri, server and storage pass after the static-codec
  change, followed by strict all-target/all-feature Clippy and workspace
  formatting. Generated contracts and bundled-documentation drift checks pass.
- The server browser acceptance uses the current Data Builder accessibility
  label. An additional lint invocation on that test file reports two pre-existing
  `no-invalid-fetch-options` warnings in its shared fetch helpers (lines 24 and
  193), outside the required frontend lint scope; the required lint run passes.

- The final optimized Apple Silicon server archive passes strict native linkage
  and ad-hoc signature checks, then extraction and execution outside the checkout.
  Its embedded production UI loads, startup downloads no optional resources,
  ICU downloads on first use, New immediately creates a permanent project, and
  Rename preserves the runtime ID and persisted file. Verification uses isolated
  Test storage and removes its processes/cache after teardown. Archive SHA-256:
  `ab337aec165bffc23938f9dfbcf79a2aacb4e00367236b00095bbd8c29762792`.
- All six server Chromium cases pass again against the final optimized binary:
  multiwindow project isolation, shared Rename, matching-name Builder draft
  isolation, background tasks, tab-history cleanup, restart and file/project
  workflow. Both spec files pass and their Test storage is cleaned afterward.

No GitHub production build or promotion workflow was dispatched and no public
release was mutated. Windows native behavior, physical OS pickers/menus and
signed production-runtime acceptance in a dedicated OS account/VM remain open;
the integration specification stays active until those gates pass.

## Local main reconciliation (2026-10-12)

The original uncommitted main work is preserved in `81defecd0`, based on
`ffdc9609`. Its Settings, contextual guidance, Project & Data manager, virtual
theme stylesheet and full-server development entry point are reconciled with
the native integration at `bdda690d3`.

The approved v0.7 decisions retain priority: server New creates a permanent file;
Rename requires an idle project and preserves its runtime ID; Duplicate keeps
the requesting window on its original project; switching retains background
work. The manager uses the existing upload-card owner and atomic import planner.
LDaCA access tokens remain inline and in window memory, with an informational
Portal Settings section. The older server Save and host-stored Portal token
implementation remain in the preservation commit only. The narrowly scoped
theme audit remains a build gate while Vite generates CSS from the pinned theme.

Observed reconciliation checks:

- The complete frontend suite passes: 806 tests across 184 files and 17 Node
  script checks. All nine development-entry-point tests pass.
- Locked backend, desktop, server and storage tests pass, followed by strict
  all-target/all-feature Clippy and Rust formatting. The server lifecycle test
  now expects closed permanent Untitled files to keep their names occupied.
- Frontend build, lint, tooling types, formatting, Knip and theme audit pass.
  Generated API, bundled-documentation drift, version and Markdown-link checks
  pass. Rust DTOs generate 110 backend operations and 134 combined client
  operations, including read-only host storage locations.
- All 12 server Chromium cases pass across the guidance, isolation and workflow
  specs. They cover Settings before project selection, every tool's guidance,
  real Frequency results/export, narrow panes, inline Portal access, shared AI
  management, independent project drafts, background tasks and file operations.
- All seven affected API-preview Chromium specs pass, with 22 cases covering
  Data Loader, Diagnostics, bundled Help/theme contrast, layout, Annotation,
  Builder and AI connections. The narrow manager and Frequency guidance
  screenshots were also inspected for wrapping, placement and visible controls.
- macOS WebKit Settings, preferences and Annotation specs pass: four cases cover
  Settings focus restoration, nonmodal guidance, independent-window preference
  synchronization, manual drafts and AI Annotation with a local test provider.
  The opt-in Apple Foundation Models live case is skipped. Settings and direct
  import guidance screenshots were inspected. This used the isolated Test app,
  debug profile and instrumentation, built at `2026-10-11T23:17:56.199Z`, with
  executable SHA-256
  `06154306d134835437615bb85d3655c0ea3046b77ae9b48ac0ac03ff82868f34`.
- A separate two-process native restart check passes: theme, layout, hidden
  tools and guidance persist in schema-version-2 preferences; the inline LDaCA
  token is absent from preferences and blank in the fresh process. Test-owned
  browser stores, processes and caches are removed by teardown.
- The rebuilt optimized Apple Silicon server package passes native linkage and
  ad-hoc signature checks. Extraction outside the checkout verifies embedded UI,
  no optional startup downloads, on-demand ICU, immediate permanent New and
  identity-preserving Rename. Archive SHA-256:
  `14ec04596494271182e8fe86fb3c761c5cf424efdb0d93561053d3ef78cfef4d`.
- Canonical bundled documentation was validated and mirrored to
  `ldaca-wordflow-docs` commit `ae84ba3589a09755645a677aa776d7b742a9d700`.
  Its branch was pushed before the application gitlink update. This also makes
  the previously missing `babcb5e35` commit fetchable, resolving the checkout
  failure in GitHub run `38182759270` before its package tests could start.

No production build/promotion workflow or public release mutation is part of
this reconciliation. The existing Windows native, physical OS picker/menu and
signed production-runtime acceptance gates remain open.

## v0.7.12–v0.7.13 batch 1: native SQL editing and categories

Added SQL Map values, native ENUM ordering, on-demand Corpus overview and bounded
Delete-column examples. Categorical Trends retains native order; rendering above
1000 groups returns an ordinary capacity error while preserving saved rows.
Native INTERVAL uses the elapsed time display label.

Observed checks:

- Backend full suite: 223 library tests, 58 integration tests and two CLI tests
  passed; 14 optional library tests and one subprocess helper remain ignored.
  Subsequent category regressions also pass, including unused ENUM labels.
- Frontend: all 808 unit tests and 17 script tests passed. Build, lint, Knip,
  generated API checks, bundled docs and Markdown links passed.
- Chromium: ten existing preprocessing journeys passed. After correcting a test
  fixture to submit one statement per SQL batch entry, the new native HTTP case
  passes Map Preview/Apply equality for Tables/Views, exact empty/missing values,
  category order and SQL overview/examples.
- Strict backend Clippy passes. Existing vendored UDPipe/compiler-linker warnings
  remain. CLI feasibility checks are not substituted for bundled-engine acceptance.

Live Colour by ordering, final WebKit/Windows UI acceptance and the previously
open physical native-control/signed-runtime gates remain outstanding. This is not
a completion record for the six-batch extension.

## v0.7.12–v0.7.13 batch 2: live results and publication ownership

New Topic, Concordance and Quotation runs store distinct exact texts and generated
outputs. Reads join checked texts to current source rows, preserving duplicates,
source order and current typed metadata. Processed empty outcomes remain eligible
for publication. Preview uses its sampled population only. Version-1 analyses keep
their historical meaning until Rerun.

First live publication upgrades the native project to format 2 inside the same
transaction that copies independent hidden relations and creates its live View.
Publications own cleanup, retain source lookup references and follow native
rename/schema invalidation. Opening version-1 projects does not upgrade them.
Result downloads use native all-page projections and the existing four exporters;
AI Preview exports only completed captured rows and manual drafts require Save or
Cancel. Column order is a presentation preference independent of sorting.

Observed checks:

- Backend package: 237 library, 58 integration and two CLI tests passed; 15 optional
  library tests and one subprocess helper ignored. Regressions cover
  first-publication rollback/reopen, exact text with collations, duplicate and
  checked-empty outcomes, live schemas and Arrow metadata, source restoration,
  independent publication cleanup, sampled counts and all-page export ordering.
- Real pinned UDPipe: five direct Quotation tests and the HTTP ownership test
  pass with explicitly configured isolated model storage. The HTTP fixture now
  checks missing-source errors and compatible restoration.
- Frontend: 812 tests and 17 script tests passed. Subsequent focused download,
  column-order, Concordance and Data View tests pass. Build, lint, Knip, generated
  API, documentation drift, formatting and Markdown links pass.
- Chromium: both Concordance cases and the Quotation journey pass, including
  expected missing-source diagnostics, restoration, native extraction, live
  publication, persisted column order and all-page JSON download. The Frequency
  handoff needed an isolated rerun after one stale-element driver failure; that
  rerun passes without a product workaround. Light/dark narrow screenshots were
  inspected. These browser tests use the debug API host and instrumentation.
- Backend strict all-target/all-feature Clippy and Rust formatting pass. All ten
  Topic projection tests pass in the separate all-feature library configuration.
  The explicitly provisioned, signed DuckDB 1.5.6 ICU asset loads and passes the
  daylight-saving daily-bin test. The optional fixture helper now matches the
  bundled engine version; production cache contents were not changed.

- Library strict all-target/all-feature Clippy passes. No-default,
  tokenisation-only, data-only and Topic-only feature checks pass; narrow builds
  retain their existing unused cache-fingerprint warnings.

Focused batch acceptance is complete. Final WebKit/native release acceptance, the remaining
batches and carried-forward native/platform gates remain open.

Historical download follow-up: version-1 Concordance and Quotation downloads
resolve the original text binding from their saved manifest after source renames.
The bundled-engine regression checks original text plus offsets across every
page and confirms that the historical result stays at version 1.

## v0.7.12–v0.7.13 batch 3: Topics fitting and presentation

Automatic segmentation packs whole neighbouring paragraphs without cutting one to
fill spare capacity. Fresh runs use the fixed internal HDBSCAN minimum of 10 and
one parallel fit, with an optional hard segment cap. Requested Topic count is a
target; retained hierarchy cuts respect the cap and report the achieved count.
Count adjustments reuse the hierarchy, while maximum changes refit the retained
reduced vectors once. Historical analyses keep their meaning and require Rerun
when the required new adjustment inputs are unavailable.

True dominant -1 outliers have a separate grey count/share footer and document
inspection without map coordinates. Processed empty outcomes remain eligible but
are not outliers. Version-2 document inspection now explicitly orders by current
source position, including downloads; historical coverage ordering is preserved.
Search and lasso share one eligibility projection, lists retain faded excluded
selections, newest selections appear first, and representative-word highlights
also reach the read-only hover clouds. Colour by remains visible with a reason
when unavailable and follows native source-column renames for live results.

Observed checks:

- Backend: 240 library tests, 58 integration tests and two CLI tests pass, followed
  by the additional true-outlier inspection regression. Strict all-target and
  all-feature Clippy and formatting pass. Fifteen optional library tests and one
  subprocess helper remain ignored in the default suite.
- Native library: 117 tests pass, with four optional model/benchmark tests ignored
  by default. Strict Clippy and no-default, tokenisation-only, data-only and
  Topic-only checks pass; existing narrow-feature cache warnings remain.
- Explicitly provisioned real-model acceptance executes both supported embedding
  models twice with fresh downstream stage callbacks. MiniLM produces four Topics
  over 104 segments; multilingual MiniLM produces four over 128. Each Run records
  exactly one clustering stage. Exact embedding caches remain reusable.
- Actual ONNX profiling observes CoreML and CPU execution providers at the explicit
  thread cap of two. A CPU-only fallback executes the same input with cosine
  agreement above 0.99. This verifies Apple Silicon; Windows DirectML remains an
  outstanding platform gate.
- Frontend: all 813 tests and 17 script tests pass. Production build, lint, tooling
  types, Knip, formatting, API generation checks, bundled-doc drift and Markdown
  links pass.
- Chromium: both real-model Topic journeys pass with temporary sampled populations,
  full Run, live metadata edits and column rename, atomic retained adjustments,
  stale responses, missing-intermediate diagnostics, publication and figure exports.
  Native hover acceptance reproduced a neighbouring tooltip grace-path obstruction;
  only these pointer-free Topic cards disable hoverable-content grace. Searched
  bubbles now open their cards and retain nonempty SVG contents across 30 frames.
  Fresh light/dark and narrow screenshots under `.tmp/wdio/browser/` were inspected.

The legacy nested-glyph word-cloud click report remains reproduction required;
no unrelated glyph or Safari remount workaround was introduced. Browser acceptance
uses the instrumented debug API host. Final WebKit, uninstrumented release,
Windows and physical-control gates remain open. No push or publication occurred.
