# Desktop builds

The regular Tauri application embeds the Rust backend and DuckDB. Python is not
part of the native build. Each project window owns its own backend runtime.

Run `pnpm dev:desktop` from the repository root for native development. The
[desktop runtime runbook](../../../docs/runbooks/desktop-runtime.md) owns build,
packaging, platform prerequisites and updater verification commands.

Updates use the same project interruption, editor protection and Untitled
Save prompts as Quit before restarting the application.
