# Hosted Deployment Runbook

This runbook is the entry point for running Wordflow as a hosted, multi-user
service. It covers a checkout behind an HTTPS reverse proxy; replace
hostnames, paths, and release refs with the deployment's actual values.

Related runbooks:

- [Server image](server-image.md): run the same service from a container image
  instead of a checkout.
- [Server AI providers](server-ai-providers.md): offer the server's own LLMs
  for AI annotation, so people don't need their own keys.

## Prepare The Checkout

```bash
git clone https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow.git
cd ldaca-wordflow
git checkout <release-ref>
git submodule sync --recursive
git submodule update --init --recursive --checkout
pnpm install --frozen-lockfile
pnpm deploy_frontend_to_backend
uv sync --project backend --frozen --no-dev --no-editable
```

The backend is tracked directly in the root repository. The current submodules
are `polars-text`, `polars-source-utils`, `ldaca-analytics-sample-data`, and the
published documentation mirror. A pull that advances one of those pointers
must be followed by the sync/update commands before restart. The backend
fetches sample data from the repository's published raw GitHub URLs at runtime;
it does not read the sample-data submodule checkout.

## Backend Environment

Store non-secret settings in the service definition and provider secrets in a
mode-`0600` environment file owned by the service account. Every hosted
deployment sets:

```ini
MULTI_USER=true
SERVER_HOST=127.0.0.1
BACKEND_PORT=8001
TRUSTED_HOSTS=["analytics.ldaca.edu.au"]
CORS_ALLOWED_ORIGINS=["https://analytics.ldaca.edu.au"]
SESSION_COOKIE_SECURE=true
```

plus the settings of exactly one sign-in method below. Start-up stops and
names the setting when the sign-in configuration is incomplete or mixes the
proxy with another method. All settings are listed in
[Backend settings](../reference/backend-settings.md).

### Sign-in

Wordflow can sign people in two ways. Both end in the same Wordflow
session, so CSRF and Origin checks, event streams, Projects and server AI
providers work the same with each.

| Method | Wordflow's role | Needs | Choose it when |
|---|---|---|---|
| Google | Signs people in with Google | A Google OAuth web client | Anyone with a Google account may use the server |
| OIDC (CILogon, AAF, Keycloak) | Runs the OIDC sign-in itself | A client registered with the provider, its secret | The institution has an OIDC provider and can register a client for Wordflow |

Google and OIDC may be offered together; the sign-in page then shows both
buttons. Accounts belong to the issuer that
created them, and an email address belongs to one account, so changing method
on a server with existing users needs a fresh data folder or a deliberate
migration.

#### Google

```ini
GOOGLE_CLIENT_ID=<web client id>.apps.googleusercontent.com
```

In the Google Cloud console, the web client's authorised JavaScript origins
include `https://analytics.ldaca.edu.au` and its authorised redirect URIs
include `https://analytics.ldaca.edu.au/api/auth/google/callback`. No secret
is needed.

#### OIDC: CILogon and AAF

```ini
OIDC_CLIENT_ID=<registered-client-id>
OIDC_ISSUER=https://cilogon.aaf.edu.au
OIDC_REDIRECT_URI=https://analytics.ldaca.edu.au/api/auth/cilogon/callback
```

The secret file supplies only `OIDC_CLIENT_SECRET`. See
[OIDC client secrets](cilogon-secrets.md). Before 0.7.16 these settings were
named `CILOGON_*`; existing servers keep working with those names, and the
`OIDC_*` name wins when both are set. The sign-in button reads "Sign in with
SSO" for every OIDC provider (issue 405).

#### OIDC: other providers (Keycloak)

The same settings work with any OIDC provider that supports discovery, the
authorization code flow with PKCE (S256) and the `email` claim. Set the
provider's exact issuer, including any path, and the scopes it defines. For
example, a client registered in a Keycloak realm:

```ini
OIDC_ISSUER=https://sso.example.edu.au/auth/realms/<realm>
OIDC_CLIENT_ID=<client registered in that realm>
OIDC_REDIRECT_URI=https://<host>/api/auth/cilogon/callback
OIDC_SCOPES=["openid","email","profile"]
```

`OIDC_CLIENT_SECRET` goes in the secret file as above. Keycloak doesn't
define `org.cilogon.userinfo`, so leave it out of `OIDC_SCOPES`. This needs
a client registered by the realm's administrators: confidential (with a
secret), the standard (authorization code) flow, and exactly the redirect URI
above.

### Analysis capacity

Analyses run in three lanes, each with its own slots (issue 328), so quick
tools never wait behind topic models:

```dotenv
ANALYSIS_SLOW_CAPACITY=2       # Topic Modelling, adding topic results, Quotation
ANALYSIS_MEDIUM_CAPACITY=2     # Annotation (language-model calls)
ANALYSIS_EXECUTION_CAPACITY=4  # everything else
POLARS_TEXT_EMBEDDING_THREADS=8
```

The values shown are the defaults, except `POLARS_TEXT_EMBEDDING_THREADS`,
which is unset by default: each topic model's embedding then uses every
processor the worker may run on, capped by any container CPU quota (issue 341). On a
shared server, set it so two slow-lane topic models leave cores for everyone
else; with 32 cores, 8 threads each is a reasonable start (polars-text 0.6.3
and later honour the number). A full lane queues new work rather than refusing
it.

## Provider Credentials

A deployment can also offer its own LLMs for AI annotation, with keys kept on
the server; see [Server AI providers](server-ai-providers.md). Those keys go in
the service secret file, and people use those providers without entering
anything. Everything below is about people's own credentials.

Do not place users' Annotation or Data Portal credentials in the service
environment or backend Data Root. In multi-user mode, each user enters personal
credentials under **Settings → AI** or **Settings → Portal**. Wordflow
stores the ordered, named Annotation configuration collection and its secrets
only in that browser's `wordflow-provider-credentials` version 2 localStorage
entry, partitioned by authenticated user ID, and sends the selected secret
transiently with provider calls. Logout deliberately retains the browser entry;
a different browser profile or device requires re-entry.

`LDACA_ONI_API_TOKEN` is an optional deployment-wide Data Portal fallback and
may be supplied through the service secret file. It is not a personal
credential and does not replace the browser-owned Annotation keys required in
multi-user mode.

Authenticated hosted users may configure a Custom OpenAI-compatible absolute
HTTP(S) base URL, including private or loopback destinations. The backend makes
model-list and Chat Completions requests to that user-selected destination.
Deploy only where this deliberate trusted-user SSRF boundary is acceptable.

After upgrading from server-stored multi-user credentials, existing
`users/*/provider-credentials.toml` files remain untouched but are never read.
Have users re-enter their keys, then remove legacy files manually according to
the deployment's backup and retention policy. Do not automate that deletion as
part of startup or upgrade.

Browser localStorage removes backend at-rest custody; it does not protect a
credential from same-origin script injection or a privileged browser
extension. Treat CSP and XSS hardening as an independent hosted security
control and follow-up.

## systemd

The preparation command builds the backend and sibling sources into the
backend-owned environment without editable checkout links. Run that prepared
entry point directly:

```ini
[Unit]
Description=LDaCA Wordflow
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=wordflow
WorkingDirectory=/srv/ldaca-wordflow/backend
EnvironmentFile=/etc/ldaca-wordflow/app.env
EnvironmentFile=/etc/ldaca-wordflow/secrets.env
ExecStart=/srv/ldaca-wordflow/backend/.venv/bin/ldaca-wordflow --port 8001
Restart=on-failure
RestartSec=5
# Signal only the backend on stop; it stops its own analysis workers and marks
# them interrupted. Leftovers are killed when the stop completes (issue 258).
KillMode=mixed
# Covers the 5 s connection drain plus SHUTDOWN_GRACE_SECONDS (default 10 s).
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

With the default `KillMode=control-group`, systemd sends SIGTERM to the
analysis worker processes at the same moment as the backend, so a restart
records running analyses as failures instead of interruptions.

Run one service process. Do not add Uvicorn workers; see
[ADR 0001](../adr/0001-single-process-lifespan-owned-backend.md).

## Reverse Proxy And Readiness

Terminate TLS at the reverse proxy, preserve the original Host and scheme, use
long read timeouts for SSE, and disable buffering for `/api/events`.
Forward to `127.0.0.1:8001` and verify:

```bash
curl --fail --silent https://analytics.ldaca.edu.au/health/ready
```

The response must report `status: ready` and the intended package version.

## Update

```bash
git fetch --tags origin
git checkout <release-ref>
git pull --ff-only
git submodule sync --recursive
git submodule update --init --recursive --checkout
pnpm install --frozen-lockfile
pnpm deploy_frontend_to_backend
uv sync --project backend --frozen --no-dev --no-editable
sudo systemctl restart ldaca-wordflow
curl --fail --silent https://analytics.ldaca.edu.au/health/ready
```

If startup fails, inspect `journalctl -u ldaca-wordflow` before changing files
or deleting Data Root state.
