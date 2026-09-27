# Implementation record

1. Establish the format-4 schema, concrete ProjectRuntime ownership, consolidated lifecycle
   routes, retained close completion and structured SQL/error contracts.
2. Simplify transactional metadata changes, scope-aware query rewriting, canonical names,
   graph diagnostics, temporary output streaming and runtime-bound imports.
3. Replace global Tauri supervision with document windows. Move dialogs, save, close,
   sequential Quit and updater preparation into native ownership.
4. Remove frontend document coordination and server transport dependencies from native
   code. Reuse explicit shared presentation models and preserve window-local interaction
   state, Arrow types and native DuckDB edits.
5. Validate the database/runtime, shell, frontend and preview interaction suites; inspect
   the ordinary development application. Keep Windows and release checks in CI.

See [tasks and verification](tasks.md) for results and outstanding acceptance checks.
