# Apollo deployment: what changed and how to roll it out

For the agent that builds and runs Wordflow on the Apollo cluster. Read this
first, then [Apollo LLM deployment build](apollo.md) for the full reference.

## Where the code is

Repository `Australian-Text-Analytics-Platform/ldaca-wordflow`, branch
**`deploy/apollo`**. Build from the tip of that branch, not from `v0.7` or
`main`.

```bash
git fetch origin
git checkout deploy/apollo
git pull --ff-only
git submodule update --init --recursive
```

The branch is `v0.7` plus the Apollo-only build. It is never merged back and
never released. Do not push it to `v0.7` or `main`, do not tag it, and do not
publish it to PyPI or GitHub Releases.

## What changed since v0.7 @ 6e538cf8

| Change | Commit | Where |
|---|---|---|
| Built-in **Apollo LLM** provider: LiteLLM gateway behind the server, signed-in account sent as the OpenAI `user` field, one request at a time per user, 429s retried with backoff | `daddbf02` | `backend/src/ldaca_wordflow/apollo_deploy/`, `frontend/src/features/apollo-deploy/`, hooks marked `apollo-deploy:` (list in `apollo.md`) |
| Image build: linux/amd64, python:3.14-slim, tini, models pre-downloaded | `daddbf02` | `deploy/apollo/Dockerfile`, `deploy/apollo/prefetch_models.py`, `.github/workflows/apollo-image.yml` |
| **#404** Provider clients are closed after every request (the 1-in-80 stalls of 300 s you measured), and a connection that can't be opened fails after 15 s | `b42d2614` (merged in `01e7fe4b`) | `backend/src/ldaca_wordflow/infrastructure/providers/annotation_{adapter,openai,anthropic,google}.py` |
| **#405** The sign-in button reads **Sign in with SSO** (no CILogon name or icon), so Run:ai users aren't sent to the wrong brand | `b456ad60` (merged in `705952a0`) | `frontend/src/features/auth/components/{CILogonLogin,LoginScreen}.tsx` |
| **#403** OIDC scopes are configurable and the issuer can have a path (Keycloak realm) | `dc2e98b0` (already on v0.7) | `backend/src/ldaca_wordflow/settings.py`, `api/auth.py` |

The version reported by `/health/ready` is `0.7.14+apollo.<build number>`.

## Build

**Preferred: the GitHub workflow.** Every push to `deploy/apollo` runs
`Apollo deploy image`, which builds and pushes:

```
ghcr.io/australian-text-analytics-platform/ldaca-wordflow-apollo:0.7.14-apollo.<run number>
ghcr.io/australian-text-analytics-platform/ldaca-wordflow-apollo:sha-<full commit>
ghcr.io/australian-text-analytics-platform/ldaca-wordflow-apollo:latest
```

To rebuild without a new commit, run it by hand:

```bash
gh workflow run apollo-image.yml --repo Australian-Text-Analytics-Platform/ldaca-wordflow --ref deploy/apollo
gh run list --repo Australian-Text-Analytics-Platform/ldaca-wordflow --workflow apollo-image.yml --limit 1
```

The package is private: pull it with a read-only token (`read:packages`).
Deploy by the `sha-<commit>` or version tag, not `latest`, so a rollback is
one tag change.

**Fallback: build it yourself** (needs Node 24 with corepack, uv, Docker):

```bash
corepack enable && pnpm install --frozen-lockfile
pnpm deploy_frontend_to_backend
(cd backend && uv build --no-sources --wheel --out-dir ../dist)
docker build --platform linux/amd64 -f deploy/apollo/Dockerfile -t ldaca-wordflow-apollo:local .
```

## Configure

Environment for the container (secrets in a separate secret file or Kubernetes
Secret, never in the image or in `app.env`):

```ini
# Hosted mode and Run:ai sign-in (#403, #405)
MULTI_USER=true
CILOGON_ISSUER=https://gpu.sydney.edu.au/auth/realms/runai
CILOGON_CLIENT_ID=<client registered in realm "runai">
CILOGON_REDIRECT_URI=https://<public host>/api/auth/cilogon/callback
CILOGON_SCOPES=["openid","email","profile"]
SESSION_COOKIE_SECURE=true
TRUSTED_HOSTS=["<public host>"]
CORS_ALLOWED_ORIGINS=["https://<public host>"]
UPDATE_CHECK_ENABLED=false

# Apollo LLM provider
APOLLO_LLM_BASE_URL=https://<litellm host>/v1
APOLLO_LLM_MODELS=["<model id>","<model id>"]   # optional: offer only these, in this order
APOLLO_LLM_DEFAULT_MODEL=<model id>              # optional
APOLLO_LLM_USER_FIELD=email                      # or subject
```

Secrets: `CILOGON_CLIENT_SECRET` and `APOLLO_LLM_API_KEY`.

Runtime rules:

- **Exactly one replica, one process.** The one-request-per-user limit and the
  Analysis queue live in the process. Don't scale it out or add Uvicorn workers.
- Mount a persistent volume at `/data` (the image sets `DATA_ROOT=/data`) and
  keep it across upgrades. Use a fresh volume for a fresh Run:ai deployment:
  an email already used with another issuer can't sign in with a new one.
- The container listens on port 8001. Terminate TLS at the ingress, keep the
  Host header and scheme, use long read timeouts and no buffering for
  `/api/events` (server-sent events).
- Stop with SIGTERM and allow about 30 s (`terminationGracePeriodSeconds: 30`);
  tini passes the signal to the backend, which marks running Analyses as
  interrupted.

## Roll out

1. Note the image tag that is running now (for rollback).
2. Deploy the new tag with the configuration above and wait for readiness:
   `curl -fsS https://<public host>/health/ready` must report `status: ready`
   and version `0.7.14+apollo.<n>`.
3. If it doesn't become ready, read the container log before changing anything.
   A wrong `APOLLO_LLM_*` or `CILOGON_*` setting stops start-up and the log
   names the setting; the gateway key and client secret are never printed.

## Check after deploying

1. **Sign-in:** the start page shows "Sign in with SSO"; it goes to the Run:ai
   Keycloak page and back into Wordflow.
2. **Provider:** Settings → AI lists **Apollo LLM** first, marked Read-only. A
   new Annotation tab selects it with the default model, and Advanced settings
   show **Requests at once** fixed at 1.
3. **A Run:** annotate a few hundred rows. In LiteLLM's spend logs, every request
   carries the signed-in user (email or subject) in `user`.
4. **One at a time:** start a second Run in another tab. Tasks shows "Waiting
   for your previous Apollo LLM run" until the first finishes. Another user's
   Run starts at once.
5. **No stalls (#404):** across a long Run (2,000 or more texts), no request
   waits the full 300 s. Before this fix about 1 in 80 did.
6. **No key leaks:** the gateway key must not appear in the browser (network
   tab), in the container log, or under `/data`.

## Roll back

Redeploy the previous image tag on the same `/data` volume. None of these
changes alter the Project format. Annotation tabs that used Apollo LLM will
show no provider selected in a build without it.

## Report back

Report to Chao: the image tag deployed, the readiness output, and the result of
each check above. File problems with the build as GitHub issues on
`ldaca-wordflow` with the label `v0.7.x` and say they are Apollo-build issues;
don't change `deploy/apollo` yourself.
