# Wordflow on Apollo: configuration only

From 0.7.16, Apollo runs the **standard Wordflow release**. This branch adds only
Apollo's own configuration; it never goes into `v0.7`, `main` or a release.

| File | What it is |
|---|---|
| `server-ai-providers.yaml` | Apollo's AI providers (Annotation) and Topic Modelling GPU, read through `SERVER_AI_PROVIDERS_FILE` |
| `app.env.example` | The non-secret environment: hosted mode, Run:ai sign-in (`OIDC_*`), hosts |

Everything else (the server features, the image, the runbooks) is in the release:
see `docs/runbooks/server-ai-providers.md`, `docs/runbooks/server-image.md` and
`docs/runbooks/hosted-deployment.md`.

## Deploy

1. **Image.** Run the `Server image` workflow on the release tag (or, for a test,
   on `v0.7` with a local version label such as `rc.1`). Use the image tag it
   prints, not `latest`, so a rollback is one tag change.
2. **Configuration.** Mount `server-ai-providers.yaml` read-only at `/config/` and
   pass `app.env` as the environment.
3. **Secrets** from Run:ai credentials, never in a file in this repository:
   - `OIDC_CLIENT_SECRET` (credential `wordflow-oidc`);
   - `APOLLO_LLM_API_KEY` (credential `wordflow-apollo-llm`, the LiteLLM key; it
     serves both Apollo LLM and Apollo GPU).
4. **Runtime rules** as before: one replica and one process, `/data` on a
   persistent volume, port 8001, SIGTERM with about 30 s to stop.

## Run:ai commands

Project `wordflow2026`, volume `exa-pvc-wordflow2026` at `/scratch/wordflow2026`.
Run:ai's own sign-in sits in front of the external URL; Wordflow listens on
127.0.0.1:8080 behind it, as the pilot does. Secrets come from your Run:ai user
credentials: `wordflow-oidc` (key `CILOGON_CLIENT_SECRET`, passed in as
`OIDC_CLIENT_SECRET`) and `wordflow-apollo-llm` (key `APOLLO_LLM_API_KEY`).

A test workspace for a release candidate, on a copy of the pilot's data
(`pilot/hosted-data-rc1`) with this folder's providers file copied to
`pilot/release-rc1/`:

```bash
IMAGE=ghcr.io/australian-text-analytics-platform/ldaca-wordflow-server:0.7.16-pre-rc.1
HOST=wordflow2026-rc1.gpu.sydney.edu.au
runai workspace submit rc1 -p wordflow2026 -i "$IMAGE" --image-pull-policy Always \
  --existing-pvc claimname=exa-pvc-wordflow2026,path=/scratch/wordflow2026 \
  --external-url container=8080 \
  --cpu-core-request 8 --cpu-core-limit 8 --cpu-memory-request 32G --cpu-memory-limit 32G \
  --run-as-uid 0 --run-as-gid 0 \
  -e MULTI_USER=true \
  -e OIDC_ISSUER=https://gpu.sydney.edu.au/auth/realms/runai -e OIDC_CLIENT_ID=wordflow \
  -e OIDC_REDIRECT_URI=https://$HOST/api/auth/cilogon/callback \
  -e 'OIDC_SCOPES=["openid","email","profile"]' -e SESSION_COOKIE_SECURE=true \
  -e "TRUSTED_HOSTS=[\"$HOST\",\"localhost\",\"127.0.0.1\"]" \
  -e "CORS_ALLOWED_ORIGINS=[\"https://$HOST\"]" -e UPDATE_CHECK_ENABLED=false \
  -e DATA_ROOT=/scratch/wordflow2026/pilot/hosted-data-rc1 \
  -e SERVER_AI_PROVIDERS_FILE=/scratch/wordflow2026/pilot/release-rc1/server-ai-providers.yaml \
  --env-my-credentials type=genericSecret,name=OIDC_CLIENT_SECRET,credential-name=wordflow-oidc,key=CILOGON_CLIENT_SECRET \
  --env-my-credentials type=genericSecret,name=APOLLO_LLM_API_KEY,credential-name=wordflow-apollo-llm,key=APOLLO_LLM_API_KEY \
  --command -- ldaca-wordflow --multi-user --host 127.0.0.1 --port 8080
```

- The image runs as root here because the volume's folders are root-owned, as
  for the pilot (python:3.14-slim).
- GHCR: the image must be public, or pass
  `--image-pull-my-credentials type=dockerRegistry,name=<a GHCR read credential>`.
- Wordflow's sign-in needs the host's callback registered on the `wordflow`
  client in the Run:ai realm; until then, check the API through
  `runai workspace port-forward rc1 -p wordflow2026 --port 18080:8080`.

To roll the pilot itself onto an image, delete and resubmit `pilot` with the
same command, `DATA_ROOT=/scratch/wordflow2026/pilot/hosted-data` and the
pilot's host; roll back by resubmitting its current command
(`bash /scratch/wordflow2026/pilot/release/start.sh` on python:3.14-slim).

## Moving from the old `deploy/apollo` image

- `APOLLO_LLM_*` settings are replaced by `server-ai-providers.yaml`. Apollo LLM
  keeps its configuration id (`3c4d70f7-…`), so saved Annotation tabs find it.
- `CILOGON_*` settings still work, but use the `OIDC_*` names in `app.env`.
- Annotation runs are still limited to one request at a time per person
  (`max_requests_per_user: 1`), and the signed-in email is sent to LiteLLM as `user`.

## Checks after deploying

The checklist is in ldaca-wordflow issue #420: sign-in through the Run:ai realm;
Settings, Servers lists Apollo LLM and Apollo GPU read-only; an Annotation run
records the person in LiteLLM; Topic Modelling with Remote GPU on and off; the key
and client secret appear nowhere (browser, log, `/data`).

The gateway address is the in-cluster one the pilot uses; both embedding models
answered there from the pilot pod on 2026-10-22. Checked locally the same day against the real gateway (single-user, this file,
key from the environment): the Topic Modelling check reached both `minilm-en` and
`minilm-multilingual`, Apollo LLM listed its three models in the configured order,
and the key was not in the log. Sign-in and hosted mode need the deployment.
