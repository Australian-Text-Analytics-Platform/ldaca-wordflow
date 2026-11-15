// Evaluation helper, not part of the test suite.
// Checks dragging a Data Block from the sidebar list onto a tool.
// Usage: node live-check-drag-sidebar.mjs <work-dir> <webkit|chromium>  (after live-check-setup.mjs)
import * as pw from 'playwright-core';
const [S, engine] = process.argv.slice(2);
const API = 'http://127.0.0.1:8101';
const browser = await pw[engine].launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, storageState: `${S}/state.json`, extraHTTPHeaders: { Origin: 'http://127.0.0.1:3100' } });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`); });
const ok = (label, cond) => console.log(cond ? 'PASS' : 'FAIL', label);
const out = (n) => `${S}/shots/${engine}-drag-${n}.png`;
let csrf = null;
page.on('response', async (res) => { try { const j = await res.json(); if (j && typeof j.csrf_token === 'string') csrf = j.csrf_token; } catch {} });
await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
const H = () => ({ headers: { 'X-CSRF-Token': csrf } });
await ctx.request.patch(`${API}/api/preferences`, { data: { contextual_hints_enabled: false }, ...H() });
const list = await (await ctx.request.get(`${API}/api/workspaces`, H())).json();
const ws = (Array.isArray(list) ? list : (list.workspaces ?? list.items ?? [])).find((w) => w.name === 'Claude UI check');
await ctx.request.put(`${API}/api/workspaces/${ws.id ?? ws.workspace_id}/open`, H());
await page.reload({ waitUntil: 'networkidle' });

const viewport = () => page.locator('.react-flow__viewport').first().evaluate((el) => el.style.transform);
const graphNode = (name) => page.locator('.react-flow__node').filter({ has: page.getByText(name, { exact: true }) }).first();
const centre = async (locator) => { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const drag = async (from, to, { hold = false } = {}) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 4, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  if (!hold) await page.mouse.up();
};
// A graph block with this text whose centre is inside the visible graph.
const visibleNode = async (text) => {
  const paneBox = await page.locator('.react-flow__pane').first().boundingBox();
  const nodes = page.locator('.react-flow__node').filter({ hasText: text });
  for (let i = 0; i < (await nodes.count()); i++) {
    const b = await nodes.nth(i).boundingBox();
    if (!b) continue;
    const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    if (c.x > paneBox.x + 5 && c.x < paneBox.x + paneBox.width - 5 && c.y > paneBox.y + 5 && c.y < paneBox.y + paneBox.height - 5) return c;
  }
  throw new Error(`no visible graph block with "${text}"`);
};
const newTab = async (tool) => {
  await page.getByRole('button', { name: tool, exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'New tab' }).first().click();
  await page.waitForTimeout(900);
};


// ---- Dragging from the sidebar's Data Blocks list.
await newTab('Frequency');
await page.getByText('Data Blocks (0/2)').waitFor();
const row = (name) => page.getByRole('button', { name: `Select ${name}`, exact: true }).first();
const box = page.locator('[role="main"] [data-data-block-drop-target]').first();
const chip = page.getByTestId('data-block-drag-chip');
await drag(await centre(row('themes')), await centre(box), { hold: true });
ok(`sidebar: label names the block and the box (${(await chip.innerText()).replace(/\n/g, ' / ')})`, (await chip.innerText()).includes('themes') && (await chip.innerText()).includes('Add to Data Blocks'));
await page.screenshot({ path: out('04-from-sidebar') });
await page.mouse.up();
await page.waitForTimeout(600);
ok('sidebar: released on the box adds the block', (await page.getByText('Data Blocks (1/2)').count()) === 1);
ok('sidebar: the dragged row was not selected by the drag', (await page.getByRole('button', { name: 'Deselect themes', exact: true }).count()) === 0);
// Released anywhere on a one-box tool.
const mainBox = await page.locator('[role="main"]').boundingBox();
await drag(await centre(row('synthetic-discourse')), { x: mainBox.x + mainBox.width / 2, y: mainBox.y + mainBox.height - 60 });
await page.waitForTimeout(600);
ok('sidebar: released elsewhere on a one-box tool adds', (await page.getByText('Data Blocks (2/2)').count()) === 1);
// Released back on the sidebar: nothing happens, and a click still selects.
await newTab('Frequency');
await page.getByText('Data Blocks (0/2)').waitFor();
const rowBox = await row('themes').boundingBox();
await drag(await centre(row('themes')), { x: rowBox.x + rowBox.width / 2, y: rowBox.y + 200 });
await page.waitForTimeout(400);
ok('sidebar: released on the sidebar adds nothing', (await page.getByText('Data Blocks (0/2)').count()) === 1);
await row('themes').click({ position: { x: rowBox.width - 12, y: 6 } });
await page.waitForTimeout(400);
ok('sidebar: a plain click still selects', (await page.getByRole('button', { name: 'Deselect themes', exact: true }).count()) === 1);
await page.getByRole('button', { name: 'Deselect themes', exact: true }).first().click({ position: { x: rowBox.width - 12, y: 6 } });
// The hover + still adds.
await row('synthetic-discourse').hover();
await page.waitForTimeout(300);
console.log(problems.length ? problems.join('\n') : 'no page errors or API errors');
await browser.close();
