# LDaCA Wordflow

Wordflow is a text-analysis application built with Rust, DuckDB, React and Tauri.
Each desktop project window owns an embedded Axum backend and a `.wfpj` DuckDB
file.

## Packages

- `backend/`: native project lifecycle, SQL, graph metadata and imports.
- `ldaca-rs/`: reusable text algorithms, model inference and ONI/RO-Crate data access.
- `frontend/`: React interface and Tauri desktop host.
- [polars-text](https://github.com/Australian-Text-Analytics-Platform/polars-text): independent Polars/Python adapter over `ldaca-rs`.
- `ldaca-analytics-sample-data/`: remote sample data.
- `ldaca-wordflow-docs/`: published user-documentation mirror.
- [archive/](archive/README.md): retired Python backend and associated infrastructure,
  preserved for reference rather than execution.

## Development

```sh
pnpm install
pnpm dev                 # Rust backend and browser preview
pnpm dev:desktop         # Tauri desktop application
pnpm build:desktop:mac   # Regular macOS application bundle
```

Rust/Cargo is required. The active application does not need a Python environment
or a Data Root. The browser preview uses the native project interface; the old
FastAPI server workflow is archived. The optional `polars-text` adapter is
developed in its own repository and resolves `ldaca-rs` from a locked Git dependency.

See the [engineering index](docs/index.md),
[development instructions](docs/runbooks/development.md), and
[desktop runtime instructions](docs/runbooks/desktop-runtime.md).
