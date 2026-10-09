# Application storage contract

`wordflow-storage` owns directory values and the versioned preferences schema.
Desktop resolves those values with Tauri's `PathResolver`; headless launchers use
`dirs` with the same platform conventions. Analysis libraries receive explicit
paths and do not select an application identity or modify the process environment.

| Category | Browser path beneath `DATA_DIR/<id>` | Ownership |
| --- | --- | --- |
| Config | `config/` | `preferences.json`, nonsecret `ai-providers.json` |
| Data | `state/` | Durable application state |
| Local data | `local/` | Host-local persistent state, worker socket and lock |
| Cache | `cache/` | HF hub trees, Lindera, UDPipe, ICU, language assets, embeddings |
| Logs | `logs/` | Worker log |
| Temporary | `tmp/` | Untitled projects, Arrow responses, staging and database spills |
| Upload library | `data/` | Uploaded originals, independent of imported Data Blocks |
| Project library | `projects/` | Saved `.wfpj` files |

Single-user mode uses `admin`. Multi-user mode uses an immutable UUID associated
with a verified OIDC issuer and subject. Email and display names never select
paths. Gateway authentication state is outside user roots, at
`DATA_DIR/.system/auth.sqlite3`.

`--data-dir` overrides `DATA_DIR`. Otherwise the standalone server uses the native
application data directory for `<identity>.server`. Desktop identities are
`au.edu.ldaca.wordflow`, `.dev` and `.test`. Test launchers resolve paths through
`cargo run -p wordflow-storage --bin wordflow-storage -- --identity <Dev-or-Test-ID>`;
the command emits JSON and does not create directories. Production is rejected
by this development-tool command.

App-owned temporary files and DuckDB spills use the supplied temporary directory.
Atomic publication stages beside the destination, including explicitly selected
desktop export and Save As destinations. Packaged resources are read-only.
Browser downloads remain owned by the browser. Explicitly selected desktop
project files may be shared between identities; identity separation does not copy
those files. OS-managed WebView profiles, credential stores and native recent
items retain their own adapters and isolation procedures.

## Preferences

`config/preferences.json` contains this complete JSON object:

```json
{
  "schemaVersion": 1,
  "theme": "light-2026",
  "layout": {
    "sidebarWidth": 208,
    "asidePanelRatio": 0.3,
    "projectGraphRatio": 0.5
  },
  "recentDataFiles": []
}
```

Theme is `light-2026` or `dark-2026`. Sidebar width is 160–400 pixels; right panel
ratio is 0.15–0.8 and project graph ratio is 0.2–0.8. Ratios must be finite.
Recent desktop import paths retain at most ten entries. Project settings,
analyses and drafts retain their project/runtime owners. Desktop updater state
remains separately owned by `updater-settings.json` in the resolved app data directory.

Desktop commands are `get_preferences`, `patch_preferences` and
`reset_preferences`; successful writes emit `preferences-changed`. Tauri Store
is the desktop persistence adapter at the resolved config path. Browser uses
`GET/PATCH /api/preferences` and `POST /api/preferences/reset`, with serialized
atomic JSON replacement. Standalone browser windows share one user-scoped
`/api/server/events` connection for preference and project-registry invalidations.
The API-only development preview uses `/api/preferences/events`.
Patches merge against the latest file. Startup loads preferences before rendering
the editor or updater. Missing files use defaults. Invalid/future files are
preserved and reported, and require an explicit reset or operator repair. Save
errors retain the last confirmed UI state and are surfaced to the user.

Theme, sidebar width and recent files no longer read or write browser localStorage.
The two layout ratio fields remain accepted for wire/file compatibility, but the
Editor graph/Data View and right-panel splitters use window-local ratios until
reload. Their current default ratios are 0.5 and 0.3. Tools fits its contents until
manually resized; sidebar section ratios likewise reset on reload.

## Credentials and model caches

Desktop and single-user server provider keys use the OS credential store,
with `<host-identity>.ai.providers` namespaces. Multi-user worker metadata accepts
only `none` or `browser` credential ownership. Browser provider keys use
`wordflow-provider-credentials:v1:<account-UUID>` localStorage entries containing
`{"version":1,"connections":{"<connection-UUID>":"<key>"}}`. The credentials
belong to that browser profile and account; clearing browser storage removes them.

Model discovery and inference supply keys in operation headers
`x-wordflow-ai-provider` and `x-wordflow-ai-key`. A request-scoped Rust adapter
retains the key only for that operation, including its accepted task lifetime.
Keys are excluded from provider metadata, stored analysis requests, project
files, logs, cache keys and frontend query persistence. Logout revokes only the
presented session, clears active browser memory by leaving the application, and
retains account-partitioned browser keys for a subsequent sign-in.

Wordflow explicitly supplies HF, tokenizer, embedding and Lindera asset contexts;
registries include that context in their keys. It does not use ambient `HF_HOME`,
`LINDERA_DICT_PATH`, `WORDFLOW_CACHE_DIR`, `WORDFLOW_EMBEDDING_CACHE` or production
quotation overrides. Host ICU resource overrides remain explicit. Workers accept
resource overrides only inside `/wordflow` or packaged resources.

See [server ownership](../architecture/backend/server.md),
[desktop ownership](../architecture/frontend/desktop.md) and
[manual cutover](../runbooks/storage-cutover.md).
