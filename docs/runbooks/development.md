# Local development

The repository-root Cargo workspace contains `backend`, `ldaca-rs`, and
`frontend/src-tauri`. They share the root `Cargo.lock` and `target/`; select a
package with `--manifest-path` or `-p` for focused checks. `polars-text` is
maintained in an independent Rust/Python repository with its own lockfile and build output.

Run application commands from the repository root:

```sh
vp install --frozen-lockfile
vp run dev
vp run dev:backend
vp run dev:frontend
vp run dev:desktop
```

`vp run dev` starts Axum and the Rust browser preview. `dev:backend` and
`dev:frontend` start each independently. Desktop uses Tauri's embedded backend.
The application no longer has a root Python environment or `dev:python` command.
The retired FastAPI workflow is preserved in [the archive](../../archive/README.md).

## Toolchain setup

Vite+ 1.0.0 owns frontend builds, tests, lint and format. Global `vp` manages
Node 24.15.0 from `.node-version` and pnpm 11.24.0 from root `packageManager`.
The workspace catalog pins `vite-plus` in both packages and aligns the Vite core
alias and Vitest override. Do not upgrade those entries independently.

On macOS or Linux, install the pinned global CLI, enable its environment shims,
and source the environment script after other PATH configuration:

```sh
curl -fsSL https://viteplus.dev/install.sh -o /tmp/vite-plus-install.sh
VP_VERSION=1.0.0 VP_NODE_MANAGER=yes bash /tmp/vite-plus-install.sh
source "$HOME/.config/vite-plus/env"
vp env on
vp env install
vp env doctor
vp install --frozen-lockfile
```

On Windows, follow the [official environment installation guide](https://viteplus.dev/guide/env)
and select Vite+ 1.0.0. Disable competing automatic Node selection, such as
`fnm env --use-on-cd`, in the shell configuration. For chezmoi-managed shells,
edit the source and apply that file. Restart the shell and IDE after setup,
then verify `node --version`, `pnpm --version`, `vp --version` and `vp env doctor`
in the repository and after directory changes.

Use `vp run dev`, `vp run build` and `vp -C frontend run check` for Wordflow.
The `run` form executes our package scripts and their theme checks, TypeScript
checks, Node tests, build verification, Knip and documentation checks. Built-in
`vp dev`, `vp build`, `vp test` and `vp check` run tool primitives directly and
bypass those additional script steps. Task-result caching and commit hooks are
not enabled for this migration.

## Frontend lint and format policy

The root `vite.config.ts` owns tooling settings independently of the frontend's
asset-syncing development/build callback. Oxlint enables its default correctness
rules with native TypeScript and React support, type-aware linting and TypeScript
Go type checking. The lint script retains zero-warning enforcement and the
previous source, browser/native E2E and configuration-file scope. Explicit `tsc`
checks remain part of the frontend script chain. The solution `tsconfig.json`
exposes application, tooling and test projects to Vite+. `tsconfig.app.json`
retains application compilation settings. The test project retains the previous
transpile-only behavior with `noCheck`; semantic lint still applies to tests,
while compiler diagnostics cover the application and tooling projects.

This intentionally replaces ESLint's strict and stylistic type-checked presets,
React Hooks recommended-latest and React Refresh rules, TanStack Query rules and
Testing Library rules. Vite+ defaults do not provide equivalent coverage for all
of those policies. Babel's React Compiler still compiles the application.

Oxfmt retains two-space indentation, 100-column width, single JavaScript quotes,
semicolons, trailing commas and LF endings. Formatting scripts cover
`frontend/src/`; generated API declarations and theme CSS are excluded. The API
generator formats its own output with the same Oxfmt style. Import, package-key
and Tailwind-class sorting are disabled. Formatter changes can still differ from
Biome in line wrapping and JSX printing.

Vitest imports use `vite-plus/test`; jsdom, MSW, explicit DOM cleanup and E2E
exclusions remain in place. The initial migration retains Vitest 4 compatibility
settings for mock history and independent project servers. WebdriverIO/Mocha
continues to own browser and native E2E; Quick Look uses the programmatic `vite`
API through the aligned core alias.

## Native checks

```sh
cargo test --manifest-path backend/Cargo.toml --locked
cargo clippy --manifest-path backend/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path ldaca-rs/Cargo.toml --locked --features data
vp -C frontend run build
vp -C frontend run test
vp -C frontend run lint
vp -C frontend run test:e2e
vp run docs:links
vp run check-versions
```

`test:e2e` runs the Chromium-with-Rust preview suite; it is not native Tauri UI
verification. See [desktop runtime](desktop-runtime.md) for native launch and
packaging verification.

For the optional Python adapter, follow [polars-text development](polars-text-development.md).
Its local Python tooling remains supported independently of the retired backend.
