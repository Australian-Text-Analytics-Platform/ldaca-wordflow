# Desktop Runtime Runbook

## Develop and Build

The desktop links Axum directly into Tauri. Use the root Cargo workspace and
lockfile for backend and desktop checks. Python and uv are not desktop
prerequisites. macOS builds also use Xcode's Swift compiler for the on-device
Annotation provider; build with the macOS 26 SDK or newer to include Foundation
Models support. Older SDKs build an unavailable-provider stub.

```sh
pnpm dev:desktop
pnpm build:desktop:mac
pnpm build:desktop:windows
```

`pnpm dev:desktop` explicitly loads `frontend/src-tauri/tauri.dev.conf.json`.
It runs **LDaCA Wordflow Dev** (`au.edu.ldaca.wordflow.dev`), separately from
**LDaCA Wordflow** (`au.edu.ldaca.wordflow`). Local production bundles and CI
releases keep the production identity. Raw `tauri dev` does not load this
override automatically. Restart an already-running development app once to
pick up the new identity.

For native QA while Dev is running, build the current source with the production
configuration and launch that local bundle. Both identities may run together;
another production instance still shares the bundle's single-instance lock.
Use temporary projects: different application identities do not permit two
processes to write the same DuckDB project. Follow the
[agent testing instructions](../../frontend/AGENTS.md#desktop-and-documentation)
when an existing development process needs to be stopped.

Final visual, performance and packaging acceptance uses a **release build without
WebDriver instrumentation**, retaining the production identity. On macOS:

```sh
pnpm build:qa:mac
pnpm verify:qa:mac
open "target/release/bundle/macos/LDaCA Wordflow.app"
```

The build uses the normal frontend, release Rust profile, on-demand ICU and Quick
Look extension. The verification command checks the signature, identity, packaged
asset checksum, startup and timezone/DST queries without remote sample downloads.
It creates only a temporary Untitled project and closes its own process. The local
bundle is ad-hoc signed; it does not prove notarization or updater installation.
Use `build:desktop:windows` for clean Windows installer acceptance, separately from
automation. Before distribution, test the actual signed/notarized artifacts.

For a faster local macOS debug bundle with the inspector available (not final
performance or release acceptance):

```sh
pnpm -C frontend tauri build --debug --config src-tauri/tauri.local-build.conf.json --bundles app
```

For a packaged Dev app when testing requires one, explicitly pass the same
override, for example on macOS:

```sh
pnpm -C frontend tauri build --debug --config src-tauri/tauri.dev.conf.json --bundles app
```

Dev disables updater endpoints and updater artifacts, file associations, and
the macOS Quick Look build/embedding hook. Its updates menu is disabled and
Settings explains that updates are unavailable. Keep Finder/Quick Look and
release-upgrade testing on production bundles. Tauri Store paths follow the
application identifier; Dev does not migrate production preferences. Frontend
preferences also differ between Vite's development origin and packaged content.

Desktop Vite uses the fixed strict origin `http://127.0.0.1:3001`. An occupied
port is an error; do not automatically kill its owner or choose a random port.
Identify an existing Wordflow development session before intentionally stopping
it under the agent testing instructions. The native backend
binds a separate ephemeral loopback port, discovered through Tauri IPC.

The local Apple Silicon build creates an application and DMG. Local commands
use `tauri.local-build.conf.json` to disable updater artifact signing. CI keeps
updater artifacts enabled and uses its existing signing secrets.
Disabling artifact creation alone does not disable the runtime updater; local
production bundles retain it to exercise the release configuration.
Routine packaging copies the committed Icon Composer `Assets.car`; regenerate
it only after changing the icon source with
`pnpm -C frontend compile:desktop:mac-icon`.

To run only the Rust HTTP backend:

```sh
cargo run --manifest-path backend/Cargo.toml --bin wordflow-api-dev
```

`WORDFLOW_BIND_ADDR` overrides the default `127.0.0.1:8002`. See the
[native backend reference](../reference/native-backend.md) for HTTP and IPC.
`pnpm dev` initializes a temporary Untitled project and starts Rust on port 8002 and Vite's project interface on port 3000.
The project interface is also the default for `pnpm -C frontend dev` and builds;
no `--mode rust` flag or saved backend selection is needed.
Vite binds loopback and proxies project and health requests. `pnpm dev:desktop` runs the actual
Tauri application. The Python server tooling is archived.
`FRONTEND_PORT` and `VITE_BACKEND_PORT` override the browser development ports.

## Automated native tests

WebdriverIO drives the actual Tauri webview on macOS and Windows using its
[embedded driver](https://webdriver.io/docs/desktop-testing/tauri/). No external
`tauri-driver`, browser-driver download or paid service is needed. The fast suite
uses an unbundled debug executable:

```sh
pnpm -C frontend build:e2e:native
pnpm -C frontend test:e2e:native
```

The build compiles frontend assets and a debug executable with the opt-in Cargo
`e2e` feature and the test-only bridge injected by Vite's `e2e` mode.
`tauri.e2e.conf.json` grants bridge access to project windows, enables the public
Tauri JavaScript API for real IPC assertions and disables automatic updates. The production identifier,
single-instance handling and project runtime remain intact. Normal Dev and
distributable release builds omit the WebDriver dependency and server. Never distribute an
instrumented binary.

The service owns launch and cleanup, runs one process at a time and starts with
an empty temporary Untitled project. It can coexist with Wordflow Dev. Close a
running production-identity Wordflow before testing; do not disable the
single-instance plugin. Tests restore any theme preference they change. Reuse
the built binary for test-only changes; rebuild after Rust or frontend changes.
Use `pnpm -C frontend test:e2e:native --spec ./e2e-native/project.spec.ts` to
select a spec. Logs, failure screenshots and theme captures live in
`frontend/.tmp/wdio/native-debug/` and are uploaded by macOS/Windows CI.

Annotation uses repository-owned imported files and a deterministic local HTTP
provider in its default browser/native scenarios. Provider configuration lives
in a temporary test directory. On an eligible Mac with Apple Intelligence enabled
and the system model downloaded, include real on-device inference with:

```sh
WORDFLOW_TEST_APPLE_AI=1 pnpm -C frontend test:e2e:native --spec ./e2e-native/annotation.spec.ts
```

This opt-in scenario exercises Preview, correction editing and Run without a
cloud account or credential. It is separate from deterministic adapter coverage
and does not establish macOS 26, Windows or Linux acceptance. The integration uses
the macOS 26+ framework; the `fm` CLI is not a runtime dependency. See the
[provider architecture](../architecture/backend/native-analyses.md#host-provider-services).

Run the optimized, still-instrumented lane for release-profile regressions:

```sh
pnpm build:e2e:native:release
pnpm test:e2e:native:release --spec ./e2e-native/project.spec.ts --spec ./e2e-native/research-plots.spec.ts --spec ./e2e-native/research-text.spec.ts
```

Both commands use the same scenario runner and production identity. The release
lane uses isolated Cargo outputs under `target/e2e-release/`; it launches
the bundled executable on macOS and stages resources beside the unbundled Windows
executable. It does not test Windows installation. Test frontend assets are isolated
in `.tmp/e2e-build/`, leaving ordinary `build/` assets untouched. ICU downloads on first timezone use and is retained in the host cache; neither
build command bundles it. Normal frontend builds reject test
bridge markers.

Evidence is separated into `.tmp/wdio/native-debug/` and `native-release/`. Each
contains `build.json` identifying the profile, production identity, instrumentation,
binary path, hash and build time. The runner rejects a binary that changed after
that record was written. CI runs the full debug suite, representative release
scenarios on macOS/Windows, and a clean macOS release-bundle smoke check. These
are distinct gates: an optimized instrumented test is not a shipping-app or
performance acceptance result. Report the profile, instrumentation, platform and
manual/automated method with every verification claim.

Each spec worker explicitly selects `project-0`, reloads the webview and waits
for Data Loader before its tests start. Explicit window selection avoids the
service's automatic title matching and its window-state IPC checks during reload,
which can otherwise stall for the 30-second script timeout. Reloading resets the
screen and frontend drafts, not the database: specs share the same project runtime
and use distinct test object names. There are no intentional pauses between actions.
The embedded driver's refresh returns before navigation finishes. The test setup
marks the old document and waits for its replacement through the native page-source
read before running more commands. This avoids interacting with the old screen or
losing an execute-script result while its document is being discarded.
The runner and service own log-directory creation, app launch and cleanup. Run only
one native suite at a time, since it owns the production identity and embedded driver.
Keep the Mac unlocked and the test window visible for interactive checks. WebKit
can suspend animations in an inactive window, leaving popovers invisible and
causing `waitForStable` to reject even though the application has loaded.

The browser WebdriverIO suite lives under `frontend/e2e-browser/`, run by
`test:e2e` or `test:e2e:browser`. Its launcher owns the Rust/Vite preview hosts,
and WebdriverIO manages Chrome and ChromeDriver. It uses an isolated browser
session and resets the temporary project before each scenario. This is a browser,
not the native webview. Native WebDriver checks also do not prove file chooser,
OS menu, Finder, signing, notarization or updater-install behavior; retain the
manual and packaging checks below for those boundaries.

Embedded-driver 1.4 emits mouse events for pointer actions rather than DOM
Pointer Events. The native smoke test activates draggable tabs through their
keyboard controls. Keep pointer-capture dragging and resize coverage in
the WebdriverIO browser suite and native computer-use checks; do not add synthetic application
events to make an embedded-driver test appear to exercise OS input.

## Validate

For recent-project integration, use a bundled macOS app and temporary `.wfpj`
files. Save an Untitled project, use Save As, close and reopen it through the
actual Dock recent-document list, then quit and repeat from the Dock. Also check
opening an already-open project focuses one window, paths containing spaces and
Unicode, identical filenames in separate directories, and missing/locked files.
Failed opens, cancelled saves, Untitled projects and data imports must not add
history entries. Verify Dev and production histories separately. Native WebDriver
does not exercise the Dock; report this OS check separately and do not clear the
user's existing recent-document history during testing.

```sh
cargo fmt --manifest-path backend/Cargo.toml --check
cargo test --manifest-path backend/Cargo.toml --locked
cargo clippy --manifest-path backend/Cargo.toml --all-targets --all-features --locked -- -D warnings
cargo fmt --manifest-path frontend/src-tauri/Cargo.toml --check
cargo test --manifest-path frontend/src-tauri/Cargo.toml --locked
cargo clippy --manifest-path frontend/src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings
pnpm -C frontend check
pnpm -C frontend test:e2e
pnpm -C frontend build:e2e:native
pnpm -C frontend test:e2e:native
pnpm docs:links
```

On macOS, launch the built application and confirm Untitled opens
with the original three panes and no Data Root prompt or Python child. Use Window → Reload or
Cmd/Ctrl+R and confirm
it rediscovers the backend. Close during startup, close normally, and use Quit;
each closes only the affected project and releases its listener after work settles.
Closing the last macOS window leaves the app running; Quit exits after all
project prompts complete. Repeated close/Quit
requests must not bypass the pending drain. Inspect the bundle for absence of
`backend-runtime` and `libpython`.

Verify titlebar dragging, traffic lights, resize, zoom, and the light/dark
VS Code window backgrounds. The panes sit directly on the window background. The updater window keeps
its independent UI and must not initiate backend shutdown when closed.

Import a CSV through file selection and by dropping it onto the graph. Both
must show Add to Project. Confirm recent files, column selection, Table/View
labels and data preview. Save As, delete the original CSV, and reopen `.wfpj`
through the File menu and the OS in independent windows. Verify untouched and populated Untitled windows both prompt on Close, Cancel
preserves the window, and named windows close without a save prompt.
Attempt Save As onto another open project, first in a second Wordflow window
and then in an external DuckDB process. The source stays usable and the error
asks to close the destination. Repeat after closing the owner to confirm native
Replace approval is honored. Open and Save As must not claim a destination
concurrently.

Check **More → Edit Table**, then File Save, Close and Reload: each returns focus
to the editor before any document prompt. Save/Cancel releases protection. Keep
read-only page and preprocessing previews available, including while editor
startup waits for admitted writes. Graph cards show columns only. Closing/reopening
a preview retains column pinning, widths, expansion and pagination.

Project catalogue, User File, authentication, and Data Root requests must be absent.
Browser E2E checks the Rust-backed project interface and does not substitute
for native application QA. The retired FastAPI tests remain in `archive/`.

The format-6 backend and Quick Look reject older project files without migration.
Backend task checks cover production imports, opted-in SQL, Materialize and Clone,
as well as overlapping transactions, isolated cancellation, retained ownership,
SSE, Save As and editor startup races. Frontend tests cover progress, completion
refresh and reconnect behavior. In an owned desktop session, run a local import,
sample import, Default SQL, Materialize and Clone in both themes. Close an import
dialog and cancel from Tasks; confirm other work remains usable. Confirm previews,
page navigation and SQL-cell autosaves add no summaries. There is no demonstration
task endpoint. Native exports also own one task through file installation. Verify replacement
and cancellation preserve the destination correctly. Analysis remains deferred.

## Finder Quick Look

macOS packaging builds the Quick Look extension automatically before bundling:

```sh
pnpm build:desktop:mac
```

For focused extension development, run `pnpm -C frontend build:quicklook`, then
`pnpm -C frontend test:quicklook`. These commands use Xcode and put the extension,
verified DuckDB download, renderer, and native test executable beneath
`frontend/src-tauri/target/quicklook`. The pinned download in
`frontend/src-tauri/quicklook/duckdb.json` must match the Rust backend's DuckDB
engine. The native tests create temporary databases without Python or a server.

Open the regular bundled Wordflow app once to register it with macOS. Select a
closed `.wfpj` in Finder and press Space. Verify file size/date, description,
Data Block and saved SQL-cell counts, full names, Table/View labels, colours and
expandable column names/types. Check keyboard disclosure, narrow-width wrapping,
vertical scrolling and system light/dark appearance.
There must be no row counts or network requests. With that project open in
Wordflow, request a fresh preview and verify the in-use message. Conversely,
keep a successful preview visible and open the file in Wordflow: Quick Look
must already have released its database lock. Test empty, moved, unsupported,
and damaged files as well as a project whose source file no longer exists.

Use the regular bundle for Finder verification; `pnpm dev:desktop` does not
install an extension. If macOS selects an older Wordflow build, check Finder's
Open With association and `pluginkit -m -v -i au.edu.ldaca.wordflow.preview`
before diagnosing the reader. Do not change users' default associations as
part of automated tests. Quick Look remains macOS-only; Windows and ordinary
desktop development do not invoke Xcode or download the preview library.

## Desktop CI and Releases

The reusable desktop workflow builds Windows and macOS with stable Rust,
checks native lifecycle and frontend contracts, and verifies absence of a
bundled Python runtime. Root CI also tests native project persistence, SQL
rewriting, file locking, WAL recovery, and cancellation on Linux, macOS,
and Windows. The former Python server CI jobs are archived.

Release CI retains Developer ID signing, notarization and stapling, signed MSI,
DMG and updater artifacts, and existing tag/version validation. The old Python
runtime preparation, `no_sources` selection, runtime-manifest tests, and
embedded-interpreter signing have been removed.

Local validation does not publish a release. Signed release acceptance still
requires Gatekeeper checks and an update from an older installed signed build.
Windows native acceptance must be reported independently from local macOS QA.

## Updater Key Rotation

Generate an encrypted updater key outside the repository and preserve its
private half in a password manager or protected operator backup:

```bash
cd frontend
pnpm tauri signer generate --ci --password '<strong password>' \
  --write-keys "$HOME/.tauri/ldaca-wordflow.key"
```

Store the complete private-key text and password as the two GitHub Actions
secrets above. Commit only the generated `.pub` text as `plugins.updater.pubkey`.
An application can verify only keys embedded when it was built, so rotation
requires a bridge release signed by the old key before later releases switch
exclusively to the new key.

## Verify on-demand ICU

Normal desktop/server builds do not provision ICU. First timezone use downloads
and signature-validates the version/platform-matched extension; subsequent uses
reuse the host cache. Test this explicitly with:

```sh
cargo test -p wordflow-backend --locked first_use_download_and_offline_reuse -- --ignored
```

`verify-signed-native.sh --online` exercises first use in a signed application;
its `--offline` mode requires an already populated cache. `prepare-icu.mjs` remains
an explicit test/offline-installation helper, never an ordinary build hook.
Verify Windows/Linux separately on their target hosts.
