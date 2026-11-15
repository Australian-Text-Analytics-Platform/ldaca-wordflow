// Evaluation helper, not part of the test suite.
// Checks R3 to R9 (Frequency layout; Topic word cloud card, search Apply, stop-word line).
// Needs a "themes" Data Block (400 themed rows) in the check Project for Topic Modelling.
// Usage: node live-check-r3.mjs <work-dir> <webkit|chromium>  (after live-check-setup.mjs)
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
const out = (n) => `${S}/shots/${engine}-r3-${n}.png`;
let csrf = null;
page.on('response', async (res) => { try { const j = await res.json(); if (j && typeof j.csrf_token === 'string') csrf = j.csrf_token; } catch {} });
await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
const H = () => ({ headers: { 'X-CSRF-Token': csrf } });
await ctx.request.patch(`${API}/api/preferences`, { data: { contextual_hints_enabled: false }, ...H() });
const list = await (await ctx.request.get(`${API}/api/workspaces`, H())).json();
const items = Array.isArray(list) ? list : (list.workspaces ?? list.items ?? []);
const ws = items.find((w) => w.name === 'Claude UI check');
await ctx.request.put(`${API}/api/workspaces/${ws.id ?? ws.workspace_id}/open`, H());
await page.reload({ waitUntil: 'networkidle' });

const openTool = async (name, block = 'synthetic-discourse') => {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'New tab' }).first().click();
  await page.waitForTimeout(800);
  const add = page.getByRole('button', { name: `Add ${block} to this tool` });
  if ((await add.count()) === 0) await page.getByText(block, { exact: true }).first().click();
  await page.waitForTimeout(500);
  await add.first().click();
  await page.waitForTimeout(500);
  const col = page.getByRole('combobox').filter({ hasText: 'Select column' }).first();
  if (await col.count()) { await col.click(); await page.getByRole('option', { name: 'text', exact: true }).click(); }
};
const runIt = async () => {
  const run = page.getByRole('button', { name: 'Run', exact: true });
  for (let i = 0; i < 60 && (await run.isDisabled()); i++) await page.waitForTimeout(500);
  await run.click();
};

// ---------- Frequency (R4 to R7)
await openTool('Frequency');
await runIt();
await page.getByTestId('token-frequency-display-settings').waitFor({ timeout: 120000 });
await page.waitForTimeout(800);
ok('Frequency: Sort hidden while the list is closed', (await page.getByRole('button', { name: 'Sort', exact: true }).count()) === 0);
ok('Frequency: no Apply buttons', (await page.getByRole('button', { name: 'Apply', exact: true }).count()) === 0);
const limit = page.getByTestId('token-frequency-display-limit');
const tabs = page.getByTestId('token-frequency-results-view-tabs');
const filter = page.getByTestId('token-frequency-token-filter-card');
const [lb, tb, fb] = [await limit.boundingBox(), await tabs.boundingBox(), await filter.boundingBox()];
ok(`Frequency: limit on the filter row (limit y=${Math.round(lb.y)}, tabs y=${Math.round(tb.y)}, filter y=${Math.round(fb.y)})`, Math.abs(lb.y + lb.height / 2 - (tb.y + tb.height / 2)) < 12);
ok('Frequency: Cloud view shows only the cloud limit', (await page.getByRole('spinbutton', { name: /Cloud display limit/ }).count()) === 1 && (await page.getByRole('spinbutton', { name: /List display limit/ }).count()) === 0);
await page.getByRole('button', { name: 'Edit list' }).click();
await page.waitForTimeout(300);
ok('Frequency: Sort shows with the list open', (await page.getByRole('button', { name: 'Sort', exact: true }).count()) === 1);
const textarea = await page.locator('#stop-words').boundingBox();
const lb2 = await limit.boundingBox();
ok('Frequency: the opened list sits above the limit row', textarea && lb2 && textarea.y + textarea.height <= lb2.y);
await page.getByRole('button', { name: 'Hide list' }).click();
// Enter applies the limit.
const cloudInput = page.getByRole('spinbutton', { name: /Cloud display limit/ });
await cloudInput.fill('30');
await cloudInput.press('Enter');
await page.waitForTimeout(800);
await page.getByRole('tab', { name: 'List view' }).click();
await page.waitForTimeout(400);
const listInput = page.getByRole('spinbutton', { name: /List display limit/ });
ok('Frequency: List view shows only the list limit', (await listInput.count()) === 1 && (await page.getByRole('spinbutton', { name: /Cloud display limit/ }).count()) === 0);
const listLabel = await page.locator('label[for="list-limit"]').innerText();
const vocab = Number(listLabel.match(/(\d+)\)\s*$/)?.[1] ?? 0);
ok(`Frequency: Enter applied the cloud limit, mirrored to the list (${await listInput.inputValue()}, label "${listLabel}")`, Number(await listInput.inputValue()) === Math.min(30, vocab));
await page.getByRole('tab', { name: 'Cloud view' }).click();
await cloudInput.fill('40');
await cloudInput.press('Enter');
await page.waitForTimeout(600);
await page.locator('[data-testid="token-frequency-display-limit"]').locator('xpath=ancestor::div[contains(@class,"flex-wrap")][1]').screenshot({ path: out('frequency-limit-row') });
await page.screenshot({ path: out('frequency-1440') });

// ---------- Topic Modelling (R3, R8, R9)
await openTool('Topics', 'themes');
await runIt();
const firstBubble = page.locator('[data-testid^="topic-bubble-circle-"]').first();
await firstBubble.waitFor({ timeout: 300000 });
await page.waitForTimeout(1000);
// Give the chart the full width: options below it.
const below = page.getByRole('button', { name: 'Move the options below the chart' });
if (await below.count()) { await below.click(); await page.waitForTimeout(1500); }
const bubbleCount = await page.locator('[data-testid^="topic-bubble-circle-"]').count();
console.log('bubbles', bubbleCount);
// Pick a real Topic bubble (not Ungrouped), the largest visible.
const circles = page.locator('[data-testid^="topic-bubble-circle-"]');
let target = null; let best = 0;
for (let i = 0; i < bubbleCount; i++) {
  const c = circles.nth(i);
  const id = (await c.getAttribute('data-testid')).replace('topic-bubble-circle-', '');
  if (Number(id) < 0) continue;
  const box = await c.boundingBox();
  if (box && box.width > best) { best = box.width; target = { id, box }; }
}
console.log('target topic', target?.id);
const cx = target.box.x + target.box.width / 2, cy = target.box.y + target.box.height / 2;
const card = page.getByTestId(`topic-flow-tooltip-${target.id}`);
await page.mouse.move(cx, cy);
await page.waitForTimeout(60);
ok('Topic: card not open straight away', (await card.count()) === 0);
await page.waitForTimeout(300);
ok('Topic: card opens after the pause', await card.isVisible());
const cardBox = await card.boundingBox();
// Move from the bubble into the card in steps, then wait past the close delay.
await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2, { steps: 8 });
await page.waitForTimeout(700);
ok('Topic: card stays while the pointer is in it', await card.isVisible());
await page.screenshot({ path: out('topic-card') });
// Words drawn by the cloud (SVG text inside the card), clicked by position
// once the cloud's entry animation has settled.
await page.waitForTimeout(1200);
const words = card.locator('[role="img"] svg text');
const wordCount = await words.count();
console.log('words in card', wordCount);
await card.screenshot({ path: out('topic-card-zoom') });
const cardNow = await card.boundingBox();
const visible = [];
for (let i = 0; i < wordCount; i++) {
  const b = await words.nth(i).boundingBox();
  const t = ((await words.nth(i).textContent()) ?? '').trim();
  if (b && t && b.x >= cardNow.x && b.x + b.width <= cardNow.x + cardNow.width && b.y >= cardNow.y && b.y + b.height <= cardNow.y + cardNow.height) visible.push({ t, b });
}
console.log('visible words', visible.map((w) => w.t).join(' '));
const clickWord = async (w, button = 'left') => { await page.mouse.click(w.b.x + w.b.width / 2, w.b.y + w.b.height * 0.4, { button }); };
const word0 = visible[0].t;
const word1 = visible[1].t;
const selectedBefore = await page.getByText('Selected', { exact: true }).count();
await clickWord(visible[0]);
await page.waitForTimeout(500);
const search = page.getByRole('searchbox', { name: 'Search term' });
ok(`Topic: click adds "${word0}" to the search (${await search.inputValue()})`, (await search.inputValue()).toLowerCase().startsWith(word0.toLowerCase()));
ok('Topic: the click did not select the topic', (await page.getByText('Selected', { exact: true }).count()) === selectedBefore);
ok('Topic: card still open after the click', await card.isVisible());
{
  // The other words keep their places after a click (colour only, no relayout).
  await page.waitForTimeout(1200);
  const n = await words.count();
  let moved = 0;
  for (const w of visible.slice(1)) {
    for (let i = 0; i < n; i++) {
      if (((await words.nth(i).textContent()) ?? '').trim() !== w.t) continue;
      const b = await words.nth(i).boundingBox();
      if (!b || Math.abs(b.x - w.b.x) > 1 || Math.abs(b.y - w.b.y) > 1) moved += 1;
      break;
    }
  }
  ok(`Topic: other words stay in place after a click (${moved} moved)`, moved === 0);
}
const fadedBefore = await page.locator('[data-testid^="topic-flow-node-"].opacity-\\[0\\.18\\]').count();
ok(`Topic: no filtering before Apply (faded ${fadedBefore})`, fadedBefore === 0);
ok('Topic: Apply is available', await page.getByRole('button', { name: 'Apply search term' }).isEnabled());
// Right-click the second word: it becomes a stop word.
{
  // Measure the word afresh in the live cloud (not the previous-frame copy).
  const live = card.locator('[role="img"] svg text');
  const n = await live.count();
  for (let i = 0; i < n; i++) {
    if (((await live.nth(i).textContent()) ?? '').trim() === word1) {
      const b = await live.nth(i).boundingBox();
      const px = b.x + b.width / 2, py = b.y + b.height * 0.4;
      const at = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el?.tagName + ':' + (el?.textContent ?? '').slice(0, 20); }, [px, py]);
      console.log('right-click', word1, 'box', JSON.stringify(b), 'element at point', at);
      await page.mouse.click(px, py, { button: 'right' });
      break;
    }
  }
}
await page.waitForTimeout(1500);
const preview = page.getByTestId('topic-stop-words-preview');
console.log('preview count', await preview.count(), (await preview.count()) ? await preview.innerText() : '', '| list:', await page.getByRole('combobox', { name: 'Stop words list' }).innerText().catch(() => '?'));
ok(`Topic: right-click adds "${word1}" first to the stop words`, (await preview.count()) === 1 && (await preview.innerText()).startsWith(`Hidden words: ${word1.toLowerCase()}`));
ok('Topic: the stop words switch is on', await page.getByRole('switch', { name: 'Use stop words' }).isChecked());
ok('Topic: examples were not toggled by the right-click', (await page.getByTestId(`topic-shown-eye-${target.id}`).count()) === 0);
// Click the first word again (still in the card): it is removed from the search.
{
  // The cloud is laid out again without the new stop word: find the word anew.
  await page.waitForTimeout(1200);
  let again = null;
  const n = await words.count();
  for (let i = 0; i < n; i++) {
    if (((await words.nth(i).textContent()) ?? '').trim() === word0) { again = { t: word0, b: await words.nth(i).boundingBox() }; break; }
  }
  if (again) await clickWord(again); else console.log('word0 not found again');
}
await page.waitForTimeout(400);
ok(`Topic: second click removes it (${JSON.stringify(await search.inputValue())})`, (await search.inputValue()) === '');
// Leave the card: it closes after the delay.
await page.mouse.move(5, 5, { steps: 4 });
await page.waitForTimeout(700);
ok('Topic: card closes after leaving', (await card.count()) === 0);

// Shift keeps the card open.
await page.mouse.move(cx, cy);
await page.waitForTimeout(400);
await page.keyboard.down('Shift');
await page.mouse.move(5, 5, { steps: 4 });
await page.waitForTimeout(800);
ok('Topic: Shift keeps the card open', await card.isVisible());
await page.keyboard.up('Shift');
await page.waitForTimeout(700);
ok('Topic: releasing Shift lets it close', (await card.count()) === 0);

// Apply and Enter; emptying clears.
await search.fill(word0);
await page.waitForTimeout(300);
const fadedTyped = await page.locator('[data-testid^="topic-flow-node-"].opacity-\\[0\\.18\\]').count();
await search.press('Enter');
await page.waitForTimeout(500);
const fadedApplied = await page.locator('[data-testid^="topic-flow-node-"].opacity-\\[0\\.18\\]').count();
ok(`Topic: typing does not filter (${fadedTyped}), Enter does (${fadedApplied})`, fadedTyped === 0 && (fadedApplied > 0 || bubbleCount <= 2));
ok('Topic: Apply rests once applied', await page.getByRole('button', { name: 'Apply search term' }).isDisabled());
await search.blur();
await search.fill('');
await page.waitForTimeout(400);
ok('Topic: emptying the box clears the filter', (await page.locator('[data-testid^="topic-flow-node-"].opacity-\\[0\\.18\\]').count()) === 0);
// Tooltip text: usage when it fits, the terms when it overflows.
await search.fill('a');
await search.hover();
await page.waitForTimeout(200);
ok('Topic: short search shows the usage tip', (await search.getAttribute('title')).startsWith('Words or parts'));
const long = 'alpha, beta, gamma, delta, epsilon, zeta, eta, theta, iota, kappa, lambda, mu';
await search.fill(long);
await page.mouse.move(5, 5);
await search.hover();
await page.waitForTimeout(200);
ok('Topic: overflowing search shows the whole list', (await search.getAttribute('title')) === long);
ok('Topic: magnifier keeps the usage tip', (await page.getByTestId('topic-find-usage').getAttribute('title')).startsWith('Words or parts'));
await search.fill('');
// Sort in the editing window.
await page.getByRole('button', { name: 'Edit stop words' }).click();
ok('Topic: Sort in the editing window', await page.getByRole('dialog').getByRole('button', { name: 'Sort' }).isVisible());
await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
await page.screenshot({ path: out('topic-1440') });

console.log(problems.length ? problems.join('\n') : 'no page errors or API errors');
await browser.close();
