# Tasks

- [x] Add project schema and blocking database ownership.
- [x] Add SQL, graph, edit, undo, replacement, and materialization routes.
- [x] Add real-database integration scenarios.
- [x] Complete strict Rust checks and Tauri regression checks.
- [x] Complete lifecycle/crash recovery verification.
- [x] Update native CI and validate documentation links.
- [x] Record results and archive the completed milestone.

## Verification — 2026-09-09, local macOS

- Locked backend tests: 5 library, 2 CLI, and 11 project integration tests passed.
  The ignored subprocess helper is invoked explicitly by the passing file-lock
  and crash/WAL recovery test.
- Locked Tauri tests: all 19 passed against the linked backend.
- Formatting and strict Clippy (`--all-targets --all-features --locked -- -D warnings`)
  passed for both crates. Tauri reports an existing upstream future-compatibility
  notice for `block` 0.1.6, with no failing lint.
- Real database tests cover relocation after deleting CSV/Parquet inputs,
  reopening metadata/results/BLOBs, query scope rewriting, nested undo,
  materialization, rollback, Arrow values, cancellation, and recovery WALs.
- Documentation links, version consistency (0.8.0), and `git diff --check` passed.
- Native CI runs this database suite on Linux, macOS, and Windows. Windows was
  not executed locally and no remote CI run is claimed.

The desktop remains a lifecycle screen. Python server storage and user projects
were not converted or edited. No frontend data UI or analysis engine was added.
