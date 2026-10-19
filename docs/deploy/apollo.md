# Apollo LLM deployment build

This branch, `deploy/apollo`, builds Wordflow for the University of Sydney's
Apollo cluster. It adds one built-in Annotation provider, **Apollo LLM**, that
reaches a LiteLLM gateway through the server, bills each request to the
signed-in user, and lets each user send one request at a time.

To roll out a new build on Apollo, follow [the handover](apollo-handover.md).

**None of this goes into the released version.** The branch is never merged
into `v0.7` or `main`, and it is never published to PyPI, the desktop
installers or GitHub Releases. Its only output is a container image on GHCR.

## What users see

- **Apollo LLM** is listed first under Settings → AI and in the Annotation
  provider list, for every signed-in user. It is read-only: no key to enter,
  no Edit or Delete. New Annotation tabs select it, with the server's default
  model.
- **The model list** keeps the `APOLLO_LLM_MODELS` order and shows a one-line
  description under each model where one is set (see "Model descriptions"
  below). Choosing a model still sets its id.
- **Answers are enforced by the server.** Every request asks for a strict JSON
  schema: exactly one label per text, each a code or null. vLLM behind LiteLLM
  enforces it, so models that wrap answers in code blocks or drop a label no
  longer make Wordflow split batches.
- **Requests at once** is 1 for Apollo LLM and can't be raised. The help text
  says why: Apollo LLM takes one request at a time for each person.
- **A second Run while one is going** waits in the queue. Tasks shows
  "Waiting for your previous Apollo LLM run" until the first Run ends. Other
  users' Runs are never held up.
- **A Preview while the user's Run is going** is refused with a clear message:
  "Your Apollo LLM run is still going, and Apollo LLM takes one request at a
  time. Preview more rows when the run has finished." Previews by the same
  user take turns.
- **Rate limits (HTTP 429)** from the gateway are waited out (following
  `Retry-After` when sent, otherwise 2, 4, 8 … up to 60 seconds, about 3
  minutes in all), so a busy gateway slows a Run down instead of failing its
  batches.
- Users can still add their own providers. Those work exactly as upstream:
  their requests carry no `user` field and are not limited to one at a time.

## Configuration

Everything comes from the environment. Without `APOLLO_LLM_BASE_URL` the build
behaves exactly like upstream Wordflow.

| Variable | Required | Meaning |
|---|---|---|
| `APOLLO_LLM_BASE_URL` | yes | The gateway's OpenAI-compatible API root, for example `https://litellm.example.edu.au/v1`. |
| `APOLLO_LLM_API_KEY` | with the URL | The gateway key (a LiteLLM virtual or master key). Put it in the secret file, not in `app.env`. |
| `APOLLO_LLM_MODELS` | no | A JSON array of model ids, for example `["llama-3.3-70b","qwen3-32b"]`. When set, only these models are offered and accepted, in this order. When unset, every model the gateway lists is offered. |
| `APOLLO_LLM_DEFAULT_MODEL` | no | The model new tabs start on. Must be in `APOLLO_LLM_MODELS` when that is set. |
| `APOLLO_LLM_MODEL_DESCRIPTIONS` | no | A JSON object, model id to one line of text (at most 200 characters), for example `{"qwen3-32b":"fastest; good for large, straightforward classification runs"}`. Wins over the gateway's description. Usually not needed: set descriptions in LiteLLM instead. |
| `APOLLO_LLM_USER_FIELD` | no | What is sent as the OpenAI `user` field: `email` (default) or `subject` (the identity provider's subject id). |

The name "Apollo LLM", its default selection and the limit of one request at a
time are fixed behaviour of this build, not settings.

The rest of the server configuration is the usual hosted setup in
[Hosted deployment](../runbooks/hosted-deployment.md). For the Run:ai Keycloak
realm, see its section "Other OIDC providers (Keycloak, Run:ai)". Also set
`UPDATE_CHECK_ENABLED=false`, so users aren't told about public releases that
this build doesn't follow.

### Model descriptions

The text under each model comes from LiteLLM: set `model_info.description` on
each model in the LiteLLM configuration, and Wordflow reads it from
`GET {APOLLO_LLM_BASE_URL}/model/info` with the gateway key. It is asked
alongside the model list, capped at 5 s and kept for 5 minutes (1 minute after
a failure), so a change in LiteLLM shows within 5 minutes. If the call fails,
the models are listed without descriptions. `APOLLO_LLM_MODEL_DESCRIPTIONS`
overrides a model's text where set. This uses the same mechanism as upstream
Wordflow (#407); Apollo adds the configured order and the override.

## Run:ai sign-in (`APOLLO_AUTH=runai_proxy`)

On Apollo, Run:ai already puts a login sidecar in front of a workload's
external URL: people sign in with Run:ai (Keycloak, University SSO), and the
sidecar forwards each request to the app over the pod's loopback interface,
adding the signed-in person's identity as headers. With
`APOLLO_AUTH=runai_proxy`, hosted Wordflow uses that identity directly: no
second sign-in and no OIDC client registration.

| Variable | Required | Meaning |
|---|---|---|
| `APOLLO_AUTH` | yes | `runai_proxy` turns the mode on. Unset means upstream sign-in (Google or CILogon/OIDC). |
| `APOLLO_PUBLIC_URL` | yes | The external URL as an https origin, e.g. `https://wordflow2026-pilot.gpu.sydney.edu.au`. It must also be in `TRUSTED_HOSTS` (its host) and `CORS_ALLOWED_ORIGINS` (the origin). |
| `APOLLO_HEADER_EMAIL`, `APOLLO_HEADER_USER`, `APOLLO_HEADER_USERNAME` | no | Identity header names. Defaults: `X-Forwarded-Email`, `X-Forwarded-User` (the stable subject), `X-Forwarded-Preferred-Username` (display name). |
| `APOLLO_SIGN_OUT_PATH` | no | The sidecar's sign-out path, default `/oauth2/sign_out`. |

The mode also needs `MULTI_USER=true` and `SESSION_COOKIE_SECURE=true`, and
can't be combined with Google or CILogon settings. Start-up stops and names the
setting if any of this is wrong.

**Run the server on loopback only**, on the port given to `--external-url`:
`ldaca-wordflow --multi-user --host 127.0.0.1 --port 8080` with
`--external-url container=8080`. Start-up refuses any other bind (`0.0.0.0`,
`localhost`, a pod IP), and uvicorn runs without proxy-header rewriting. Don't
put a relay or any other container in the pod: anything in the pod can reach
127.0.0.1. The image's default command binds `0.0.0.0:8001`, so override it in
this mode.

How it works:

- Identity headers are read only when the TCP peer is a loopback address (the
  sidecar). `X-Forwarded-For` is never used for trust.
- The subject and the email are required. A request with either missing gets a
  "Sign in through Run:ai" page (or a 401 `runai_sign_in_required` from the
  API), and no user is created. A request carrying an identity header twice is
  refused. Group headers are ignored.
- Every cookie except Wordflow's own session cookie, and any `Authorization`
  header, is removed before routing, so the sidecar's credentials never reach
  Wordflow's code or logs.
- The identity becomes an ordinary Wordflow session: the user is provisioned
  under the issuer `runai-proxy:<public host>`, and the presented session is
  reused while it belongs to the same subject. A different subject (someone
  switched Run:ai accounts in that browser) revokes the old session and starts
  a new one. CSRF, Origin checks, streams and the Apollo LLM `user` field work
  as in any hosted deployment.
- **Re-created accounts:** a known email arriving with a new subject is
  re-linked to the existing user if that user has no other sign-in method, and
  a warning with both subjects is logged. This assumes an email address is
  never given to a different person. An email already used with another sign-in
  method is refused.
- **Sign out:** Wordflow ends its session, then sends the browser to the
  sidecar's sign-out address (from `GET /api/apollo/session`), so the sidecar's
  session ends too. The Keycloak/University SSO session may remain, so the
  person can be signed straight back in.
- **Who can get in** is decided by the sidecar: people who can sign in to
  Run:ai, narrowed by the external URL's `authusers`/`authgroups` if set. A
  request that reaches the sidecar with a valid Run:ai token arrives with that
  token's identity, and is refused if it has no email.

Re-check after every Run:ai upgrade, because the sidecar's behaviour isn't
documented by Run:ai:

1. a header echo shows the identity headers above;
2. forged identity headers are replaced for signed-in users, and requests
   without a session are redirected to the sign-in;
3. the app port can't be reached from another pod;
4. the platform's own checks on the sidecar's session store and secrets still
   pass (with the cluster admins).

## How the key and the user are kept safe

- **The key stays on the server.** The browser gets a fixed configuration id
  and a placeholder URL (`https://apollo-llm.invalid/v1`), and sends no key.
  The server swaps in the real URL and key only when it calls the gateway. The
  key is never in an API response, the runtime configuration, a saved
  Project, a log line, an error message or a user's credential file.
- **The `user` value comes from the session.** When a Run or Preview is
  submitted, the server looks up the signed-in account (email or subject) and
  passes a signed token to the worker in place of an API key. The worker
  checks the signature, sends the account as `user`, and adds the key. A value
  from the client is never used: a key typed in for Apollo LLM is refused, and
  so is any other provider configuration that points at the placeholder URL.
- **Errors are cleaned.** Gateway errors are passed on without the provider's
  exception chain, and anything that looks like a key (`sk-…`, `Bearer …`,
  `api_key=…`) is replaced with `[redacted]`.
- **One process.** The one-request limit is kept in the server process, as is
  the Analysis queue. Run one service process, as upstream requires; don't add
  Uvicorn workers or replicas behind one data folder.

## The image

The workflow `.github/workflows/apollo-image.yml` runs on every push to
`deploy/apollo` and on manual dispatch from that branch. It:

1. builds the frontend and the backend wheel from the branch;
2. marks the version as `<upstream version>+apollo.<run number>`, for example
   `0.7.15-pre+apollo.12`, which `/health/ready` shows as `0.7.15rc0+apollo.12`;
3. builds a linux/amd64 image from `deploy/apollo/Dockerfile`: python:3.14-slim,
   tini, the wheel, and the spaCy model (Quotation), the topic embedder and the
   BERT tokenizer already downloaded;
4. pushes it as `ghcr.io/australian-text-analytics-platform/ldaca-wordflow-apollo`
   with the tags `0.7.15-pre-apollo.12`, `sha-<commit>` and `latest`.

Keep the GHCR package private, and give the cluster a read-only token to pull
it. The image holds no secrets.

Run it with the data folder on a persistent volume at `/data`, and the
environment from `app.env` plus the secret file:

```bash
docker run --rm -p 8001:8001 \
  -v wordflow-data:/data \
  --env-file app.env --env-file secrets.env \
  ghcr.io/australian-text-analytics-platform/ldaca-wordflow-apollo:latest
```

The container listens on port 8001. tini passes SIGTERM to the backend only,
which stops its Analysis workers and records them as interrupted; allow about
30 seconds for a stop.

The PyPI and desktop release workflows refuse to run on a tree that contains
the Apollo code. A desktop release dispatched from another branch with a `ref`
override uses that branch's workflow file, so don't point a release at
`deploy/apollo`.

## Keeping the branch up to date

The patch is small: new code in `backend/src/ldaca_wordflow/apollo_deploy/`,
`frontend/src/features/apollo-deploy/`, `deploy/apollo/` and this page, plus
hooks marked `apollo-deploy:` in these upstream files:

- `backend/src/ldaca_wordflow/infrastructure/providers/annotation_openai.py`
- `backend/src/ldaca_wordflow/infrastructure/providers/annotation_ai.py`
- `backend/src/ldaca_wordflow/services/provider_credentials.py`
- `backend/src/ldaca_wordflow/services/analyses.py`
- `backend/src/ldaca_wordflow/services/analysis_results.py`
- `backend/src/ldaca_wordflow/services/analysis_scheduler.py`
- `backend/src/ldaca_wordflow/services/fair_scheduler.py`
- `backend/src/ldaca_wordflow/services/fair_queue.py`
- `backend/src/ldaca_wordflow/runtime.py`
- `backend/src/ldaca_wordflow/main.py`
- `backend/src/ldaca_wordflow/settings.py` (Run:ai sign-in counts as the identity provider)
- `backend/src/ldaca_wordflow/server_launcher.py` (loopback bind, no proxy headers)
- `backend/tests/unit/test_current_api_surface.py`
- `frontend/src/stores/authStore.ts` (sign-out through the sidecar)
- `frontend/src/features/provider-credentials/useProviderCredentials.ts`
- `frontend/src/features/views/annotation/AnnotationFeature.tsx`
- `frontend/src/features/views/annotation/aiProviders.ts`
- `frontend/src/features/views/annotation/components/AiProvidersPreferencesPanel.tsx`
- `frontend/src/features/views/annotation/components/AnnotationInferenceSettings.tsx`
- `frontend/src/features/views/annotation/components/inference-settings/AnnotationRunAllSettings.tsx`
- `frontend/src/features/views/annotation/hooks/useAnnotationTabSettings.ts`
- `.github/workflows/pypi-release.yml`, `desktop-release.yml`, `desktop-build.yml`

To take a new 0.7.x release, merge its tag into `deploy/apollo`, fix any
conflicts at the hooks (`git grep -n apollo-deploy`), and run the tests:

```bash
cd backend && uv run pytest -q tests/unit/test_apollo_deploy.py && uv run pytest -q
cd frontend && pnpm vitest run src/features/apollo-deploy && pnpm check
```

The push then builds a new image.
