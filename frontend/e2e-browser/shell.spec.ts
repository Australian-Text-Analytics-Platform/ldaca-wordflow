import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { Key } from 'webdriverio';
import { post, role, screenshot, testId } from './fixtures';

it('fits Tools, resizes from its visible height and keeps bundled Help anchors below the pinned header', async () => {
  await browser.url('/');
  const created = await post('/api/project/sql', { response: 'command', script: "CREATE TABLE data.documents AS SELECT 'A complete document 日本語' AS body, 1 AS n; INSERT INTO wordflow.nodes(table_name) VALUES ('documents')" });
  if (!created.ok) throw new Error(await created.text());
  await browser.refresh();
  await role('button', { name: 'Select documents', exact: true }).click();
  for (const [name, short] of [['Data Loader', 'Loader'], ['Data Builder', 'Builder'], ['Topic Modelling', 'Topics']] as const) {
    await expect(role('button', { name, exact: true })).toHaveText(short);
  }
  await expect(role('heading', { name: 'Data Loader', exact: true })).toBeDisplayed();
  await expect(role('heading', { name: 'Editor', exact: true })).toExist();
  const tools = testId('sidebar-section-tools');
  const dimensions = await tools.execute((element) => ({
    height: element.getBoundingClientRect().height,
    content: element.scrollHeight,
  })) as { height: number; content: number };
  expect(dimensions.height).toBeGreaterThan(120);
  expect(dimensions.height).toBeLessThan(480);
  const resize = role('separator', { name: 'Resize Data Blocks', exact: true });
  await resize.execute((element) => element.focus());
  await browser.keys(Key.ArrowDown);
  const after = await tools.getSize('height');
  expect(after).toBeGreaterThan(dimensions.height);
  expect(after - dimensions.height).toBeLessThan(35);
  await role('button', { name: 'Clear selection', exact: true }, browser.$('.react-flow__controls')).click();
  await role('button', { name: 'Fit view', exact: true }).click();
  await role('button', { name: 'Use box selection', exact: true }).click();
  const bounds = await browser.$('.react-flow__node[data-id="documents"]').execute((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left - 6, top: rect.top - 6, right: rect.right + 6, bottom: rect.bottom + 6 };
  }) as { left: number; top: number; right: number; bottom: number };
  await browser.performActions([{ type: 'pointer', id: 'selection', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', duration: 0, x: Math.round(bounds.right), y: Math.round(bounds.bottom) },
    { type: 'pointerDown', button: 0 },
    { type: 'pointerMove', duration: 500, x: Math.round(bounds.left), y: Math.round(bounds.top) },
    { type: 'pointerUp', button: 0 },
  ] }]);
  await expect(role('button', { name: 'Deselect documents', exact: true })).toExist();
  await role('button', { name: 'Use pan mode', exact: true }).click();
  await role('separator', { name: 'Resize right panel', exact: true }).execute((element) => element.focus());
  for (let step = 0; step < 5; step += 1) await browser.keys(Key.ArrowLeft);
  await role('button', { name: 'Fit view', exact: true }).click();
  await screenshot('v07-shell-light.png');
  await role('button', { name: 'Help', exact: true }).click();
  const dialog = role('dialog', { name: 'Help', exact: true });
  await expect(dialog.$('#help-tutorial-index')).toHaveText('Wordflow Help');
  await expect(testId('partner-logos').$$('img')).toBeElementsArrayOfSize(5);
  await browser.waitUntil(async () => testId('partner-logos').execute((element) =>
    Array.from(element.querySelectorAll('img')).every((image) => image.complete && image.naturalWidth > 0),
  ));
  await role('link', { name: 'Interface', exact: false }, dialog).click();
  await expect(dialog.$('#help-ui-overview')).toHaveText('Interface');
  await role('link', { name: 'How Preview, Run and Clear work', exact: true }, dialog).click();
  const target = dialog.$('#help-analysis-lifecycle');
  await browser.waitUntil(async () => target.execute((element) => {
    const header = element.closest('main')?.previousElementSibling;
    return !!header && element.getBoundingClientRect().top >= header.getBoundingClientRect().bottom - 1;
  }));
  await screenshot('v07-help-light.png');
  await browser.execute(() => { document.documentElement.dataset.theme = 'dark-2026'; document.documentElement.style.colorScheme = 'dark'; });
  await screenshot('v07-help-dark.png');
  await role('button', { name: 'Close', exact: true }, dialog).click();
  await screenshot('v07-shell-dark.png');
  await browser.execute(() => { document.documentElement.dataset.theme = 'light-2026'; document.documentElement.style.colorScheme = 'light'; });
});
