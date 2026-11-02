// Evaluation helper, not part of the test suite.
// Live checks of the IMPLEMENTATION.md changes against a running dev server
// (frontend 3100, backend 8101). Turns contextual hints off for the session,
// opens a new Frequency and Concordance tab each run, prints PASS/FAIL lines,
// layout measurements, and any page errors or API responses >= 400.
// Usage: node live-check.mjs <work-dir> <webkit|chromium>  (after live-check-setup.mjs)
import * as pw from 'playwright-core';
const [S, engine] = process.argv.slice(2);
const API = 'http://127.0.0.1:8101';
const out = (n) => `${S}/shots/${engine}-${n}.png`;
const browser = await pw[engine].launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 }, storageState: `${S}/state.json`,
  extraHTTPHeaders: { Origin: 'http://127.0.0.1:3100' },
});
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
let csrf = null;
page.on('response', async (res) => {
  if (res.status() >= 400 && res.url().includes('/api/')) problems.push(`HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
  try { const j = await res.json(); if (j && typeof j.csrf_token === 'string') csrf = j.csrf_token; } catch {}
});
await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
const pref = await ctx.request.patch(`${API}/api/preferences`, { data: { contextual_hints_enabled: false }, headers: { 'X-CSRF-Token': csrf } });
console.log('hints off', pref.status());
await page.reload({ waitUntil: 'networkidle' });
const ok = (label, cond) => console.log(cond ? 'PASS' : 'FAIL', label);

// Frequency: Data Block open in the Data Editor, tool empty.
await page.getByRole('button', { name: 'Frequency', exact: true }).click();
await page.getByRole('button', { name: 'New tab' }).click();
await page.getByText('Data Blocks (0/2)').waitFor();
await page.waitForTimeout(800);
if ((await page.getByTestId('node-inputs-open-data-block').count()) === 0) {
  await page.getByText('synthetic-discourse', { exact: true }).first().click();
}
const suggestion = page.getByTestId('node-inputs-open-data-block');
await suggestion.waitFor({ timeout: 15000 });
ok('suggestion names the open Data Block', (await suggestion.innerText()).includes('synthetic-discourse is open in the Data Editor but not added to this tool.'));
await page.screenshot({ path: out('01-empty-input-suggestion') });
await page.getByRole('button', { name: 'Add synthetic-discourse to this tool' }).click();
await page.getByText('Data Blocks (1/2)').waitFor();
ok('suggestion disappears once added', (await suggestion.count()) === 0);
ok('inputs heading shows Remove all', await page.getByRole('button', { name: 'Remove all Data Blocks' }).isVisible());
const pickText = async () => {
  const col = page.getByRole('combobox').filter({ hasText: 'Select column' }).first();
  if (await col.count()) { await col.click(); await page.getByRole('option', { name: 'text', exact: true }).click(); }
};
await pickText();
const run = page.getByRole('button', { name: 'Run', exact: true });
await run.waitFor();
for (let i = 0; i < 20 && (await run.isDisabled()); i++) await page.waitForTimeout(500);
if (await run.isDisabled()) {
  const tok = page.getByRole('combobox').filter({ hasText: /None|Select/ }).first();
  if (await tok.count()) { await tok.click(); await page.getByRole('option', { name: /Plain words/ }).first().click(); }
}
for (let i = 0; i < 20 && (await run.isDisabled()); i++) await page.waitForTimeout(500);
if (await run.isDisabled()) { await page.screenshot({ path: out('debug-run-disabled') }); console.log('RUN DISABLED'); process.exit(1); }
await run.click();
await page.getByTestId('token-frequency-display-settings').waitFor({ timeout: 120000 });
await page.locator('svg text').first().waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
ok('results button reads Clear results', await page.locator('button', { hasText: 'Clear results' }).isVisible());
const cloudText = await page.locator('svg text').allTextContents();
ok('cloud has said and housing', cloudText.includes('said') && cloudText.includes('housing'));

const measure = async (label) => {
  const vh = page.viewportSize().height;
  const settings = await page.getByTestId('token-frequency-display-settings').boundingBox();
  const tabs = await page.getByTestId('token-frequency-results-view-tabs').boundingBox();
  const firstWord = await page.locator('svg text').first().boundingBox();
  const cloudSvg = await page.locator('svg:has(text)').first().boundingBox();
  console.log(`${label}: viewport h=${vh} settings h=${Math.round(settings.height)} top=${Math.round(settings.y)} tabsBottom=${Math.round(tabs.y + tabs.height)} cloudTop=${Math.round(cloudSvg.y)} visibleCloudPx=${Math.max(0, Math.round(vh - cloudSvg.y))} firstWordTop=${Math.round(firstWord.y)}`);
};
await measure('1440');
await page.screenshot({ path: out('02-frequency-1440') });
await page.setViewportSize({ width: 1024, height: 768 });
await page.waitForTimeout(1500);
await measure('1024');
await page.screenshot({ path: out('03-frequency-1024') });
await page.getByRole('button', { name: 'Edit list' }).click();
ok('Edit list opens the stop-word list', await page.getByRole('textbox', { name: /Stop words filter/ }).isVisible());
await page.screenshot({ path: out('04-frequency-1024-edit-list') });
await page.getByRole('button', { name: 'Hide list' }).click();
await page.getByRole('switch', { name: 'Enable stop words' }).click();
await page.waitForTimeout(500);
ok('switching on an empty list opens it', await page.getByRole('textbox', { name: /Stop words filter/ }).isVisible());
await page.getByRole('textbox', { name: /Stop words filter/ }).fill('the, said');
await page.getByRole('textbox', { name: /Stop words filter/ }).blur();
await page.getByRole('button', { name: 'Hide list' }).click();
await page.waitForTimeout(1000);
const preview = page.getByTestId('token-frequency-stop-words-preview');
ok('closed list shows hidden words', (await preview.innerText()).includes('the, said'));
const after = await page.locator('svg text').allTextContents();
ok('stop words removed from the cloud', !after.includes('said') && !after.includes('the'));
await page.screenshot({ path: out('05-frequency-1024-hidden-words') });
// Restore the tab so reruns start clean.
await page.getByRole('button', { name: 'Edit list' }).click();
await page.getByRole('textbox', { name: /Stop words filter/ }).fill('');
await page.getByRole('textbox', { name: /Stop words filter/ }).blur();
await page.getByRole('switch', { name: 'Enable stop words' }).click();
const filter = page.getByRole('textbox', { name: 'Filter tokens' });
await filter.fill('hous*');
ok('filter button reads Clear filter', await page.getByRole('button', { name: 'Clear filter' }).isVisible());
await page.getByRole('button', { name: 'Clear filter' }).click();
ok('Clear filter empties the filter', (await filter.inputValue()) === '');

// Concordance.
try {
await page.setViewportSize({ width: 1440, height: 1000 });
await page.getByRole('button', { name: 'Concordance', exact: true }).click();
await page.getByRole('button', { name: 'New tab' }).click();
await page.getByText('Data Blocks (0/2)').waitFor();
await page.waitForTimeout(800);
if ((await page.getByTestId('node-inputs-open-data-block').count()) === 0) {
  await page.getByText('synthetic-discourse', { exact: true }).first().click();
}
await page.getByTestId('node-inputs-open-data-block').waitFor({ timeout: 15000 });
const add = page.getByRole('button', { name: 'Add synthetic-discourse to this tool' });
if (await add.count()) await add.click();
await page.getByText('Data Blocks (1/2)').waitFor();
await pickText();
ok('Left context named', await page.getByRole('spinbutton', { name: 'Left context (tokens)' }).isVisible());
ok('Right context named', await page.getByRole('spinbutton', { name: 'Right context (tokens)' }).isVisible());
await page.getByPlaceholder('Enter word or phrase to search for').fill('housing');
const crun = page.getByRole('button', { name: 'Run', exact: true });
for (let i = 0; i < 60 && (await crun.isDisabled()); i++) await page.waitForTimeout(500);
await crun.click();
const addProject = page.getByRole('button', { name: 'Add to Project' }).first();
await addProject.waitFor({ timeout: 120000 });
for (let i = 0; i < 60 && (await addProject.isDisabled()); i++) await page.waitForTimeout(500);
await addProject.click();
const dialog = page.getByRole('dialog');
await dialog.waitFor();
const dtext = await dialog.innerText();
ok('dialog summary says one row per match', dtext.includes('Each match becomes one row in the new Data Block.'));
ok('dialog no longer says immutable', !/immutable/i.test(dtext));
await page.waitForTimeout(700); await page.screenshot({ path: out('06-concordance-dialog') });
await dialog.getByRole('button', { name: 'Cancel' }).click();
await page.setViewportSize({ width: 1024, height: 768 });
await page.waitForTimeout(800);
await page.screenshot({ path: out('07-concordance-1024') });

} catch (e) { console.log('CONC ERROR', e.message.split('\n')[0]); await page.screenshot({ path: out('debug-concordance') }); }
console.log('problems:', problems.length ? problems.join('\n') : 'none');
await browser.close();
