// Evaluation helper, not part of the test suite.
// Checks the trial changes alongside 0.7.20's Maximise results and Basic/Advanced modes.
// Usage: node live-check-v020.mjs <work-dir> <webkit|chromium>  (after live-check-setup.mjs)
import * as pw from 'playwright-core';
const [S, engine] = process.argv.slice(2);
const out = (n) => `${S}/shots/${engine}-v020-${n}.png`;
const browser = await pw[engine].launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, storageState: `${S}/state.json` });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
const ok = (label, cond) => console.log(cond ? 'PASS' : 'FAIL', label);
await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
const openTool = async (name) => {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'New tab' }).click();
  await page.getByText('Data Blocks (0/2)').waitFor();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Add Data Block' }).first().click();
  await page.locator('[data-radix-popper-content-wrapper]').getByRole('button', { name: 'synthetic-discourse', exact: true }).click();
  await page.getByText('Data Blocks (1/2)').waitFor();
  const col = page.getByRole('combobox').filter({ hasText: 'Select column' }).first();
  if (await col.count()) { await col.click(); await page.getByRole('option', { name: 'text', exact: true }).click(); }
};
const runIt = async () => {
  const run = page.getByRole('button', { name: 'Run', exact: true });
  for (let i = 0; i < 40 && (await run.isDisabled()); i++) await page.waitForTimeout(500);
  await run.click();
};

// Frequency maximised at laptop size.
await openTool('Frequency');
await runIt();
await page.getByTestId('token-frequency-display-settings').waitFor({ timeout: 120000 });
await page.locator('svg text').first().waitFor({ timeout: 60000 });
await page.getByRole('button', { name: 'Maximise results' }).click();
await page.waitForTimeout(1200);
const settings = page.getByTestId('token-frequency-display-settings');
ok('maximised: settings row visible', await settings.isVisible());
const cloud = await page.locator('svg:has(text)').first().boundingBox();
console.log(`maximised 1024: cloudTop=${Math.round(cloud.y)} visibleCloudPx=${Math.max(0, Math.round(768 - cloud.y))}`);
await page.screenshot({ path: out('01-frequency-maximised-1024') });
await page.getByRole('button', { name: 'Edit list' }).click();
ok('maximised: Edit list opens the list', await page.getByRole('textbox', { name: /Stop words filter/ }).isVisible());
await page.getByRole('button', { name: 'Hide list' }).click();
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
ok('Esc restores: inputs visible again', await page.getByText('Data Blocks (1/2)').isVisible());

// Concordance Basic and Advanced.
await openTool('Concordance');
const adv = page.getByRole('switch', { name: 'Advanced settings' });
ok('Concordance has the Advanced switch', (await adv.count()) > 0);
const named = async () =>
  (await page.getByRole('spinbutton', { name: 'Left context (tokens)' }).isVisible()) &&
  (await page.getByRole('spinbutton', { name: 'Right context (tokens)' }).isVisible());
const basicChecked = await adv.isChecked();
ok(`context inputs named (${basicChecked ? 'Advanced' : 'Basic'})`, await named());
const box = async () => {
  const l = await page.getByRole('spinbutton', { name: 'Left context (tokens)' }).boundingBox();
  const r = await page.getByRole('spinbutton', { name: 'Right context (tokens)' }).boundingBox();
  return Math.abs(l.y - r.y) < 4 ? 'side by side' : 'stacked';
};
console.log(`${basicChecked ? 'Advanced' : 'Basic'} 1024 context inputs: ${await box()}`);
await page.screenshot({ path: out(`02-concordance-${basicChecked ? 'advanced' : 'basic'}-1024`) });
await adv.click();
await page.waitForTimeout(500);
ok(`context inputs named (${basicChecked ? 'Basic' : 'Advanced'})`, await named());
console.log(`${basicChecked ? 'Basic' : 'Advanced'} 1024 context inputs: ${await box()}`);
await page.screenshot({ path: out(`03-concordance-${basicChecked ? 'basic' : 'advanced'}-1024`) });
await adv.click();
await page.getByPlaceholder(/Enter word or phrase/).fill('housing');
await runIt();
const addProject = page.getByRole('button', { name: 'Add to Project' }).first();
await addProject.waitFor({ timeout: 120000 });
for (let i = 0; i < 40 && (await addProject.isDisabled()); i++) await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Maximise results' }).click();
await page.waitForTimeout(800);
await addProject.click();
const dialog = page.getByRole('dialog');
await dialog.waitFor();
await page.waitForTimeout(600);
const dtext = await dialog.innerText();
ok('maximised dialog keeps the row summary', dtext.includes('Each match becomes one row in the new Data Block.'));
const name = await dialog.getByRole('textbox').first().inputValue();
console.log(`dialog default name: ${name}`);
await page.screenshot({ path: out('04-concordance-dialog-maximised') });
await dialog.getByRole('button', { name: 'Cancel' }).click();
console.log('problems:', problems.length ? problems.join('\n') : 'none');
await browser.close();
