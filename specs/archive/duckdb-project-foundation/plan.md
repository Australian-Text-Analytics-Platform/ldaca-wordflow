# Implementation

1. Add bundled DuckDB, Arrow IPC, and the version-1 metadata schema to the
   existing independent Rust crate.
2. Add serialized project ownership with an independent interrupt handle and
   blocking workers whose ownership outlives cancelled HTTP requests.
3. Expose transactional SQL batches and catalogue-based query manipulation.
4. Verify real project files, graph behavior, SQL scopes, and lifecycle races.
5. Update durable contracts, native CI, and validation records.

The application keeps no duplicate view SQL or execution plans. DuckDB parses
SELECT bodies as JSON; a small lexer handles only canonical CREATE VIEW headers
and statement boundaries. Bindings remain scope-aware during replacements.
