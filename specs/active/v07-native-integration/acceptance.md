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
