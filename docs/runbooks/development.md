# Development Runbook

## Bootstrap

From the repository root:

```bash
git submodule update --init --recursive
uv sync
pnpm install
```

The backend is an ordinary tracked directory. The recursive submodule update
initializes the supporting package, documentation, and sample-data repositories.
Do not set `PYTHONPATH` for normal development. Root uv sources resolve the
local backend and supporting packages; package-specific checks run from the
package root.

### Existing clones from before the backend integration

Before pulling the commit that replaces the backend submodule, first preserve
or publish any backend-local work, then run:

```bash
git -C backend status --short --branch
git submodule deinit -- backend
git pull --ff-only
git submodule sync --recursive
git submodule update --init --recursive
```

Do not force deinitialization. Stop if the first command reports local changes
or commits that have not been backed up or pushed.

## Web Application

```bash
pnpm dev
```

The root command supervises the FastAPI reload process and Vite together,
prefixes their output, and stops the remaining process when either exits. It
uses the local frontend origins as the backend CORS default without setting a
Data Root. Environment variables supplied by the caller, including `DATA_ROOT`
and `CORS_ALLOWED_ORIGINS`, remain available to the backend.

Run either side independently when needed:

```bash
pnpm dev:backend
pnpm dev:frontend
```

For a second checkout, use the frontend variables already consumed by Vite to
give both processes a distinct port pair:

```bash
FRONTEND_PORT=3100 VITE_BACKEND_PORT=8101 pnpm dev
```

The launcher derives its default CORS origins from `FRONTEND_PORT` and starts
the backend on `VITE_BACKEND_PORT` so the two processes stay aligned.

Vite serves the frontend on port `3000` and connects directly to the backend on
port `8001`.
Use either `http://localhost:3000` or `http://127.0.0.1:3000`; the frontend
preserves that hostname when it selects `localhost:8001` or `127.0.0.1:8001`.
Both exact frontend origins must therefore remain in the backend allowlist for
unsafe CSRF-protected requests. Production does not use this split arrangement:
the release workflow builds the SPA into the backend package and the backend
serves both surfaces from one origin.

## Package Checks

Run backend checks from `backend/`:

```bash
uv run ruff check .
uv run pytest -q
uv run ty check
```

Run the complete frontend check from the repository root:

```bash
pnpm -C frontend check
```

Use `pnpm -C frontend docs:check` for the bundled user-document registry. After
an OpenAPI change, export the backend schema and regenerate the frontend client
through `pnpm -C frontend openapi:generate`; never edit generated files.

## Browser Workflow Tests

Install the pinned Chromium build once after installing frontend dependencies:

```bash
pnpm -C frontend exec playwright install chromium
```

Run the browser workflow gate from the repository root:

```bash
pnpm -C frontend test:e2e
```

For local interactive debugging, use:

```bash
pnpm -C frontend test:e2e:ui
```

The cross-platform runner creates a unique temporary Data Root, starts the real
FastAPI backend and Vite frontend, and removes the Data Root after Playwright
exits. Playwright waits for both servers before beginning and never reuses an
existing process. The fixed test ports therefore fail safely when occupied
instead of connecting to another Wordflow instance or a developer Data Root.
Chromium workflow tests cover application behavior; detailed component and edge
case coverage remains in Vitest, and native Tauri behavior is outside this gate.

## Compiled Packages

```bash
cd polars-text
make build
make test
uvx ty check
```

```bash
cd polars-source-utils
uv sync
uv run maturin develop --release
uv run pytest -q
cargo clippy --all-targets --locked -- -D warnings
cargo metadata --format-version 1 --no-deps
```

Some tokenizer and embedding features download model assets on first use. The
local Quotation pipeline likewise downloads its pinned UDPipe model data to
the OS-native `au.edu.ldaca.wordflow` application cache; it is not a Python
package dependency.

## Change Discipline

Run the nearest targeted check while editing and the complete affected-package
checks before handoff. Update architecture, domain, reference, runbook, ADR, or
specification documents in the same change whenever their truth changes.
Root CI runs the complete frontend suite and a Linux, macOS, and Windows backend
matrix from the same commit. Its backend sync is source-aware, so
`backend/pyproject.toml` remains the authority for local versus registry
dependencies.

## LDaCA data SDK development

The independent `ldaca-data-rs` package lives alongside `polars-text` and
`polars-source-utils`. Initialize the supporting checkouts before `uv sync`
in the backend; its local source mapping builds the SDK automatically.
Use standard GIL-enabled Python 3.14 for Wordflow. The SDK also supports
Python 3.11–3.13 for independent consumers. See its
[package architecture](../architecture/packages/ldaca-data-rs.md) and
[SDK README](../../ldaca-data-rs/README.md). The initial SDK commit/package
remains a local dependency until publication is explicitly authorized.
