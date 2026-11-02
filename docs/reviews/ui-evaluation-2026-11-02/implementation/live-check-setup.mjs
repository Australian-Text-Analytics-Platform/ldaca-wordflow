// Evaluation helper, not part of the test suite.
// Creates a "Claude UI check" Project holding the synthetic fixture as one
// Data Block, through the running app's own API session, and saves the session
// to <work-dir>/state.json for live-check.mjs. Run only against an isolated
// DATA_ROOT (see ../EVIDENCE.md, "Reproduce Manually").
// Needs playwright-core 1.63.0 with its cached WebKit and Chromium builds.
// Usage: node live-check-setup.mjs <work-dir> <path-to-synthetic-discourse.csv>
// <work-dir> must contain a shots/ folder.
import { webkit } from 'playwright-core';
import fs from 'node:fs';
const S = process.argv[2];
const CSV = process.argv[3];
const API = 'http://127.0.0.1:8101';
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { Origin: 'http://127.0.0.1:3100' } });
const page = await ctx.newPage();
let csrf = null;
page.on('response', async (res) => {
  try { const j = await res.json(); if (j && typeof j.csrf_token === 'string') csrf = j.csrf_token; } catch {}
});
await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
console.log('csrf', Boolean(csrf));
const base = ctx.request;
const h = (extra = {}) => ({ 'X-CSRF-Token': csrf, ...extra });
const r = { post: (url, opts = {}) => base.post(url, { ...opts, headers: h(opts.headers) }), put: (url, opts = {}) => base.put(url, { ...opts, headers: h(opts.headers) }) };
const show = async (label, res) => { console.log(label, res.status(), (await res.text()).slice(0, 300)); return res; };
await show('upload', await r.post(`${API}/api/user-files/uploads?path=synthetic-discourse.csv`, { data: fs.readFileSync(CSV), headers: { 'Content-Type': 'application/octet-stream' } }));
const ws = await show('create', await r.post(`${API}/api/workspaces`, { data: { name: 'Claude UI check' } }));
const wsId = (await ws.json()).id ?? (await ws.json()).workspace_id;
console.log('wsId', wsId);
await show('open', await r.put(`${API}/api/workspaces/${wsId}/open`));
await show('node', await r.post(`${API}/api/workspaces/${wsId}/nodes`, { data: { kind: 'file', file_path: 'synthetic-discourse.csv', name: 'synthetic-discourse' } }));
await ctx.storageState({ path: `${S}/state.json` });
await page.reload({ waitUntil: 'networkidle' });
await page.screenshot({ path: `${S}/shots/setup.png` });
await browser.close();
