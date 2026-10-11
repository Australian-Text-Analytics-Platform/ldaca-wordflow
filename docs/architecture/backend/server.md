# Standalone server ownership

`server/` owns standalone configuration, embedded UI serving, per-user file
libraries, authentication and worker lifecycle. `wordflow-backend` owns analysis
and database behavior. `wordflow-api-dev` is the API-only engine test host and is
not a release package. The server has single-user and Linux multi-user modes.

```mermaid
flowchart LR
    Browser[Browser windows] --> Gateway[Authentication and routing gateway]
    Gateway --> A[User A worker and project registry]
    Gateway --> B[User B worker and project registry]
    A --> RootA[User A storage root]
    B --> RootB[User B storage root]
```

Single-user mode runs the same per-user host in process, under `admin`. Each host
maintains a registry of transient project UUIDs. These IDs identify open sessions,
and stay unchanged through Rename. They
are not persisted in project files. New/Open selects a project only
in the requesting window. Different files have independent runtimes; opening
the same canonical file reuses its runtime. Project requests are captured under
`/project/{id}`. Refresh reconnects to the project ID in the browser URL.
Disconnecting a browser does not close projects or cancel accepted tasks.

Explicit Close Project closes the shared runtime in every attached window.
Editing protection, cancellation confirmation and cleanup barriers apply to Close. Failed close retains the runtime. User-scoped SSE
announces changes and each window checks its captured ID; it does not select
another window's project. Stale IDs after worker restart require explicit reopen.
New immediately creates an unused `Untitled-X.wfpj` in the permanent project
library. Operations commit directly, so the server has no Save workflow. Files
survive restart; session UUIDs do not. There is no change to the `.wfpj` schema.

Rename pauses admission and rejects retained work or a Table-edit session. It
reuses checkpointed project publication and retains the runtime, event channels,
task history and attached windows. A case-insensitive filename collision fails
without replacing the confirmed project; case-only renames are supported.
Duplicate downloads a checkpointed snapshot through the same native owner and
publishes a unique permanent copy. It opens no new runtime and leaves the
requesting window on the original project. Switching a window changes only its
selection; other sessions and accepted background tasks remain alive.

`/api/server/events` combines project-registry and application-preference
invalidations. Its optional `project_id` multiplexes that session's native Task,
change and reset events onto the same stream. Preference, registry and selected
project subscribers share one connection in each browser window, keeping HTTP
refresh capacity available when several windows are open. Switching reconnects
this stream to the new captured project without cancelling the previous session's
work. Closed/missing sessions still receive registry/preference invalidations.

Host Settings are available before project selection. Root `/api/ai` connection
management and the compatible `/project/{id}/api/ai` routes share one configuration
owner. Read-only storage locations are host interfaces, independent of open
projects. Workers retain account-owned AI credential metadata while browser AI
credentials accompany only the applicable operation. LDaCA tokens remain inline
and in window memory.
The [storage reference](../../reference/application-storage.md) owns the exact
credential and preference contracts.

Uploads and projects retain copy-on-import, no-overwrite publication, validated
filenames and symlink rejection. A file cannot be deleted while a registry runtime
has it open. Checkpointed downloads preserve project structure and differ from
portable Export. [Storage reference](../../reference/application-storage.md)
owns exact directory, preference and credential contracts.

## Data library and imports

The data library exposes relative folder paths, folder creation, multiselection,
batch moves/deletion and ZIP download preserving selected paths. Resolution
rejects links and escapes. Overlapping folder/file selections resolve once.
Server inspection and import delegate to the backend's shared native file planner;
the browser never publishes a multi-file import through separate requests.
The [native API reference](../../reference/native-project-api.md#desktop-imports)
owns format, sheet and text-row contracts.

One file-mutation gate preflights a complete requested batch before changes begin.
An upload registers its destination folder before reading the body, then streams
without holding that gate. Moves and deletion reject the receiving folder and
its ancestors while unrelated paths remain usable. Completion, failure and
request cleanup release protection. Accepted blocking publication and file mutations
retain their gates through worker completion even when the HTTP receiver drops.
Publication retains no-overwrite hard links.

Browser upload cards own transfer progress and cancellation independently of the
current project view; TanStack Query still owns the file inventory. At full byte
progress a card says **Finishing…** until acknowledgement. Failures retain the
original diagnostic and Retry. Cancellation refreshes the destination and keeps
a persistent **Refresh destination** / **Dismiss** card when completion is
uncertain; it does not promise rollback. There is no application upload quota or
size reminder.

## Multi-user boundary

Google and CILogon Authorization Code flows use PKCE, state, nonce and validated
ID tokens. Accounts are keyed by issuer and subject, without email merging.
SQLite stores account metadata and hashed 24-hour session tokens. Login
transactions are single-use and expire after ten minutes. Mutations require the
session's CSRF token and exact configured public Origin. Session cookies are
Secure, HttpOnly and SameSite. Logout revokes only the presented session.

A dedicated Linux service account uses rootless Docker to launch one worker per
user from an immutable application image ID. Workers mount only their user's
root at `/wordflow`; the image is read-only, capabilities are dropped, privileges
cannot increase and resource limits must be enforced by cgroup v2 and systemd.
Each worker has its own Docker bridge and private Unix socket, with no published
ports, Docker socket, host home, other users' roots or authentication secrets.
The gateway streams HTTP, Arrow, SSE, uploads and downloads after authentication.
It resolves socket paths beneath the user root without symlinks and pins the
resolved socket inode, preventing worker-writable paths from redirecting requests
into another user's socket.

Gateway provisioning is serialized and bounded. Storage locks reject duplicate
workers. A restarted gateway may adopt matching healthy workers. Shutdown sends
SIGTERM and waits for cleanup without a Docker forced-kill timeout. Worker crashes
are isolated to that user and surfaced as unavailable/reopen states. There is no
idle eviction. The root-installed network policy and actual worker resource/egress
checks are mandatory deployment prerequisites; see the
[Linux deployment procedure](../../runbooks/linux-multi-user.md).

## Prefix and generated contracts

The configured external prefix is injected into `index.html`; a reverse proxy
strips it before forwarding. Assets, APIs, streams and downloads use that prefix.
Forwarded headers do not authorize Origins. Multi-user public URL must be HTTPS
and match the prefix, including each provider's explicit callback registration.

Rust annotations own OpenAPI contracts. `vp run api:generate` composes backend,
server, preference and account schemas without opening storage or loading assets.
The frontend consumes generated types. See
[server build and operation](../../runbooks/native-server.md).
