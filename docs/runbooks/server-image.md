# Server image

`deploy/docker/Dockerfile` builds a hosted Wordflow for linux/amd64:
python:3.14-slim, tini, the Wordflow wheel, and the models Wordflow otherwise
downloads on first use (the spaCy model for Quotation, the topic embedder and
the BERT tokenizer). Nothing secret is in the image.

Issue #411.

## Build

The **Server image** workflow (`.github/workflows/server-image.yml`) never
runs on a branch push and is not part of a release. Start it in one of two ways.

**Push a tag** `server-image/v<version>-<label>` on the commit to build. The
version must match the code (a `-pre` version counts), and the label is added
to it. For example, on `v0.7` at 0.7.16-pre:

```bash
git tag server-image/v0.7.16-rc.1 v0.7
git push origin server-image/v0.7.16-rc.1
```

builds `0.7.16-pre+rc.1` and pushes the image tag `0.7.16-pre-rc.1`.

**Or start it by hand**, with `--ref` naming the branch or tag to build:

```bash
gh workflow run server-image.yml --repo Australian-Text-Analytics-Platform/ldaca-wordflow \
  --ref v0.7 -f local_version=site.1
```

GitHub starts a workflow by hand only once it is known, that is on the
default branch (`main`) or after it has run from a tag. Until then the command
fails with "workflow server-image.yml not found on the default branch"; push a
tag instead.

- `local_version` (optional) adds a label to the version, e.g. `site.1`
  gives `0.7.15+site.1`, shown by `/health/ready`.
- `image` (optional) is the GHCR name; default
  `ghcr.io/australian-text-analytics-platform/ldaca-wordflow-server`.

It pushes two tags: the version (with `-` for `+`, e.g. `0.7.15-site.1`)
and `sha-<commit>`. Deploy by one of these, not by `latest`, so a rollback is
one tag change. After the first push, check the package's visibility under
the organisation's **Packages** on GitHub: if it is private, give the cluster
a read-only token (`read:packages`) to pull.

The image installs the wheel's dependencies at exactly the versions in
`backend/uv.lock`, the ones CI tested: `deploy/docker/lock-constraints.sh`
exports them to `dist/constraints.txt`, and the build fails if anything
installed differs from it.

To build it yourself (Node 24 with corepack, uv, Docker), from a checkout of
the ref with its submodules:

```bash
corepack enable && pnpm install --frozen-lockfile
pnpm deploy_frontend_to_backend
(cd backend && uv build --no-sources --wheel --out-dir ../dist)
deploy/docker/lock-constraints.sh dist/constraints.txt
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
Behind a reverse proxy on the same host or pod, run it on loopback instead, for example
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

The rest of the configuration is as in [Hosted deployment](hosted-deployment.md).

## Running as another user

The image runs as its own user, `wordflow` (uid 10001, gid 999), and the
image's `/data` belongs to that user. A cluster can run it under any uid and
gid instead, including one with no entry in `/etc/passwd`
(`docker run --user 54321:54321`, or the platform's equivalent).

- **Nothing depends on the user.** `HOME` is `/tmp`, and the models fetched at
  build time under `/opt/wordflow` are readable by every uid and written by
  none. New downloads, such as Lindera dictionaries or another tokeniser, go
  to `<DATA_ROOT>/.cache/runtime/`, or to the temp folder when the data folder
  can't take them. The log says once where they went.
- **The data folder must stay with one uid.** Wordflow keeps each person's
  files private (files 0600, folders 0700), readable only by the account that
  wrote them; its shared database and top-level folders follow the process
  umask. Run every deployment of the same data as the same uid. If
  the data folder holds Wordflow data from another uid, Wordflow stops at
  start-up and names both uids. Nothing is changed or re-created. To move
  data to another account, copy it and change its owner first.
- **An unusable data folder stops the server.** If Wordflow can't create,
  write or read back `DATA_ROOT`, it logs one line with the path, its uid and
  gid, and the error, then exits with status 1 before it listens, so the
  orchestrator sees a failed start.
- **Group access.** A supplementary group can grant access to the data
  folder, for example a `root:<group>` folder with mode 2770 and
  `--group-add <group>`. Wordflow's own files stay private to its uid inside
  it.

### Run:ai and shared cluster storage

- Run:ai doesn't run containers as root: `--run-as-uid 0` is dropped.
- `--run-as-user` runs the container as the submitting person's cluster
  account: their uid, their primary group and all their groups.
- Storage that resolves group membership on the server, such as Lustre, only
  grants a uid the cluster knows. A uid it doesn't know, such as the image's
  10001, gets no group access even with supplementary groups. Run the image as
  a cluster account (a service account for a deployment, or a person's own for
  a test), and keep that account for the life of the data.
- Don't rely on group 0 (the OpenShift pattern): on Run:ai the gid is the
  account's primary group.

