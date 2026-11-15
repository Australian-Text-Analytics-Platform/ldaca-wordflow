// Evaluation helper, not part of the test suite.
// Checks dragging a Data Block from the Project Graph onto a tool.
// Needs the "themes" and "synthetic-discourse" Data Blocks and a codebook in the check Project.
// Usage: node live-check-drag.mjs <work-dir> <webkit|chromium>  (after live-check-setup.mjs)
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

// ---- Frequency: one inputs box.
await newTab('Frequency');
await page.getByText('Data Blocks (0/2)').waitFor();
const themes = graphNode('themes');
const synthetic = graphNode('synthetic-discourse');
const box = page.locator('[role="main"] [data-data-block-drop-target]').first();
const before = await viewport();
const from = await centre(themes);
const to = await centre(box);
await drag(from, to, { hold: true });
const chip = page.getByTestId('data-block-drag-chip');
ok(`chip follows the pointer and names the box (${(await chip.innerText()).replace(/\n/g, ' / ')})`, (await chip.innerText()).includes('themes') && (await chip.innerText()).includes('Add to Data Blocks'));
ok('the box is highlighted under the pointer', (await page.getByTestId('node-inputs-drop-highlight').getAttribute('data-drag-over')) === 'true');
await page.screenshot({ path: out('01-dragging-onto-frequency') });
await page.mouse.up();
await page.waitForTimeout(600);
ok('released on the box: the block is added', (await page.getByText('Data Blocks (1/2)').count()) === 1);
ok('dragging a block does not pan the graph', (await viewport()) === before);
ok('the chip and highlight are gone', (await chip.count()) === 0 && (await page.getByTestId('node-inputs-drop-highlight').count()) === 0);

// Released anywhere on a one-box tool: still added.
const mainBox = await page.locator('[role="main"]').boundingBox();
await drag(await centre(synthetic), { x: mainBox.x + mainBox.width / 2, y: mainBox.y + mainBox.height - 60 });
await page.waitForTimeout(600);
ok('released elsewhere on a one-box tool: added to its box', (await page.getByText('Data Blocks (2/2)').count()) === 1);

// A full box refuses a third.
await drag(await visibleNode('themes_codebook'), await centre(box), { hold: true });
ok(`a full box says so (${(await chip.innerText()).replace(/\n/g, ' / ')})`, (await chip.innerText()).includes('already full'));
await page.screenshot({ path: out('02-full-box') });
await page.mouse.up();
await page.waitForTimeout(500);
ok('a full box keeps its two blocks', (await page.getByText('Data Blocks (2/2)').count()) === 1);

// Background still pans; Esc cancels a drag.
const pane = await page.locator('.react-flow__pane').first().boundingBox();
const empty = { x: pane.x + pane.width - 30, y: pane.y + pane.height - 40 };
const beforePan = await viewport();
await page.mouse.move(empty.x, empty.y);
await page.mouse.down();
await page.mouse.move(empty.x - 80, empty.y - 50, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
ok('dragging the background pans the graph', (await viewport()) !== beforePan);
const themesNow = await centre(graphNode('themes'));
await drag(themesNow, await centre(box), { hold: true });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
ok('Esc cancels the drag', (await chip.count()) === 0);
await page.mouse.up();

// A plain click still selects, and a double-click still adds.
await newTab('Frequency');
await page.getByText('Data Blocks (0/2)').waitFor();
const node = graphNode('themes');
await node.dblclick();
await page.waitForTimeout(600);
ok('double-click still adds the block', (await page.getByText('Data Blocks (1/2)').count()) === 1);

// A plain click still selects the block (and a second click deselects).
const card = page.locator('.react-flow__node').filter({ has: page.getByText('synthetic-discourse', { exact: true }) }).first().locator('[data-testid^="custom-node"]').first();
const selectedBefore = (await card.getAttribute('class')).includes('outline-2');
await page.mouse.move(5, 5); await page.waitForTimeout(300); { const b = await card.boundingBox(); await page.mouse.click(b.x + b.width - 8, b.y + 8); }
await page.waitForTimeout(400);
ok('a plain click still toggles selection', (await card.getAttribute('class')).includes('outline-2') !== selectedBefore);
await page.mouse.move(5, 5); await page.waitForTimeout(300); { const b = await card.boundingBox(); await page.mouse.click(b.x + b.width - 8, b.y + 8); }
await page.waitForTimeout(300);

// ---- Annotation: several boxes.
await newTab('Annotation');
await page.getByText('Data Blocks (0/1)').waitFor();
const annMain = await page.locator('[role="main"]').boundingBox();
await drag(await centre(graphNode('themes')), { x: annMain.x + annMain.width / 2, y: annMain.y + annMain.height - 60 }, { hold: true });
ok(`several boxes: asks to choose (${(await chip.innerText()).replace(/\n/g, ' / ')})`, (await chip.innerText()).includes('Drop on a highlighted box'));
ok('several boxes are highlighted', (await page.getByTestId('node-inputs-drop-highlight').count()) >= 2);
await page.screenshot({ path: out('03-annotation-boxes') });
await page.mouse.up();
await page.waitForTimeout(500);
ok('released between boxes: nothing added', (await page.getByText('Data Blocks (0/1)').count()) === 1 && (await page.getByText('Codebook Data Block (0/1)').count()) === 1);
const codebookBox = page.locator('[data-data-block-drop-target]').filter({ hasText: 'Codebook Data Block' }).first();
await drag(await visibleNode('themes_codebook'), await centre(codebookBox));
await page.waitForTimeout(700);
ok('released on Codebook: added there, not to the Annotation Data Block', (await page.getByText('Codebook Data Block (1/1)').count()) === 1 && (await page.getByText('Data Blocks (0/1)').count()) === 1);

console.log(problems.length ? problems.join('\n') : 'no page errors or API errors');
await browser.close();
