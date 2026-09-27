# Local development

The repository-root Cargo workspace contains `backend`, `ldaca-rs`, and
`frontend/src-tauri`. They share the root `Cargo.lock` and `target/`; select a
package with `--manifest-path` or `-p` for focused checks. `polars-text` remains
an independent Rust/Python submodule with its own lockfile and build output.

Run application commands from the repository root:

```sh
pnpm install
pnpm dev
pnpm dev:backend
pnpm dev:frontend
pnpm dev:desktop
```

`pnpm dev` starts Axum and the Rust browser preview. `dev:backend` and
`dev:frontend` start each independently. Desktop uses Tauri's embedded backend.
The application no longer has a root Python environment or `dev:python` command.
The retired FastAPI workflow is preserved in [the archive](../../archive/README.md).

## Native checks

```sh
cargo test --manifest-path backend/Cargo.toml --locked
cargo clippy --manifest-path backend/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path ldaca-rs/Cargo.toml --locked --features data
pnpm -C frontend build
pnpm -C frontend test
pnpm -C frontend lint
pnpm -C frontend test:e2e
pnpm docs:links
pnpm check-versions
```

`test:e2e` runs the Chromium-with-Rust preview suite; it is not native Tauri UI
verification. See [desktop runtime](desktop-runtime.md) for native launch and
packaging verification.

For the optional Python adapter, follow [polars-text development](polars-text-development.md).
Its local Python tooling remains supported independently of the retired backend.
