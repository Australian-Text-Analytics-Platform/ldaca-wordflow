# Frontend operating guide

These rules extend the root `AGENTS.md` for the React, Vite, and Tauri package.
Read [the frontend architecture overview](../docs/architecture/frontend/overview.md)
before changing an unfamiliar state or desktop boundary.

## Ownership and state

- Rust DTOs and annotated handlers own native HTTP contracts. Run root
  `vp run api:generate` after changing them; `vp run api:check` detects drift.
  Consume `src/api/generated/native.ts` through the existing transport/adapters;
  never edit generated declarations or duplicate wire fields. Retired FastAPI
  contracts under `archive/` remain excluded from the active build.
- TanStack Query owns server state. Zustand stores own client and interaction
  state. Do not mirror the same authority across both systems.
- Feature behavior belongs under `src/features/`; shared visual primitives
  belong under the established component boundaries.
- Runtime backend URLs come from the window's backend status. Do not hardcode
  `localhost` or assume a fixed packaged port.

## React rules

- The project uses React Compiler. Do not add `useMemo`, `useCallback`, or
  `React.memo` for routine optimization.
- Feature content rendered inside resizable or nested panes must respond to its
  available container width with intrinsic wrapping or named container queries.
  Reserve viewport breakpoints for surfaces whose width is owned by the viewport,
  such as mobile navigation and dialogs.
- React Flow caches node `data`. A callback stored there must not close over
  volatile state that is absent from `nodeSignatureFor`; read that value from
  its store at call time or deliberately include it in the resynchronization
  contract.
- Test hover-revealed graph controls with one continuous stepped pointer move;
  wait-separated moves can create false disappearance and interception results.

## Desktop and documentation

- Final visual, performance and packaging QA uses an uninstrumented release
  bundle. Production identity alone does not imply a release build. Report build
  profile and instrumentation separately; see the desktop runbook for commands.
- Native automation uses the isolated `.test` identity and fresh test-owned storage.
  Use `vp run dev:desktop` for the separate `.dev` identity. Routine tests may
  coexist with the installed production app; do not stop it or launch a second
  production instance for these checks. Raw `tauri dev` does not load the Dev
  override. Use temporary test projects and clean up sessions you start.
- Production packaging acceptance must run in a dedicated OS account or VM when
  the user's production storage must remain untouched. Separate application
  identities do not protect a project file explicitly opened by both apps.
- Before changing packaging, read
  [the desktop architecture](../docs/architecture/frontend/desktop.md) and
  [desktop runtime runbook](../docs/runbooks/desktop-runtime.md), then inspect
  `backend/`, `src-tauri/src/supervisor.rs`, and the desktop build workflow.
- Keep `public/tutorials/`, `public/information/`, `public/references/`, and
  `src/tutorials/bundledRegistry.ts` complete and aligned with observable UI
  behavior. They are the documentation source of truth. Run
  `vp -C frontend run docs:sync-publish` to copy a validated publication mirror
  into `ldaca-wordflow-docs`; never edit published content first. Engineering
  architecture remains in the repository-level `docs/` taxonomy.

## Commands

Run from the repository root:

```sh
vp -C frontend run build
vp -C frontend run test
vp -C frontend run test:e2e
vp -C frontend run lint
vp -C frontend run knip
vp -C frontend run docs:check
```

`test:e2e` (or `test:e2e:browser`) runs WebdriverIO/Chrome against the Rust
preview. For actual Tauri webview/IPC tests, run `build:e2e:native` followed by
`test:e2e:native`. The latter uses WebdriverIO's embedded driver and owns its
Test process; Dev and production may stay open. macOS launches the executable
inside the Test bundle so native OS services also see its Test identity. Each E2E launcher
clears Test caches and preferences before setup and removes them after teardown.
Use `build:e2e:native:release` and `test:e2e:native:release` for the optimized
instrumented lane. Use `build:qa:mac` and `verify:qa:mac` for clean local release
acceptance. Do not publish or install an instrumented test binary. Native menus, file
choosers, Finder integration and signed packaging still need their own checks.
FastAPI browser tooling is preserved under `archive/`.

Frontend changes are complete only after tests and lint pass. Run the build for
changes that affect compilation, bundling, generated code, or desktop staging.
