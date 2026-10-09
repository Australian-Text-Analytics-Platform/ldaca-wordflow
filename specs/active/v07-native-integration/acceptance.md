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
