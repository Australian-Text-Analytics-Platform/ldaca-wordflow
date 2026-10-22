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
