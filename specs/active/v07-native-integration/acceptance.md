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
