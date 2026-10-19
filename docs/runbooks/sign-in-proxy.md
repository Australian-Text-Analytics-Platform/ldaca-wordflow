# Sign-in proxy

A hosted Wordflow can trust a sign-in proxy in front of it instead of running
its own Google or OIDC sign-in. The proxy signs people in and forwards each
request with their identity in HTTP headers, in the style of
[oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/). Run:ai's login
sidecar on the University of Sydney's Apollo cluster is one such proxy.

Issue #411. For how this compares with Google and OIDC sign-in, and when to
choose it, see [Sign-in](hosted-deployment.md#sign-in) in the hosted runbook.
The other hosted settings (`TRUSTED_HOSTS`, `DATA_ROOT`, analysis capacity)
are set as described there.

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `AUTH_PROXY` | yes | `true` turns the mode on. |
| `AUTH_PROXY_PUBLIC_URL` | yes | The address people use, as an https origin, e.g. `https://wordflow2026-pilot.gpu.sydney.edu.au`. Its host must be in `TRUSTED_HOSTS` and the origin in `CORS_ALLOWED_ORIGINS`. |
| `AUTH_PROXY_HEADER_USER` | no | Header with the stable user id. Default `X-Forwarded-User`. |
| `AUTH_PROXY_HEADER_EMAIL` | no | Header with the email address. Default `X-Forwarded-Email`. |
| `AUTH_PROXY_HEADER_NAME` | no | Header with the display name. Default `X-Forwarded-Preferred-Username`. |
| `AUTH_PROXY_SIGN_OUT_PATH` | no | The proxy's sign-out path. Default `/oauth2/sign_out`. |
| `AUTH_PROXY_ISSUER` | no | The account namespace for these sign-ins. Default `auth-proxy:<public host>`. Keep it unchanged once people have signed in: a new value means new, empty accounts. |
| `AUTH_PROXY_LABEL` | no | How the sign-in page names the proxy, e.g. `Run:ai`. |

The mode also needs `MULTI_USER=true` and `SESSION_COOKIE_SECURE=true`, and
can't be combined with Google or CILogon settings. Start-up stops and names the
setting if any of this is wrong.

**Run Wordflow on loopback only**, on the port the proxy forwards to, for
example `ldaca-wordflow --multi-user --host 127.0.0.1 --port 8080`. Start-up
refuses any other address (`0.0.0.0`, `localhost`, a pod or host IP), and the
server runs without proxy-header rewriting. Nothing else on the host or in the
pod may be able to reach that port, because anything there could send identity
headers.

## How it works

- Identity headers are read only when the connection comes from a loopback
  address (the proxy). `X-Forwarded-For` is never used for trust.
- The user id and the email are required. A request missing either gets a
  "Sign in through …" page (or a 401 `auth_proxy_sign_in_required` from the
  API), and no account is created. A request carrying an identity header twice
  is refused.
- Every cookie except Wordflow's own session cookie, and any `Authorization`
  header, is removed before routing, so the proxy's credentials never reach
  Wordflow's code or logs.
- The identity becomes an ordinary Wordflow session under the issuer
  `AUTH_PROXY_ISSUER`. The session is reused while it belongs to the same user
  id; a different user id (someone switched accounts in that browser) revokes
  the old session and starts a new one. CSRF, Origin checks, event streams and
  a server AI provider's `user` field work as in any hosted deployment.
- **Re-created accounts:** a known email arriving with a new user id is
  re-linked to the existing account if that account has no other sign-in
  method, and a warning with both ids is logged. This assumes an email address
  is never given to a different person. An email already used with another
  sign-in method is refused.
- **Sign out:** Wordflow ends its session, then sends the browser to the
  proxy's sign-out address (`sign_out_url` in `GET /api/session`), so the
  proxy's session ends too. The identity provider's own session may remain, so
  the person can be signed straight back in.
- **Who can get in** is decided by the proxy.

## Run:ai on Apollo

```ini
MULTI_USER=true
SESSION_COOKIE_SECURE=true
AUTH_PROXY=true
AUTH_PROXY_PUBLIC_URL=https://wordflow2026-pilot.gpu.sydney.edu.au
AUTH_PROXY_LABEL=Run:ai
# The namespace of the accounts made by the earlier deploy/apollo build:
AUTH_PROXY_ISSUER=runai-proxy:wordflow2026-pilot.gpu.sydney.edu.au
TRUSTED_HOSTS=["wordflow2026-pilot.gpu.sydney.edu.au"]
CORS_ALLOWED_ORIGINS=["https://wordflow2026-pilot.gpu.sydney.edu.au"]
```

Start Wordflow with `--host 127.0.0.1 --port 8080` and expose it with
`--external-url container=8080`; the sidecar then signs people in and forwards
to that port. The full Apollo setup is in
[Apollo deployment](apollo-deployment.md). Don't put a relay or another container in the
pod. Re-check after every Run:ai upgrade, because the sidecar's behaviour isn't
documented by Run:ai:

1. a header echo shows the identity headers above;
2. forged identity headers are replaced for signed-in people, and requests
   without a session are sent to the sign-in;
3. the app port can't be reached from another pod;
4. the platform's own checks on the sidecar's session store and secrets still
   pass (with the cluster admins).
