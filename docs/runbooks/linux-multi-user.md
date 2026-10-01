# Linux multi-user deployment

This is an operator installation and acceptance procedure. Routine development
uses `.dev` or `.test` storage. Do not run it against installed production data.
Use [the manual cutover procedure](storage-cutover.md) with copies first.

## Host and image

Use Linux 5.6 or later with a dedicated nonroot `wordflow` service account, cgroup v2, systemd and a
rootless Docker daemon owned by that account. Provision subordinate UID/GID
ranges, `uidmap` and Docker's rootless extras following the
[official rootless installation guide](https://docs.docker.com/engine/security/rootless/).
Enable linger for the service account. Configure the Docker user service with
`Delegate=cpu cpuset io memory pids` and restart it. Follow Docker's
[resource-limit troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/)
if any controller is absent. Do not substitute rootful Docker.

Build and audit the Linux server package using the normal package workflow.
The image context is an extracted package containing `wordflow-server` and
`licenses/`; the binary embeds the tested frontend. For a local image:

```sh
docker build --build-arg WORDFLOW_VERSION=8.0.0 \
  -f deploy/linux/Dockerfile -t wordflow-worker:8.0.0 <extracted-package>
docker image inspect wordflow-worker:8.0.0 --format '{{.Id}}'
```

Set the resulting immutable image ID in deployment configuration. The gateway
also resolves and validates it at startup; the image version label and worker
readiness version must match the gateway. Publishing the image is a separate
operator action. Container root maps to the dedicated rootless host account,
allowing its user directory to be mounted without granting host root privileges.

## Gateway configuration and authentication

Install the binary and `deploy/linux/install-egress.py` beneath `/opt/wordflow/`.
Create `/srv/wordflow/` owned by the service account with mode 0700. Keep
`/etc/wordflow/gateway.env` root-owned, readable only by root and the service group.
Supply the following values using actual registered client credentials:

```text
DATA_DIR=/srv/wordflow
DOCKER_HOST=unix:///run/user/<service-uid>/docker.sock
WORDFLOW_PUBLIC_URL=https://wordflow.example/wordflow/
WORDFLOW_PUBLIC_BASE_PATH=/wordflow/
WORDFLOW_WORKER_IMAGE=sha256:<verified-image-id>
WORDFLOW_WORKER_CPUS=2
WORDFLOW_WORKER_MEMORY_BYTES=4294967296
WORDFLOW_WORKER_PIDS=256
WORDFLOW_MAX_WORKERS=20
WORDFLOW_GOOGLE_CLIENT_ID=<registered-id>
WORDFLOW_GOOGLE_CLIENT_SECRET=<registered-secret>
WORDFLOW_CILOGON_CLIENT_ID=<registered-id>
WORDFLOW_CILOGON_CLIENT_SECRET=<registered-secret>
```

Both providers are required. Register these exact callbacks, retaining the
configured public prefix:

- `https://wordflow.example/wordflow/api/auth/google/callback`
- `https://wordflow.example/wordflow/api/auth/cilogon/callback`

Use confidential OIDC clients with Authorization Code and PKCE, with `openid`
and `profile` and `email` scopes. Follow [Google's OIDC guide](https://developers.google.com/identity/openid-connect/openid-connect)
and [CILogon's registration guide](https://www.cilogon.org/oidc).
Name and email are optional; accounts use issuer and subject. Accounts with the
same email are not merged. Authentication state is `DATA_DIR/.system/auth.sqlite3`,
never mounted into workers. Sessions have a 24-hour absolute lifetime; login
transactions are single use and expire after ten minutes. Logout revokes only
the presented device session. There is no account administration interface.
Provider signing keys refresh at login completion. Authenticated response streams
end on session expiry or revocation, and other windows of the signed-out browser
clear their active account state. Accepted worker tasks retain their runtime owner.

Terminate HTTPS at the reverse proxy. Preserve the browser Origin and cookies,
strip only the public path prefix, and stream uploads, Arrow, downloads and SSE
without response buffering or short SSE timeouts. Forward to the gateway's
loopback listener. The public URL path must exactly match the base path, including
the trailing slash. Cookies are Secure, HttpOnly for sessions, and SameSite=Lax.
Mutations require the exact public Origin and the session-bound CSRF header.
Do not expose worker sockets or ports through the proxy.

## Network policy and service lifecycle

Install `deploy/linux/wordflow-egress.service` and `wordflow.service` in
`/etc/systemd/system/`. Configure `/etc/wordflow/egress.env`, root-owned and
non-writable by the service account, for example:

```text
WORDFLOW_DNS_ARGS=--dns 192.0.2.53
```

Replace the example with the host's actual resolver IP. Additional exact
`--allow-https <IP>` arguments permit required internal providers on port 443.
Avoid network-wide exceptions. The installer replaces only the `inet wordflow`
nftables table. Its root-owned `/run/wordflow/egress.json` receipt is recreated at
boot before the gateway starts. Stop existing workers before installing or
changing policy, then restart and repeat acceptance. The gateway rejects an
unprotected receipt or an incorrect service UID.

Install `nftables` and `iproute2` for the operator policy installer. The policy
allows established replies, DNS to specified resolvers and public HTTPS. It also
discovers host interface addresses and rejects worker connections to them. It rejects other service-UID traffic, including private, loopback,
link-local and metadata destinations. Each worker has its own Docker bridge
with inter-container communication disabled; this closes cross-worker paths
inside the rootless daemon that do not traverse the host UID firewall. Validate
this against the actual rootless network driver on the deployment host.

Enable and start the two system services after the rootless Docker user service
is healthy. Workers start on demand. Each receives only its own UUID directory
at `/wordflow`, a read-only image, private `/tmp` and `/run`, no host home or Docker
socket, dropped capabilities, no-new-privileges and default seccomp. No ports are
published. The gateway resolves each socket beneath the user root using
`openat2` without following symlinks and connects through a pinned socket inode.
Worker-writable paths cannot redirect gateway traffic into another user's socket.
Gateway startup checks cgroup v2 and systemd; worker admission reads
actual `memory.max`, `pids.max` and `cpu.max`, validates the mounted configuration
and probes protected network addresses from inside the container.

Gateway restart can adopt matching healthy containers. Shutdown sends SIGTERM
and waits for worker exit and database/task cleanup without a forced-kill timer.
There is no idle eviction. The active-worker limit counts running containers,
including containers adopted after gateway restart. Stop a worker with SIGTERM and `docker wait`
before removing it; retain its user storage. A restarted worker gets new transient
project IDs. Browsers show a reopen state and saved `.wfpj` files remain available.

## Acceptance before production cutover

Run the package checks and the opt-in real-container test on this dedicated host:

```sh
WORDFLOW_MAX_WORKERS=2 cargo test -p wordflow-server --test linux_workers --locked -- --ignored
```

Set the worker image, limits, `DOCKER_HOST` and installed egress policy before
running it. This test creates two temporary user roots and cleans up only its own
containers and networks. It covers user files/preferences/projects and real mount,
socket, resource-limit and network probes. Run live Google and CILogon sign-in
using separate fresh browser profiles: verify reload and logout/login persistence,
account separation, callback replay/expiry rejection, and exact-Origin/CSRF
rejection. Fixture OIDC tests complement these live checks.

Record positive DNS/public HTTPS and negative metadata/private-network results.
Place a temporary listener on a protected host address and port 443, confirm it
is reachable from an unrestricted probe, then confirm neither worker can reach
it. Also attempt connections to the other worker's bridge IP. A connection failure
to an address with no listening service is insufficient evidence by itself.
Confirm worker attempts to read another UUID root, `.system`, the host home,
Docker socket and gateway socket fail. Check that persisted metadata, project
files, logs and request/cache keys contain no test provider secret. Exercise cold
and warm model caches in each account and graceful shutdown with an accepted task.

Keep production acceptance in a separate OS account or VM. Record actual Linux,
macOS and Windows package results; do not infer platform acceptance from compilation.
The architecture and exact storage contracts are documented in
[server ownership](../architecture/backend/server.md) and
[application storage](../reference/application-storage.md).
