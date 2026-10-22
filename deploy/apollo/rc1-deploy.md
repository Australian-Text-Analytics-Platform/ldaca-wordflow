# Deploy Wordflow 0.7.16 rc.1 on Apollo (test workspace `rc1`)

For the Claude session that runs Wordflow on Apollo. Issue: ldaca-wordflow #420.
Chao asked for this on 2026-10-22: see the general release run as an image on
Apollo with Apollo's configuration, before 0.7.16 is tagged.

## What is new

- Apollo now runs the **standard release image**, not an Apollo-only build. The
  old build is kept on branch `deploy/apollo-0.7.15-build`; this branch holds
  only Apollo's configuration (`deploy/apollo/`).
- Image: `ghcr.io/australian-text-analytics-platform/ldaca-wordflow-server:0.7.16-pre-rc.1`
  (commit da645395; also tagged `sha-da645395c9f396e444b5c914c17085b1ba3319dd`).
  It holds no keys and no Apollo settings.
- Settings use `OIDC_*` names (the `CILOGON_*` names still work). Apollo LLM and
  Apollo GPU (Topic Modelling's remote embeddings) come from
  `server-ai-providers.yaml`.

## Rules

- Don't touch the running `pilot` workspace or its data folder
  (`/scratch/wordflow2026/pilot/hosted-data`). rc1 runs on a copy.
- Never print, log or paste the gateway key or the OIDC client secret. They come
  from Chao's Run:ai credentials only.
- Ask Chao before deleting anything, and before replacing the pilot.

## Already prepared on the volume (2026-10-22)

- `/scratch/wordflow2026/pilot/hosted-data-rc1`: a copy of the pilot's data
  (143 MB; the user database copied with SQLite's backup).
- `/scratch/wordflow2026/pilot/release-rc1/server-ai-providers.yaml`: a copy of
  this folder's providers file (in-cluster gateway).

## Steps

1. **Image is public.** This must print 200 (Chao makes the package public):

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' "https://ghcr.io/token?scope=repository:australian-text-analytics-platform/ldaca-wordflow-server:pull"
   ```

   If it prints 401, stop and tell Chao.

2. **Submit** (project `wordflow2026`). Wordflow listens on 127.0.0.1:8080
   behind Run:ai's sign-in, like the pilot:

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

   - Run as root because the volume's folders are root-owned (the pilot runs as
     root too). If Run:ai refuses `--run-as-uid 0`, drop both run-as flags and
     report it.
   - `runai workspace describe rc1 -p wordflow2026` shows the external URL. If it
     isn't `https://wordflow2026-rc1.gpu.sydney.edu.au`, delete rc1 and submit
     again with `HOST` set to the real host.

3. **Wait until running**, then read the log (`runai workspace logs rc1 -p
   wordflow2026`). It must show the backend starting on 127.0.0.1:8080 with no
   setting errors. A wrong `OIDC_*` or providers file stops start-up and the log
   names the setting; secrets are never printed.

4. **Check through a port forward** (works without Wordflow's sign-in):

   ```bash
   runai workspace port-forward rc1 -p wordflow2026 --port 18080:8080 &
   curl -fsS http://localhost:18080/health/ready
   ```

   - Expect `status: ready` and version `0.7.16rc0+rc.1`.
   - From inside the pod, check the providers file loads:
     `runai workspace exec rc1 -p wordflow2026 -- python -c "from pathlib import Path; from ldaca_wordflow.server_ai.config import load_providers; p = load_providers(Path('/scratch/wordflow2026/pilot/release-rc1/server-ai-providers.yaml')); print([x.name for x in p.providers], [e.name for e in p.embedding_endpoints])"`
     should print `['Apollo LLM'] ['Apollo GPU']`.
   - And that the key reaches the gateway without showing it:
     `runai workspace exec rc1 -p wordflow2026 -- python -c "import os, json, urllib.request; r = urllib.request.urlopen(urllib.request.Request('http://iw-gateway-0-clusterip.runai-genai.svc.cluster.local:4000/v1/models', headers={'Authorization': 'Bearer ' + os.environ['APOLLO_LLM_API_KEY']}), timeout=20); print(r.status, sorted(m['id'] for m in json.load(r)['data']))"`

5. **Sign-in in the browser** needs the `wordflow` client in the Run:ai realm to
   accept `https://wordflow2026-rc1.gpu.sydney.edu.au/api/auth/cilogon/callback`.
   Until the realm admins add it, Wordflow's sign-in on rc1 fails with an invalid
   redirect. Ask Chao which he wants:
   - the admins add the redirect URI, then test rc1 in the browser; or
   - roll the pilot itself onto the image for the test (README, "Run:ai
     commands"), with `DATA_ROOT` on the copy and the pilot's host, and roll back
     afterwards by resubmitting the pilot's current command.

6. **Checks once signed in** (issue #420):
   1. Sign in with SSO goes through the Run:ai realm and back.
   2. Settings → Servers: Apollo LLM under Generative AI and Apollo GPU under
      Topic Modelling, both read-only.
   3. Annotation lists only ornith-1.5-35b, gemma-4-26b and qwen3.8-27b; a Run
      records the person in LiteLLM's `user`; one request at a time per person.
   4. Topic Modelling: Remote GPU at the right end, ticked in a new tab; a run on a
      large corpus embeds on the gateway (progress per batch in Tasks). Unticked,
      it reads the text on the server. Max tokens is a 32/64/128/256 dropdown.
   5. The key and client secret appear nowhere: browser network tab, log, `/data`.

7. **Report** to Chao and comment the results on #420: the external URL, the
   health output, each check, and anything that failed (with the log lines, no
   secrets).

## Clean up (only when Chao says)

```bash
runai workspace delete rc1 -p wordflow2026
```

The copy `hosted-data-rc1` and `release-rc1/` stay until Chao asks for them to go.
