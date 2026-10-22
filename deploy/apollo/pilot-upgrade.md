# Upgrade the Apollo pilot to Wordflow 0.7.16 rc.1 (the standard release image)

For the Claude session that runs Wordflow on Apollo. Issue: ldaca-wordflow #420.
Chao, 2026-10-22: upgrade the running `pilot` workspace (project `wordflow2026`,
https://wordflow2026-pilot.gpu.sydney.edu.au) to the 0.7.16 rc.1 image, with
Apollo's configuration, rather than starting a second workspace.

## What changes

| | Now (0.7.15+apollo.1) | After (0.7.16 rc.1) |
|---|---|---|
| Image | `python:3.14-slim` running `release/start.sh` (installs a wheel from the volume) | `ghcr.io/australian-text-analytics-platform/ldaca-wordflow-server:0.7.16-pre-rc.1` (private; pulled with Chao's Run:ai credential `ghcr-read`) |
| Settings | `release/wordflow.env`, `CILOGON_*` names | `-e` flags below, `OIDC_*` names |
| Providers file | `release/ai-providers.yaml` (Apollo LLM only) | `release/server-ai-providers.yaml` (Apollo LLM and Apollo GPU) |
| Data, caches, address, resources | unchanged: `hosted-data`, `cache/`, the pilot host, 8 CPU and 64 GB | the same |

The image holds no keys and no Apollo settings (commit da645395). Everything
for the 0.7.15 pilot stays on the volume untouched, so rolling back is one
resubmit.

## Where Apollo's configuration comes from

- Repository `Australian-Text-Analytics-Platform/ldaca-wordflow`, branch
  `deploy/apollo`, folder `deploy/apollo/` (locally `~/Workspace/wordflow-apollo`):
  - `server-ai-providers.yaml`: Apollo LLM (in-cluster gateway, slug `apollo`,
    configuration id `3c4d70f7-…` as before, models ornith-1.5-35b, gemma-4-26b,
    qwen3.8-27b, default ornith-1.5-35b, one request per person) and Apollo GPU
    (`minilm-en`, `minilm-multilingual`, ticked by default in Topic Modelling).
  - `app.env.example`: the non-secret settings; for the pilot they are the `-e`
    flags in step 5, with the pilot's host and its cache folders.
- Secrets: Chao's Run:ai user credentials `wordflow-oidc` (key
  `CILOGON_CLIENT_SECRET`, passed in as `OIDC_CLIENT_SECRET`) and
  `wordflow-apollo-llm` (key `APOLLO_LLM_API_KEY`). Never in a file.

## Rules

- Never print, log or paste the gateway key or the OIDC client secret.
- Do steps 2 to 4 before deleting the pilot (step 5): they need the running pod.
- Tell Chao before step 5: the pilot is down for a few minutes. Ask him before
  deleting backups or the old files.

## Steps

1. **Pull credential.** Check Chao's Run:ai user credential `ghcr-read` exists
   (Docker registry `https://ghcr.io`). If not, stop and ask him.

2. **Save the current workspace definition** (no secrets in it, only credential
   names), for the rollback:

   ```bash
   runai workspace describe pilot -p wordflow2026 -o json > ~/pilot-0.7.15-apollo.1.json
   ```

3. **Back up the data** from the running pod (the user database with SQLite's
   own backup, so it is consistent while the pilot runs):

   ```bash
   runai workspace exec pilot -p wordflow2026 -- python3 -c "
   import os, shutil, sqlite3
   root = '/scratch/wordflow2026/pilot'
   src, dst = root + '/hosted-data', root + '/hosted-data.bak-before-0.7.16-rc.1'
   assert not os.path.exists(dst), 'backup already there'
   os.makedirs(dst)
   for name in ('users', 'workspaces'):
       shutil.copytree(os.path.join(src, name), os.path.join(dst, name), symlinks=True)
   a = sqlite3.connect(src + '/deployment.sqlite3'); b = sqlite3.connect(dst + '/deployment.sqlite3')
   a.backup(b); b.close(); a.close()
   print('backed up')"
   ```

4. **Put the new providers file on the volume** beside the old one (which the
   rollback still needs):

   ```bash
   git -C ~/Workspace/wordflow-apollo pull --ff-only
   Y=$(base64 < ~/Workspace/wordflow-apollo/deploy/apollo/server-ai-providers.yaml | tr -d '\n')
   runai workspace exec pilot -p wordflow2026 -- python3 -c "import base64; open('/scratch/wordflow2026/pilot/release/server-ai-providers.yaml','wb').write(base64.b64decode('$Y')); print('written')"
   ```

5. **Replace the pilot** (same name, so the same address; tell Chao first):

   ```bash
   runai workspace delete pilot -p wordflow2026
   # wait until "runai workspace list -p wordflow2026" no longer shows pilot
   IMAGE=ghcr.io/australian-text-analytics-platform/ldaca-wordflow-server:0.7.16-pre-rc.1
   HOST=wordflow2026-pilot.gpu.sydney.edu.au
   P=/scratch/wordflow2026/pilot
   runai workspace submit pilot -p wordflow2026 -i "$IMAGE" --image-pull-policy Always \
     --image-pull-my-credentials type=dockerRegistry,name=ghcr-read \
     --existing-pvc claimname=exa-pvc-wordflow2026,path=/scratch/wordflow2026 \
     --external-url container=8080 \
     --cpu-core-request 8 --cpu-core-limit 8 --cpu-memory-request 64G --cpu-memory-limit 64G \
     --run-as-uid 0 --run-as-gid 0 \
     -e MULTI_USER=true \
     -e OIDC_ISSUER=https://gpu.sydney.edu.au/auth/realms/runai -e OIDC_CLIENT_ID=wordflow \
     -e OIDC_REDIRECT_URI=https://$HOST/api/auth/cilogon/callback \
     -e 'OIDC_SCOPES=["openid","email","profile"]' -e SESSION_COOKIE_SECURE=true \
     -e "TRUSTED_HOSTS=[\"$HOST\",\"localhost\",\"127.0.0.1\"]" \
     -e "CORS_ALLOWED_ORIGINS=[\"https://$HOST\"]" -e UPDATE_CHECK_ENABLED=false \
     -e DATA_ROOT=$P/hosted-data \
     -e XDG_CACHE_HOME=$P/cache -e HF_HOME=$P/cache/huggingface -e LINDERA_DICT_PATH=$P/cache/lindera \
     -e POLARS_MAX_THREADS=8 \
     -e SERVER_AI_PROVIDERS_FILE=$P/release/server-ai-providers.yaml \
     --env-my-credentials type=genericSecret,name=OIDC_CLIENT_SECRET,credential-name=wordflow-oidc,key=CILOGON_CLIENT_SECRET \
     --env-my-credentials type=genericSecret,name=APOLLO_LLM_API_KEY,credential-name=wordflow-apollo-llm,key=APOLLO_LLM_API_KEY \
     --command -- ldaca-wordflow --multi-user --host 127.0.0.1 --port 8080
   ```

   - Root, because the volume's folders are root-owned (as the pilot runs now).
     If Run:ai refuses `--run-as-uid 0`, drop both run-as flags and report it.
   - `runai workspace describe pilot -p wordflow2026` must show the external URL
     `https://wordflow2026-pilot.gpu.sydney.edu.au`. If it differs, stop and
     tell Chao (the sign-in client accepts only that host).
   - If the image can't be pulled or the workspace doesn't start, roll back
     (below) and report.

6. **Check it started:** `runai workspace logs pilot -p wordflow2026` shows the
   backend on 127.0.0.1:8080 with no setting errors. Then:

   ```bash
   runai workspace port-forward pilot -p wordflow2026 --port 18080:8080 &
   curl -fsS http://localhost:18080/health/ready      # status ready, version 0.7.16rc0+rc.1
   runai workspace exec pilot -p wordflow2026 -- python -c "import os, json, urllib.request; r = urllib.request.urlopen(urllib.request.Request('http://iw-gateway-0-clusterip.runai-genai.svc.cluster.local:4000/v1/models', headers={'Authorization': 'Bearer ' + os.environ['APOLLO_LLM_API_KEY']}), timeout=20); print(r.status, sorted(m['id'] for m in json.load(r)['data']))"
   # expect 200 and the five model names, no key printed
   ```

7. **Check in the browser** (issue #420), at https://wordflow2026-pilot.gpu.sydney.edu.au:
   1. Sign in with SSO goes through the Run:ai realm and back; existing accounts,
      Projects and Data Blocks are there.
   2. Settings → Servers: Apollo LLM under Generative AI, Apollo GPU under Topic
      Modelling, both read-only.
   3. Annotation lists only ornith-1.5-35b, gemma-4-26b and qwen3.8-27b; a Run
      records the person in LiteLLM's `user`; one request at a time per person.
   4. Topic Modelling: Remote GPU at the row's right end, ticked in a new tab; a
      large run embeds on the gateway (progress per batch in Tasks); unticked, it
      reads the text on the server. Max tokens is a 32/64/128/256 dropdown.
   5. The key and client secret appear nowhere: browser network tab, log, `/data`.

8. **Report** to Chao and comment on issue #420: the health output, each check,
   and anything that failed (log lines, no secrets).

## Roll back

Resubmit the 0.7.15 pilot exactly as it was (its start script, env file, wheel
and old providers file are still on the volume):

```bash
runai workspace delete pilot -p wordflow2026
runai workspace submit pilot -p wordflow2026 -i python:3.14-slim \
  --existing-pvc claimname=exa-pvc-wordflow2026,path=/scratch/wordflow2026 \
  --external-url container=8080 \
  --cpu-core-request 8 --cpu-core-limit 8 --cpu-memory-request 64G --cpu-memory-limit 64G \
  --env-my-credentials type=genericSecret,name=CILOGON_CLIENT_SECRET,credential-name=wordflow-oidc,key=CILOGON_CLIENT_SECRET \
  --env-my-credentials type=genericSecret,name=APOLLO_LLM_API_KEY,credential-name=wordflow-apollo-llm,key=APOLLO_LLM_API_KEY \
  --command -- bash /scratch/wordflow2026/pilot/release/start.sh
```

Compare with `~/pilot-0.7.15-apollo.1.json` if anything differs. 0.7.15 opens
data written by 0.7.16, except Topic Modelling runs that used the Multilingual
model or Remote GPU, which show as unavailable. Restore
`hosted-data.bak-before-0.7.16-rc.1` only if Chao asks (stop the pilot first).

## Clean up (only when Chao says)

The earlier test copy `pilot/hosted-data-rc1` and `pilot/release-rc1/` are no
longer needed. The backup and the 0.7.15 files stay until 0.7.16 is released.
