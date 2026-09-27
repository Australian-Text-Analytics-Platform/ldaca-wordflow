# Running the Frontend UI

Install dependencies from the repository root with `pnpm install`. Then run:

```sh
pnpm dev
```

This starts the Rust backend with an Untitled project and the browser interface
at `http://127.0.0.1:3000`. Vite forwards project and health requests to the
backend; there is no separate backend selection step.

Use `pnpm dev:desktop` for the native Tauri application. For separate development
terminals, use `pnpm dev:backend` and `pnpm dev:frontend`. Both frontend commands
render the same current project interface.

See [configuration](../reference/configuration.md) for port overrides and
optional documentation settings. Python is not required for these commands.
