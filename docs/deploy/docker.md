# Server image

`deploy/docker/Dockerfile` builds a hosted Wordflow for linux/amd64:
python:3.14-slim, tini, the Wordflow wheel, and the models Wordflow otherwise
downloads on first use (the spaCy model for Quotation, the topic embedder and
the BERT tokenizer). Nothing secret is in the image.

Issue #411.

## Build

The **Server image** workflow (`.github/workflows/server-image.yml`) runs only
when started by hand, from any branch or tag:

```bash
gh workflow run server-image.yml --repo Australian-Text-Analytics-Platform/ldaca-wordflow \
  --ref v0.7.15 -f local_version=apollo.1
```

- `local_version` (optional) adds a label to the version, e.g. `apollo.1`
  gives `0.7.15+apollo.1`, shown by `/health/ready`.
- `image` (optional) is the GHCR name; default
  `ghcr.io/australian-text-analytics-platform/ldaca-wordflow-server`.

It pushes two tags: the version (with `-` for `+`, e.g. `0.7.15-apollo.1`)
and `sha-<commit>`. Deploy by one of these, not by `latest`, so a rollback is
one tag change. New packages on GHCR are private; give the cluster a read-only
token (`read:packages`) to pull.

To build it yourself (Node 24 with corepack, uv, Docker):

```bash
corepack enable && pnpm install --frozen-lockfile
pnpm deploy_frontend_to_backend
(cd backend && uv build --no-sources --wheel --out-dir ../dist)
docker build --platform linux/amd64 -f deploy/docker/Dockerfile -t ldaca-wordflow-server:local .
```

## Run

Mount a persistent volume at `/data` (`DATA_ROOT=/data`) and pass the settings
and secrets as environment variables:

```bash
docker run --rm -p 8001:8001 -v wordflow-data:/data \
  --env-file app.env --env-file secrets.env \
  ghcr.io/australian-text-analytics-platform/ldaca-wordflow-server:<tag>
```

The default command runs `ldaca-wordflow --multi-user --host 0.0.0.0 --port 8001`.
Behind a [sign-in proxy](auth-proxy.md), run it on loopback instead, for example
`ldaca-wordflow --multi-user --host 127.0.0.1 --port 8080`.

- Run exactly one container per data folder: the Analysis queue and the
  [server AI providers'](server-ai-providers.md) per-person limits live in the
  process.
- Terminate TLS at the ingress, keep the Host header and scheme, use long read
  timeouts and no buffering for `/api/events` (server-sent events).
- Stop with SIGTERM and allow about 30 s. tini passes the signal to the backend
  only, which stops its Analysis workers and records them as interrupted.
- Set `UPDATE_CHECK_ENABLED=false` if people shouldn't be told about public
  releases this deployment doesn't follow.

The rest of the configuration is as in [Hosted deployment](../runbooks/hosted-deployment.md).
