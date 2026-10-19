# Backend Settings Reference

`ldaca_wordflow.settings.Settings` is the exact configuration authority.
Settings are case-insensitive environment variables whose names match the
fields below in uppercase. Complex tuples use Pydantic's JSON environment
encoding, for example `CORS_ALLOWED_ORIGINS='["https://wordflow.example"]'`.
Unknown settings are rejected.

## Storage And Capacity

| Setting | Meaning |
|---|---|
| `DATA_ROOT` | Optional canonical operator-owned storage root; non-empty values are immutable at runtime |
| `MAX_FILE_UPLOAD_BYTES` | Optional per-upload byte limit. Empty (default): no limit in any mode; on a hosted server the user's storage quota and `MIN_FREE_DISK_BYTES` bound uploads, and the browser reminds people before an upload over 50 MB (issues 248, 260) |
| `MAX_WORKSPACE_ARCHIVE_BYTES` | Optional Project import limit (compressed bytes). Empty (default): no limit; a valid Wordflow export imports at any size. Free disk space (`MIN_FREE_DISK_BYTES`), the user's storage quota on a hosted server, and the ZIP checks (safe paths, declared sizes, compression ratio) still apply (issue 409) |
| `MAX_WORKSPACE_EXPORT_BYTES` | Optional Project export limit. Empty (default): no limit; free disk space bounds it (issue 409). Data Block downloads stay within `MAX_RESPONSE_SNAPSHOT_BYTES` |
| `MAX_DEFAULT_REQUEST_BODY_BYTES` | Default non-upload request limit |
| `MAX_NODE_STORAGE_BYTES` | Per-Data-Block durable output limit |
| `MAX_TEXT_RESPONSE_BYTES` | Raw-text response limit |
| `MAX_USER_FILE_TREE_RESPONSE_BYTES` | Complete serialized User File tree response limit |
| `MAX_RESPONSE_SNAPSHOT_BYTES` | Per-response snapshot limit |
| `MAX_CONCURRENT_RESPONSE_SNAPSHOTS` | Snapshot concurrency bound |
| `MAX_OPEN_WORKSPACE_BYTES` | Hosted process capacity for serialized open Workspace state |
| `MAX_WORKSPACE_NODES` | Per-Workspace Data Block bound |
| `MAX_WORKSPACE_SNAPSHOT_BYTES` | Workspace plan/metadata commit limit |
| `MIN_FREE_DISK_BYTES` | Reserved physical free space |
| `ANALYSIS_EXECUTION_CAPACITY` | Concurrent fresh Analysis child processes; saturation queues |
| `USER_FILE_IMPORT_CAPACITY` | Concurrent complete User File Imports on the independent scheduler |
| `SHUTDOWN_GRACE_SECONDS` | Shared positive finite Analysis/import termination deadline |
| `MAX_ANALYSIS_STORAGE_BYTES` / `MAX_ANALYSIS_STORAGE_FILES` | Private snapshot, output, and Artifact bounds per Analysis |
| `MAX_TOPIC_PROJECTION_CACHE_ENTRIES` | Complete Topic projection bases retained per runtime; default 16, zero disables |
| `MAX_TOPIC_PROJECTION_CACHE_BYTES` | Encoded Topic projection basis byte bound; default 67108864, zero disables |
| `MAX_USER_FILE_IMPORT_BYTES` / `MAX_USER_FILE_IMPORT_FILES` | Staged output bounds per User File Import |
| `MAX_USER_FILE_IMPORT_RECORD_BYTES` | Strict per-import JSON record limit |
| `MAX_CONCURRENT_WORKSPACE_IMPORTS` | Archive import concurrency |

The internal layout is fixed rather than configurable: `workspaces/` and
`users/` are direct children of every Data Root. Hosted multi-user deployments
also use `deployment.sqlite3`. Single-user runtimes never create, open,
validate, or modify that file, including when a legacy copy already exists.
There is no Workspace-count setting or alternate per-user Workspace directory.
Explicitly open Workspaces remain open until close, deletion, or shutdown;
there is no idle or LRU setting. `MAX_OPEN_WORKSPACE_BYTES` applies only in
hosted multi-user mode, while single-user mode has no process-residency cap.
Hosted per-principal quota is the nullable `users.storage_quota_bytes` policy
in `deployment.sqlite3`, not an environment setting. `NULL` means unlimited;
new hosted users receive the database default of 30 GiB. Single-user storage is
always unlimited. There are no file-count, directory-count, Analysis-count, or
queue-count quotas.

When `DATA_ROOT` is absent, Wordflow reads
`<platform config directory>/au.edu.ldaca.wordflow/settings.json` with
schema `{ "schema_version": 1, "data_root": "..." }`. If no setting exists,
a single-user backend opens
`<platform local application-data directory>/au.edu.ldaca.wordflow/data` and
writes it to `settings.json` once it has opened; a failure leaves the control
plane in `configuration_error` with that root suggested.
Single-user clients may configure or switch this value through the backend;
multi-user clients may not. The backend does not read or migrate Tauri's former
`backend.json` file.

Each `users/<user-id>/` root contains `files/`, `imports/`, and schema-versioned
non-secret `preferences.toml`. In single-user mode, the only root is
`users/root/`, and its write-only Provider Credentials are stored separately in
`provider-credentials.toml` schema 2. That strict file contains the ordered,
UUID-backed Annotation Provider Configuration collection and the independent
Data Portal token. Multi-user personal credentials never use backend user
storage; legacy multi-user credential files are ignored. The backend rejects
linked, malformed, or schema-invalid current files, including schema 1, rather
than interpreting earlier storage layouts.

Both execution capacities default to two and accept any positive integer with
no schema ceiling or unlimited sentinel. `SHUTDOWN_GRACE_SECONDS` defaults to
10 seconds and must be positive and finite. All three are immutable for one
runtime and change only after restart.

The Topic projection cache is process-local and runtime-owned. It stores only
compact, complete, N-independent bases by principal, Workspace, Analysis,
immutable context identity, and cluster count. Entry or byte limit zero
disables retention. Oversized bases still serve their current request, while
failed or invalid projections are never retained.

## Server And Providers

| Setting | Meaning |
|---|---|
| `SERVER_HOST` / `BACKEND_PORT` | Bind host and positive listening port |
| `LOG_LEVEL` / `LOG_FILE` | Process log level and optional Runtime-active Data Root-relative file |
| `CORS_ALLOWED_ORIGINS` | Exact browser Origin allowlist |
| `TRUSTED_HOSTS` | Exact HTTP Host allowlist |
| `QUOTATION_SERVICE_TIMEOUT` | Remote quotation timeout |
| `QUOTATION_SERVICE_MAX_BATCH_SIZE` | Remote quotation batch ceiling |
| `QUOTATION_REMOTE_ENGINES` | Operator-owned quotation engine allowlist |
| `SERVER_AI_PROVIDERS_FILE` | Optional YAML file of LLM providers the server offers to every signed-in person; keys stay in the environment under the names the file gives. See [Server AI providers](../deploy/server-ai-providers.md) (issue 411) |

Single-user mode requires a loopback server host. Wildcard CORS and Host values
are invalid. Port zero is accepted only by the desktop launcher before it
constructs final Settings.

## Identity

| Setting | Meaning |
|---|---|
| `MULTI_USER` | Enable hosted multi-user mode |
| `GOOGLE_CLIENT_ID` | Optional hosted Google provider client ID |
| `CILOGON_CLIENT_ID` | CILogon OIDC client ID |
| `CILOGON_CLIENT_SECRET` | CILogon OIDC client secret |
| `CILOGON_ISSUER` | Exact trusted HTTPS issuer: an origin, or an origin with a path such as a Keycloak realm |
| `CILOGON_SCOPES` | OIDC scopes requested at sign-in, as a JSON list; must include `openid` and `email` |
| `CILOGON_REDIRECT_URI` | Exact registered callback URL |
| `SESSION_TTL_HOURS` | Hosted Session lifetime |
| `SESSION_COOKIE_SECURE` | Require HTTPS Session cookie |
| `AUTH_PROXY` | Trust a sign-in proxy's identity headers instead of Google or CILogon; Wordflow then binds loopback only. See [Sign-in proxy](../deploy/auth-proxy.md) (issue 411) |
| `AUTH_PROXY_PUBLIC_URL` | The https origin people use; required with `AUTH_PROXY` |
| `AUTH_PROXY_HEADER_USER` / `_EMAIL` / `_NAME` | Identity header names; default `X-Forwarded-User`, `X-Forwarded-Email`, `X-Forwarded-Preferred-Username` |
| `AUTH_PROXY_SIGN_OUT_PATH` | The proxy's sign-out path; default `/oauth2/sign_out` |
| `AUTH_PROXY_ISSUER` | Account namespace for proxy sign-ins; default `auth-proxy:<host>` |
| `AUTH_PROXY_LABEL` | How the sign-in page names the proxy |

Multi-user mode requires Google, the complete CILogon client, secret, and
redirect configuration, or `AUTH_PROXY`. `CILOGON_ISSUER` is the provider's exact issuer: an
origin such as `https://cilogon.aaf.edu.au`, or an origin with a path such as
the Keycloak realm `https://gpu.sydney.edu.au/auth/realms/runai`. Discovery is
derived internally by appending `/.well-known/openid-configuration` to it, and
the discovered endpoints must be on the issuer's HTTPS host.

`CILOGON_SCOPES` defaults to `["openid","email","profile","org.cilogon.userinfo"]`.
Providers other than CILogon may not define `org.cilogon.userinfo`, so set, for
example, `CILOGON_SCOPES=["openid","email","profile"]` for Keycloak. Each entry is
one scope token, entries are unique, and `openid` and `email` are required
because sign-in needs the `email` claim.

Identities are kept per issuer: changing `CILOGON_ISSUER` never links a sign-in
to an existing identity from another issuer. Email addresses are unique across
users, so someone who already signed in with one issuer and then signs in with
another issuer using the same email is refused ("Email belongs to a different
identity provider"). Use a fresh data folder when moving a deployment to a new
provider.

Single-user identity is not configurable. Startup always provisions and uses
`root` / `Root User` / `root@localhost`.

## LDaCA Data Portal

| Setting | Meaning |
|---|---|
| `LDACA_ONI_API_BASE_URL` | Oni API base URL |
| `LDACA_ONI_API_TOKEN` | Optional deployment Data Portal bearer credential, used only by the provider adapter |
| `LDACA_ONI_TIMEOUT` | Request timeout |
| `LDACA_ONI_DOWNLOAD_CONCURRENCY` | Import download concurrency |
| `LDACA_ONI_FEATURED_COLLECTION_IDS` | Featured collection identifiers |

Single-user Data Portal calls use the root user's credential when configured,
then this deployment token. Multi-user calls use a transient browser-supplied
token when present, then this deployment token. These credentials do not alter
Wordflow's own Session transport.
