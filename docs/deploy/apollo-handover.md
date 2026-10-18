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
| **#406** Answers wrapped in code blocks are read, and every Apollo request sends a strict labels schema (`response_format` json_schema), so batches are no longer split for fenced or short answers | `1501e295` (merged in `b6f16503`) | `backend/src/ldaca_wordflow/infrastructure/providers/annotation_{ai,openai,adapter}.py`, `apollo_deploy/adapter.py` |
| **#407** A one-line description under each model, from LiteLLM's `model_info.description` (or `APOLLO_LLM_MODEL_DESCRIPTIONS`), in the configured order | `6229ebae` (merged in `b6f16503`) | `infrastructure/providers/model_descriptions.py`, `services/annotations.py`, `apollo_deploy/{adapter,config}.py`, `frontend/.../ModelNameCombobox.tsx` |
| **#409** Project import and export have no size caps (a 0.7.14 export with a 4.3 MB manifest was refused); only free disk space and quotas limit them | `93c52cc7` (merged in `6a785205`) | `services/workspace_archives.py`, `settings.py`, `runtime.py` |
| **#408** Optional **Task context** in the codebook, sent to the AI after the prompt | `a24ad20b` (merged in `6a785205`) | `features/views/annotation/` (codebook editor), `infrastructure/providers/annotation_ai.py` |
| **#403** OIDC scopes are configurable and the issuer can have a path (Keycloak realm) | `dc2e98b0` (already on v0.7) | `backend/src/ldaca_wordflow/settings.py`, `api/auth.py` |

Both branches are at version **0.7.15-pre**, a prerelease of 0.7.15 (Python
writes it `0.7.15rc0`). `/health/ready` reports `0.7.15rc0+apollo.<build number>`.

## Build

**Preferred: the GitHub workflow.** Every push to `deploy/apollo` runs
`Apollo deploy image`, which builds and pushes:

```
ghcr.io/australian-text-analytics-platform/ldaca-wordflow-apollo:0.7.15-pre-apollo.<run number>
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
APOLLO_LLM_MODEL_DESCRIPTIONS={"<model id>":"<one line>"}   # optional; normally set model_info.description in LiteLLM
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
   and version `0.7.15rc0+apollo.<n>`.
3. If it doesn't become ready, read the container log before changing anything.
   A wrong `APOLLO_LLM_*` or `CILOGON_*` setting stops start-up and the log
   names the setting; the gateway key and client secret are never printed.

## Check after deploying

1. **Sign-in:** the start page shows "Sign in with SSO"; it goes to the Run:ai
   Keycloak page and back into Wordflow.
2. **Provider:** Settings → AI lists **Apollo LLM** first, marked Read-only. A
   new Annotation tab selects it with the default model, and Advanced settings
   show **Requests at once** fixed at 1. The model list keeps the
   `APOLLO_LLM_MODELS` order and shows each model's description underneath
   (from LiteLLM's `model_info.description`, or `APOLLO_LLM_MODEL_DESCRIPTIONS`).
   In **Edit codebook**, a **Task context** filled in and saved shows on the
   Codes card and not as a code.
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

## How it works (for diagnosing problems)

- **Request path.** The browser sends the Apollo configuration id
  (`3c4d70f7-4c43-5e66-9f39-6a4b478319bc`) and the placeholder URL
  `https://apollo-llm.invalid/v1`, never a key.
  1. `services/provider_credentials.py` recognises the request
     (`apollo_deploy.claims_annotation_provider`) and returns a marker.
  2. `services/analyses.py` (Runs) and `services/analysis_results.py`
     (Preview pages) look up the signed-in account
     (`apollo_deploy/binding.py`, `EndUserResolver`: `users.email`, or the
     first `user_identities.subject`).
  3. They swap the marker for a signed token,
     `apollo-user:v1:<purpose>:<user id>:<end user>:<HMAC>`. The HMAC key is
     derived from the gateway key.
  4. The token travels where an API key would, through the scheduler and into
     the worker process.
  5. `apollo_deploy/adapter.py` checks the signature, then calls LiteLLM with
     the real URL and key from the environment, adding `user=<end user>`.
- **Rotating `APOLLO_LLM_API_KEY`** makes tokens of Runs still queued at the
  time invalid. Restart (which ends queued Runs anyway) after a key change.
- **One request at a time per user** has three parts:
  - the scheduler starts a user's Apollo Run only when no other Run or Preview
    of theirs is going (`apollo_deploy/gate.py`, hooked into
    `services/fair_scheduler.py` and `services/fair_queue.py`);
  - a Run sends one request at a time (`cap_concurrency` in
    `infrastructure/providers/annotation_ai.py`);
  - a user's Previews take turns, and a Preview during their Run is refused
    with HTTP 409 `apollo_llm_run_active`.

  All of this is held in memory in the one server process.
- **Rate limits.** The adapter retries a 429 up to 8 times, waiting 2, 4, 8 …
  up to 60 s (or `Retry-After`, capped at 60 s), about 3 minutes in all. After
  that, the batch's own "Retries if a request fails" setting applies.
- **What LiteLLM receives:**
  - an ordinary chat completion with `model`, `messages`, `temperature`,
    `max_completion_tokens` and `user`;
  - `response_format` `json_schema` (strict): `labels` is an array of exactly
    as many items as texts in the batch, each a code (or an example's label)
    or null (#406). If the gateway answers that with HTTP 400, Wordflow sends
    the request again without it and stops sending it for the rest of the
    process;
  - `chat_template_kwargs.enable_thinking` (the Thinking switch). If the
    gateway answers that with HTTP 400, Wordflow sends the request once more
    without it and stops sending it for the rest of the process.
- **Client lifetime (#404).** Each request opens a client and closes it when
  it ends. Connecting gives up after 15 s; an answer may take up to 300 s.

## How it was tested

- **Unit tests** (`backend/tests/unit/test_apollo_deploy.py`, 16 tests) cover:
  - the provider is listed without key fields;
  - the key appears in no response, log or error;
  - `user` comes only from the session (forged and typed-in values are
    refused);
  - a user's Runs go one after another while another user's Run goes ahead;
  - a Run sends one request at a time;
  - 429s are retried with backoff;
  - a wrong setting stops start-up;
  - without `APOLLO_LLM_BASE_URL` the build behaves like upstream.
- **#404 tests** (`test_annotation_client_lifecycle.py`, 10 tests): every
  client is closed, on success and on failure. A soak test runs with
  `WORDFLOW_ANNOTATION_SOAK_REQUESTS=300`.
- **Frontend tests:** `frontend/src/features/apollo-deploy/__tests__/` (6) and
  `features/auth/components/__tests__/CILogonLogin.test.tsx` (2).
- **End to end, on a Mac, in single-user mode** (end user `root@localhost`),
  against a local stand-in for the gateway that logged each request, driving
  the app in WebKit:
  - Apollo LLM was preselected with the default model, and Requests at once
    was 1 and locked;
  - one Preview, then two Runs of 60 rows each, one row per request, in two
    tabs;
  - the second Run showed "Waiting for your previous Apollo LLM run";
  - the gateway log had 127 completions, all with `user`, never two open at
    once, and the 429 retried after 1 s (before #406, so without
    `response_format`);
  - the key was in no log line and nowhere in the data folder.
- **Not tested here:**
  - the real LiteLLM and vLLM (use the test model deployed on Apollo);
  - Run:ai sign-in past the Keycloak login page (the button reaches it);
  - hosted mode with real users;
  - the Docker image (no Docker on the build Mac);
  - the GitHub image workflow.

  These are what your checks are for.

## If something goes wrong

| What you see | Look at |
|---|---|
| Apollo LLM isn't listed | `GET /api/apollo/provider` says `"enabled": false`: `APOLLO_LLM_BASE_URL` isn't set in the container. |
| The server doesn't start | The log names the `APOLLO_LLM_*` or `CILOGON_*` setting that is wrong (for example a default model not in `APOLLO_LLM_MODELS`). |
| Models show without descriptions | `/model/info` failed or the models have no `model_info.description` in LiteLLM. Set them in LiteLLM (or `APOLLO_LLM_MODEL_DESCRIPTIONS`); changes show within 5 minutes. |
| Batches still split down to single rows | Check the Wordflow log for HTTP 400s from the gateway: if it refused `response_format`, Wordflow stopped sending it for the process. Restart after fixing the gateway. |
| The model list is empty | The ids in `APOLLO_LLM_MODELS` must match the gateway's `/v1/models` ids exactly. |
| Every request fails with "The AI provider rejected the API key" | Wrong `APOLLO_LLM_API_KEY`, or the key was changed while Runs were queued (restart). |
| Every request fails with "The AI provider rejected the request" | The model isn't allowed for this key in LiteLLM, or isn't in `APOLLO_LLM_MODELS`. |
| `user` is empty in LiteLLM's spend logs | Check the request reached this build (`/health/ready` version ends in `+apollo.N`); `user` is set on every Apollo completion. |
| A user's Run stays queued | That user has another Apollo Run going (Tasks shows "Waiting for your previous Apollo LLM run"), or the medium lane (`ANALYSIS_MEDIUM_CAPACITY`) is full with other users' Runs. |
| A request still waits 300 s | Confirm the image includes `b42d2614` (#404). Note the time, model and Run, and report it with the LiteLLM and vLLM logs for that minute. |
| Sign-in fails with an email conflict | That email already signed in through another issuer in this data folder; use a fresh `/data` for Run:ai. |

## Report back

Report to Chao: the image tag deployed, the readiness output, and the result of
each check above. File problems with the build as GitHub issues on
`ldaca-wordflow` with the label `v0.7.x` and say they are Apollo-build issues;
don't change `deploy/apollo` yourself.
