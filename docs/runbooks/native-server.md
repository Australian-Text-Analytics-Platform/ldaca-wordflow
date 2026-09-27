# Build and operate the native server

## Local build

```bash
pnpm install --frozen-lockfile
pnpm -C frontend build
cargo build -p wordflow-server --release --locked --target aarch64-apple-darwin
node scripts/package-server.mjs aarch64-apple-darwin
node scripts/verify-server-package.mjs aarch64-apple-darwin
```

Other release targets are `x86_64-unknown-linux-gnu` and
`x86_64-pc-windows-msvc`; build on the matching host. Packages under
`target/server-packages/` contain the executable,
licences, dependency audit and checksums. Frontend and executable come from the
same checkout. ICU and language assets download on first use into the host cache;
startup downloads nothing. Cached assets work offline.
No Rust, Node or Wordflow Python installation is needed to run the package.

```bash
./wordflow-server --help
./wordflow-server --version
DATA_DIR="$HOME/wordflow" ./wordflow-server --bind 127.0.0.1:8002
```

Startup creates Untitled. Use browser **Project** and **Data files** controls.
SIGINT/SIGTERM request graceful cancellation and wait for cleanup. A new process
starts Untitled; reopen named projects from its file library. Downloads preserve
project structure, while Export remains the separate portable-export workflow.

Behind a prefix-stripping proxy:

```bash
./wordflow-server --public-base-path /user/research/proxy/8002/ \
  --allowed-origin https://notebooks.example.org
```

Allow the exact browser origin. Do not disable origin validation or assume
forwarded headers are trustworthy. The health/readiness check for the host is
`GET /api/server`; the returned session scopes ordinary project health routes.

## Release gates

The [release runbook](wordflow-release.md) owns the platform matrix, workflow
responsibilities, signing and publication procedure. Release jobs compile and
package; CI owns Rust checks, extracted-package probes and browser/native tests.

macOS applies the desktop ICU library-validation entitlement so a separately
signed DuckDB extension can load. DuckDB's extension signature checks remain
enabled; do not modify or re-sign extension bytes. Release builds use the
configured Developer ID; local packages use ad-hoc signing. Signing/notarization
and target-platform checks are distinct from local compilation.

The package smoke check extracts outside the checkout, starts the executable,
downloads signed ICU on first use, checks embedded assets and saves a
project. Browser workflows use `pnpm -C frontend test:e2e:server` against the direct local server. Set `WORDFLOW_SERVER_BINARY` to an extracted release
executable to exercise that package. On macOS GUI tests run outside the agent
execution sandbox; keep Chrome's own sandbox enabled.

## Binder

The tools repository's `index.ipynb` and `launcher.py` resolve the latest stable
GitHub release once per fresh launch. The selected archive and
`server-SHA256SUMS` must belong to that exact release. A missing server asset is
an error, not an instruction to use an older or unverified version.

The launcher verifies downloads, safely extracts into a versioned cache, checks
for occupied ports and premature exit, and reuses its healthy owned process.
Python is orchestration only; Jupyter Server Proxy remains installed in the
Jupyter server environment. Binder supplies `DATA_DIR=~/wordflow` and explicitly
discovers its public Origin. Uploaded files and saved projects survive server
restarts inside one Binder session. Normal Binder storage disappears with the
session; download projects to keep them.

Actual Binder verification is deferred to the real Binder website at the user’s
request. Do not run local Binder simulations as a substitute. As of this implementation's local check, latest stable `v0.7.7` has only
desktop assets; publish the new server assets before that gate can run. Linux,
Windows and live Binder results must be reported separately from macOS evidence.
