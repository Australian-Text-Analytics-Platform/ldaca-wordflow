// Evaluation helper, not part of the test suite.
// Checks one help icon per Preview/Run/Clear row and the Frequency cloud default.
// Usage: node live-check-rowhelp.mjs <work-dir> <webkit|chromium>  (after live-check-setup.mjs)
import * as pw from 'playwright-core';
const [S, engine] = process.argv.slice(2);
const browser = await pw[engine].launch();
const API = 'http://127.0.0.1:8101';
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: `${S}/state.json`, extraHTTPHeaders: { Origin: 'http://127.0.0.1:3100' } });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
const ok = (label, cond) => console.log(cond ? 'PASS' : 'FAIL', label);
let csrf = null;
page.on('response', async (res) => { try { const j = await res.json(); if (j && typeof j.csrf_token === 'string') csrf = j.csrf_token; } catch {} });
await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
const H = () => ({ headers: { 'X-CSRF-Token': csrf } });
await ctx.request.patch(`${API}/api/preferences`, { data: { contextual_hints_enabled: false }, ...H() });
const list = await (await ctx.request.get(`${API}/api/workspaces`, H())).json();
const items = Array.isArray(list) ? list : (list.workspaces ?? list.items ?? []);
const ws = items.find((w) => w.name === 'Claude UI check');
console.log('workspace', ws ? 'found' : JSON.stringify(list).slice(0, 200));
if (ws) console.log('open', (await ctx.request.put(`${API}/api/workspaces/${ws.id ?? ws.workspace_id}/open`, H())).status());
await page.reload({ waitUntil: 'networkidle' });

const openTool = async (name, { addBlock = true } = {}) => {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(500);
  const newTab = page.getByRole('button', { name: 'New tab' });
  if (await newTab.count()) await newTab.first().click();
  await page.waitForTimeout(800);
  if (!addBlock) return;
  await page.getByRole('button', { name: 'Add Data Block' }).first().click();
  await page.locator('[data-radix-popper-content-wrapper]').getByRole('button', { name: 'synthetic-discourse', exact: true }).click();
  await page.waitForTimeout(500);
  const col = page.getByRole('combobox').filter({ hasText: 'Select column' }).first();
  if (await col.count()) { await col.click(); await page.getByRole('option', { name: 'text', exact: true }).click(); }
};

const rowHelp = async (tool, name) => {
  const icons = page.getByRole('button', { name, exact: true });
  const n = await icons.count();
  ok(`${tool}: one "${name}" icon (found ${n})`, n === 1);
  ok(`${tool}: Clear results name not shared`, (await page.getByRole('button', { name: 'Clear results', exact: true }).count()) === 1);
  if (n) {
    const footer = icons.first().locator('xpath=ancestor::*[contains(@class,"flex-wrap")][1]');
    await footer.screenshot({ path: `${S}/shots/${engine}-rowhelp-${tool}.png` });
  }
};

await openTool('Frequency');
await rowHelp('Frequency', 'About Run and Clear results');
const run = page.getByRole('button', { name: 'Run', exact: true });
for (let i = 0; i < 40 && (await run.isDisabled()); i++) await page.waitForTimeout(500);
await run.click();
await page.getByTestId('token-frequency-display-settings').waitFor({ timeout: 120000 });
await page.waitForTimeout(1000);
const cloudInput = page.getByRole('spinbutton', { name: /Cloud display limit/ });
const value = (await cloudInput.count()) ? await cloudInput.first().inputValue() : '(no input found)';
ok(`Frequency: cloud display limit after a run is 40 (got ${value})`, value === '40');
// Open the Help from the row icon and check it lands on the Run step.
await page.getByRole('button', { name: 'About Run and Clear results', exact: true }).click();
await page.waitForTimeout(1200);
ok('Frequency: row icon opens the Run step', await page.getByText('Step 4: Run the analysis').first().isVisible());
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await openTool('Concordance');
await rowHelp('Concordance', 'About Preview, Run and Clear results');
await openTool('Trends');
await rowHelp('Trends', 'About Run and Clear results');
await openTool('Topics');
await rowHelp('Topics', 'About Run and Clear results');
await openTool('Quotation');
await rowHelp('Quotation', 'About Preview, Run and Clear results');
await openTool('Annotation', { addBlock: false });
ok('Annotation Manual: one "About Start and Close" icon', (await page.getByRole('button', { name: 'About Start and Close', exact: true }).count()) === 1);
await page.getByRole('button', { name: 'About Start and Close', exact: true }).locator('xpath=..').screenshot({ path: `${S}/shots/${engine}-rowhelp-Annotation-manual.png` });
const modeSwitch = page.getByText('Manual', { exact: true }).locator('xpath=..').getByRole('switch');
await modeSwitch.first().click();
await page.waitForTimeout(800);
await rowHelp('Annotation AI', 'About Preview, Run and Clear results');
ok('Annotation AI: Start help gone', (await page.getByRole('button', { name: 'About Start and Close', exact: true }).count()) === 0);
await page.screenshot({ path: `${S}/shots/${engine}-rowhelp-annotation-page.png` });
await modeSwitch.first().click();

console.log(problems.length ? problems.join('\n') : 'no page errors');
await browser.close();
