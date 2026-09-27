#!/usr/bin/env bash
# Exercise an uninstrumented macOS bundle, including on-demand ICU loading.
# Default includes HTTPS scans; --offline runs only deterministic local checks.
# Bounded waits below are test limits, not production shutdown behavior.
set -Eeuo pipefail
app_path="${1:?Pass the .app path}"
mode="${2:---online}"
if [[ "$mode" != --offline && "$mode" != --online ]]; then
  echo "Expected --offline or --online" >&2; exit 2
fi
identifier=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app_path/Contents/Info.plist")
[[ "$identifier" == au.edu.ldaca.wordflow ]] || { echo "Expected production identity, got $identifier" >&2; exit 1; }
codesign --verify --deep --strict "$app_path"
node --input-type=module - "$app_path" <<'JS'
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const contents = join(process.argv[2], 'Contents');
const icu = join(contents, 'Resources/resources/icu');
if (existsSync(join(icu, 'icu.duckdb_extension'))) throw new Error('Optional ICU must not be bundled');
if (!existsSync(join(contents, 'PlugIns/WordflowPreview.appex'))) throw new Error('Missing Quick Look extension');
console.log('Verifying production-identity bundle with optional assets excluded');
JS
log_path="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/wordflow-signed-scan.log"
"$app_path/Contents/MacOS/ldaca-wordflow" >"$log_path" 2>&1 &
app_pid=$!
trap 'kill -TERM "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true' EXIT
base=""
for ((attempt=0; attempt<60; attempt++)); do
  kill -0 "$app_pid" 2>/dev/null || {
    echo "Application exited before readiness. Close other production-identity instances before testing." >&2
    cat "$log_path"; exit 1
  }
  port="$(lsof -nP -a -p "$app_pid" -iTCP -sTCP:LISTEN -Fn | sed -n 's/^n127\.0\.0\.1://p' | head -1 || true)"
  if [ -n "$port" ] && curl --silent --fail "http://127.0.0.1:$port/health/ready" >/dev/null; then
    base="http://127.0.0.1:$port"
    break
  fi
  sleep 1
done
if [ -z "$base" ]; then echo "Application did not become ready within 60 seconds." >&2; cat "$log_path"; exit 1; fi
node --input-type=module - "$base" "${log_path}.graph.json" "$mode" <<'JS'
import { writeFileSync } from 'node:fs';
const base = process.argv[2];
async function request(path, body) {
  const response = await fetch(`${base}/api/project${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`${path}: ${await response.text()}`);
  return response.json();
}
// First use downloads the signed extension; subsequent launches reuse its cache.
// --offline requires an already populated cache.
const zones = await request('/timezones');
if (!zones.includes('Australia/Sydney') || !zones.includes('UTC')) throw new Error('Incomplete timezone catalogue');
await request('/sql', {
  mode: 'read', response: 'command', statements: [{ sql: `SELECT CASE
    WHEN timezone('Australia/Sydney', TIMESTAMPTZ '2020-10-03 16:00:00+00') = TIMESTAMP '2020-10-04 03:00:00'
    THEN 1 ELSE error('Cached ICU daylight-saving conversion failed') END` }],
});
console.log('Cached ICU catalogue and daylight-saving conversion passed');
if (process.argv[4] === '--offline') process.exit(0);
const catalogue = await request('/samples');
const collection = catalogue.collections.find(value => value.id === 'ADO/twitter');
if (!collection?.files.length) throw new Error('Missing ADO sample files');
const imported = await request('/samples/import', {
  file_paths: collection.files.map(file => file.path).filter(path => path.endsWith('.parquet')), as_views: true,
});
const graph = await request('/graph');
writeFileSync(process.argv[3], JSON.stringify(graph));
if (graph.nodes.length !== imported.table_names.length || graph.nodes.some(node => node.kind !== 'view' || node.diagnostic || node.column_count === null)) {
  throw new Error(`Signed HTTPS scan failed: ${JSON.stringify(graph)}`);
}
// Graph inspection is metadata-only. Explicitly scan remote values to exercise httpfs.
await request('/sql', {
  mode: 'read', response: 'command',
  statements: imported.table_names.map(name => ({
    sql: `SELECT * FROM data."${name.replaceAll('"', '""')}" LIMIT 1`,
  })),
});
JS
curl --fail-with-body --max-time 60 -H 'Content-Type: application/json' -d '{}' "$base/api/project/close"
