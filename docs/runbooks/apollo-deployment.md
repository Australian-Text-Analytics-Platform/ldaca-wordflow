# Apollo deployment

How Wordflow runs on the University of Sydney's Apollo cluster, and how to move
it from the old `deploy/apollo` branch to a normal release. It combines a
[server image](server-image.md), the [sign-in proxy](sign-in-proxy.md) (Run:ai's
sidecar) and a [server AI provider](server-ai-providers.md) (Apollo LLM). The
general settings are in [Hosted deployment](hosted-deployment.md).

The pilot runs at https://wordflow2026-pilot.gpu.sydney.edu.au/ as one Run:ai
workload: one container, one replica, a persistent `/data` volume, Wordflow on
`127.0.0.1:8080`, and Run:ai's sign-in sidecar exposed with
`--external-url container=8080`.

## Moving from deploy/apollo

Until now Apollo ran the separate branch `deploy/apollo`. Its two Apollo-only
features are now general features of Wordflow 0.7.15 (issue #411):

- **Apollo LLM** is a [server AI provider](server-ai-providers.md), configured
  by a YAML file instead of `APOLLO_LLM_*` variables;
- **Run:ai sign-in** is the [sign-in proxy](sign-in-proxy.md) mode, configured by
  `AUTH_PROXY_*` instead of `APOLLO_AUTH` and `APOLLO_*`.

Apollo becomes a normal release plus its configuration. `deploy/apollo` is
retired once this is verified on Apollo. Don't build from it again.

### 1. Build the image

From `v0.7` (0.7.15-pre until 0.7.15 is released, then the `v0.7.15` tag):

```bash
gh workflow run server-image.yml --repo Australian-Text-Analytics-Platform/ldaca-wordflow \
  --ref v0.7 -f local_version=apollo.1
```

If GitHub answers "workflow server-image.yml not found on the default branch",
the workflow isn't on `main` yet: build the image locally as described in
[Server image](server-image.md) and push it to the registry Apollo pulls from.

The image is `ghcr.io/australian-text-analytics-platform/ldaca-wordflow-server`,
tagged with the version (for example `0.7.15-pre-apollo.1`, shown by
`/health/ready` as `0.7.15rc0+apollo.1`) and `sha-<commit>`.

### 2. Change the configuration

The secrets stay as they are: `APOLLO_LLM_API_KEY` keeps its name, because the
providers file refers to it.

**Apollo LLM**: put this file in the pod (for example from a ConfigMap) and
set `SERVER_AI_PROVIDERS_FILE` to its path. Copy the values from the current
`APOLLO_LLM_*` settings:

```yaml
providers:
  - slug: apollo
    name: Apollo LLM
    # Keeps saved Projects and tabs pointing at Apollo LLM:
    configuration_id: 3c4d70f7-4c43-5e66-9f39-6a4b478319bc
    base_url: <APOLLO_LLM_BASE_URL>
    api_key_env: APOLLO_LLM_API_KEY
    models: <APOLLO_LLM_MODELS, as a YAML list>          # optional
    default_model: <APOLLO_LLM_DEFAULT_MODEL>            # optional
    model_descriptions: <APOLLO_LLM_MODEL_DESCRIPTIONS>  # optional; else LiteLLM's model_info.description
    send_user: <APOLLO_LLM_USER_FIELD, default email>
    max_requests_per_user: 1
```

**Run:ai sign-in**: replace the `APOLLO_AUTH`/`APOLLO_*` variables:

| Before (deploy/apollo) | Now |
|---|---|
| `APOLLO_AUTH=runai_proxy` | `AUTH_PROXY=true` |
| `APOLLO_PUBLIC_URL` | `AUTH_PROXY_PUBLIC_URL` (same value) |
| `APOLLO_HEADER_USER` | `AUTH_PROXY_HEADER_USER` (only if it was set) |
| `APOLLO_HEADER_EMAIL` | `AUTH_PROXY_HEADER_EMAIL` (only if it was set) |
| `APOLLO_HEADER_USERNAME` | `AUTH_PROXY_HEADER_NAME` (only if it was set) |
| `APOLLO_SIGN_OUT_PATH` | `AUTH_PROXY_SIGN_OUT_PATH` (only if it was set) |
| (fixed) | `AUTH_PROXY_ISSUER=runai-proxy:wordflow2026-pilot.gpu.sydney.edu.au` (keeps existing accounts) |
| (fixed) | `AUTH_PROXY_LABEL=Run:ai` |

Remove the old `APOLLO_LLM_*` (except the key) and `APOLLO_*` variables; the
release ignores them. Everything else (`MULTI_USER`, `SESSION_COOKIE_SECURE`,
`TRUSTED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `DATA_ROOT`, `UPDATE_CHECK_ENABLED`)
stays.

Keep the command `ldaca-wordflow --multi-user --host 127.0.0.1 --port 8080`
with `--external-url container=8080`, and one replica on the same data volume.

### 3. Roll out and check

1. Note the image running now, for rollback.
2. Deploy the new image with the new configuration. `/health/ready` must
   report `ready` and the new version. A wrong providers file or a missing
   setting stops start-up and the log names it, never a key.
3. Check:
   - signing in through Run:ai lands in Wordflow with the same account as
     before (existing Projects are there);
   - **Settings → AI** lists Apollo LLM first, read-only, "Provided by this
     server"; a new Annotation tab selects it with the default model; the
     Model list shows the descriptions; **Requests at once** is 1 with its
     note;
   - an existing Annotation tab that used Apollo LLM still has it selected;
   - a Run's requests carry the person in LiteLLM's spend logs (`user`);
   - a second Run by the same person waits ("Waiting for your previous Apollo
     LLM run") while another person's Run starts;
   - signing out goes through the Run:ai sign-out;
   - the gateway key is not in the browser (network tab), the log, or `/data`.

### Rollback

Redeploy the previous `deploy/apollo` image with the previous configuration,
on the same `/data` volume. The data format is unchanged; accounts and Projects
work in both.

### Report back

Report to Chao: the image tag, the `/health/ready` output and each check above.
File problems as GitHub issues on `ldaca-wordflow` with the label `v0.7.x`.
