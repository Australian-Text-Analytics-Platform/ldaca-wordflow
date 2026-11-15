// Evaluation helper, not part of the test suite.
// Checks the AI Code Designer end to end against fake-llm-server.py (port 8765).
// Needs the "themes" Data Block (400 themed rows) in the check Project.
// Usage: node live-check-designer.mjs <work-dir> <webkit|chromium>  (after live-check-setup.mjs)
import * as pw from 'playwright-core';
import fs from 'node:fs';
const [S, engine] = process.argv.slice(2);
const API = 'http://127.0.0.1:8101';
const browser = await pw[engine].launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, storageState: `${S}/state.json`, extraHTTPHeaders: { Origin: 'http://127.0.0.1:3100' } });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`); });
const ok = (label, cond) => console.log(cond ? 'PASS' : 'FAIL', label);
const out = (n) => `${S}/shots/${engine}-designer-${n}.png`;
let csrf = null;
page.on('response', async (res) => { try { const j = await res.json(); if (j && typeof j.csrf_token === 'string') csrf = j.csrf_token; } catch {} });
await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
const H = () => ({ headers: { 'X-CSRF-Token': csrf } });
await ctx.request.patch(`${API}/api/preferences`, { data: { contextual_hints_enabled: false }, ...H() });
const list = await (await ctx.request.get(`${API}/api/workspaces`, H())).json();
const items = Array.isArray(list) ? list : (list.workspaces ?? list.items ?? []);
const ws = items.find((w) => w.name === 'Claude UI check');
await ctx.request.put(`${API}/api/workspaces/${ws.id ?? ws.workspace_id}/open`, H());
// A Custom provider pointing at the stand-in server, once.
const providers = await (await ctx.request.get(`${API}/api/provider-credentials`, H())).json();
const existing = (providers.annotation_providers ?? []).find((p) => p.name === 'Stand-in server');
if (!existing) {
  const created = await ctx.request.post(`${API}/api/provider-credentials/annotation-providers`, {
    data: { name: 'Stand-in server', provider: 'custom', base_url: 'http://127.0.0.1:8765/v1' }, ...H(),
  });
  console.log('provider', created.status());
}
await page.reload({ waitUntil: 'networkidle' });

const setDelay = (seconds) => fs.writeFileSync(`${S}/delay.txt`, String(seconds));

// Annotation tab with the themed corpus and a fresh codebook.
await page.getByRole('button', { name: 'Annotation', exact: true }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'New tab' }).first().click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Add Data Block' }).first().click();
await page.locator('[data-radix-popper-content-wrapper]').getByRole('button', { name: 'themes', exact: true }).click();
await page.waitForTimeout(600);
const col = page.getByRole('combobox').filter({ hasText: 'Select column' }).first();
if (await col.count()) { await col.click(); await page.getByRole('option', { name: 'text', exact: true }).click(); }
await page.getByRole('button', { name: 'Create new' }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Edit', exact: true }).click();
const editor = page.getByRole('dialog').filter({ hasText: 'Edit codebook' });
await editor.waitFor();

// Brief.
const designBtn = editor.getByRole('button', { name: 'AI Code Designer', exact: true });
ok('designer waits for a brief', await designBtn.isDisabled());
await editor.getByLabel(/Brief for the AI Code Designer/).fill('Which public services do residents talk about: housing, transport, health, or something else?');
await editor.getByLabel('Task context').fill('Synthetic local news snippets for a Wordflow check.');
ok('brief word count', (await editor.getByTestId('codebook-brief-words').innerText()).startsWith('13 / 250'));
await editor.screenshot({ path: out('01-edit-with-brief') });
await designBtn.click();

// Designer window.
const designer = page.getByTestId('codebook-designer-dialog');
await designer.waitFor();
ok('disclaimer names the Data Block and provider', (await designer.getByTestId('codebook-designer-disclaimer').innerText()).includes('themes') && (await designer.getByTestId('codebook-designer-disclaimer').innerText()).includes('Stand-in server'));
ok('defaults: 100 texts, seed 0, High', (await designer.getByLabel('Sample size').inputValue()) === '100' && (await designer.getByLabel('Sample seed').inputValue()) === '0' && (await designer.getByLabel('Thinking effort').innerText()).includes('High'));
ok('prompt hidden until Advanced', (await designer.getByRole('textbox', { name: 'System prompt' }).count()) === 0);
await designer.getByRole('switch', { name: "Show the designer's system prompt" }).click();
ok('Advanced shows the prompt', (await designer.getByRole('textbox', { name: 'System prompt' }).inputValue()).includes('first-draft codebook'));
// Model from the stand-in server's list.
const modelInput = designer.getByLabel('Model');
await modelInput.click();
await modelInput.fill('fake-model');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await designer.screenshot({ path: out('02-designer-window') });

// Run with a 35-second "thinking" model.
setDelay(35);
await designer.getByRole('button', { name: 'Design codebook' }).click();
await page.waitForTimeout(2500);
ok(`stage shows the model (${await designer.getByTestId('codebook-designer-stage').innerText()})`, (await designer.getByTestId('codebook-designer-stage').innerText()).includes('Waiting for fake-model (sent 100 texts)'));
ok('no × while running', (await designer.getByRole('button', { name: 'Close' }).count()) === 0);
await page.keyboard.press('Escape');
await page.mouse.click(10, 10);
await page.waitForTimeout(300);
ok('Esc and clicking outside keep it open', await designer.isVisible());
const clock1 = await designer.getByText(/Elapsed/).innerText();
await page.waitForTimeout(2000);
const clock2 = await designer.getByText(/Elapsed/).innerText();
ok(`clock runs (${clock1} -> ${clock2})`, clock1 !== clock2);
await page.waitForTimeout(27000);
ok('still-working note after 30 s', await designer.getByTestId('codebook-designer-still-working').isVisible());
await designer.screenshot({ path: out('03-running') });
await designer.waitFor({ state: 'detached', timeout: 30000 });

// The draft in the Edit window.
ok('draft fills the window', (await editor.getByLabel('Code 1', { exact: true }).inputValue()) === 'Housing' && (await editor.getByLabel('Code 4', { exact: true }).inputValue()) === 'Other');
ok('marked AI draft, not saved', (await editor.getByTestId('codebook-unsaved-badge').innerText()) === 'AI draft, not saved');
ok('Task context untouched', (await editor.getByLabel('Task context').inputValue()).startsWith('Synthetic local news'));
await editor.screenshot({ path: out('04-ai-draft') });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
ok('closing keeps the draft (card note)', (await page.getByTestId('codebook-unsaved-note').innerText()).includes('AI draft'));
await page.getByRole('button', { name: 'Edit', exact: true }).click();
await editor.waitFor();
await editor.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(1500);
ok('saved codes show on the card', (await page.getByText('Housing', { exact: true }).count()) > 0 && (await page.getByTestId('codebook-unsaved-note').count()) === 0);

// Hand edit and save: the brief greys out.
await page.getByRole('button', { name: 'Edit', exact: true }).click();
await editor.waitFor();
ok('untouched AI save left the brief usable', await editor.getByRole('button', { name: 'AI Code Designer', exact: true }).isEnabled());
await editor.getByLabel('Code 1', { exact: true }).fill('Housing costs');
await editor.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Edit', exact: true }).click();
await editor.waitFor();
const brief = editor.getByLabel(/Brief for the AI Code Designer/);
ok('hand-edited save greys the brief', (await brief.getAttribute('data-stale')) === 'true' && (await editor.getByRole('button', { name: 'AI Code Designer', exact: true }).isDisabled()));
await editor.screenshot({ path: out('05-brief-stale') });
await brief.press('End');
await brief.type(' Or schools?');
ok('editing the brief unlocks it', await editor.getByRole('button', { name: 'AI Code Designer', exact: true }).isEnabled());

// Re-design: warning first, then Stop.
await editor.getByRole('button', { name: 'AI Code Designer', exact: true }).click();
const warning = page.getByRole('alertdialog');
ok('overwrite warning first', (await warning.innerText()).includes('Replace the codes in this codebook?'));
await warning.screenshot({ path: out('06-overwrite-warning') });
await warning.getByRole('button', { name: 'Continue' }).click();
await designer.waitFor();
setDelay(120);
await designer.getByRole('button', { name: 'Design codebook' }).click();
await page.waitForTimeout(3000);
await designer.getByRole('button', { name: 'Stop' }).click();
await page.waitForTimeout(800);
ok('Stop returns to the form', (await designer.getByText('Stopped. Nothing was changed.').count()) === 1);
await designer.getByRole('button', { name: 'Cancel' }).click();
ok('codes unchanged after Stop', (await editor.getByLabel('Code 1', { exact: true }).inputValue()) === 'Housing costs');
await editor.getByRole('button', { name: 'Cancel' }).click();

console.log(problems.length ? problems.join('\n') : 'no page errors or API errors');
await browser.close();
