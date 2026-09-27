import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { hover, role, text, label, post, checked, rect, press, screenshot } from './fixtures';

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

it('desktop keeps the three panes, imports inline, and reopens embedded data', async () => {
  const testDirectory = process.env.WORDFLOW_E2E_TEMP_DIR;
  if (!testDirectory) throw new Error('Missing runner-owned temporary directory');
  const dir = await mkdtemp(join(testDirectory, 'project-'));
  const project = join(dir, 'test.wfpj');
  const source = join(dir, 'source.csv');
  const requested: string[] = [];
  const errors: string[] = [];
  await browser.sessionSubscribe({ events: ['log.entryAdded', 'network.beforeRequestSent'] });
  browser.on('log.entryAdded', (entry) => {
    if (entry.type === 'javascript' && entry.level === 'error')
      errors.push(entry.text ?? 'JavaScript error');
  });
  browser.on('network.beforeRequestSent', ({ request }) => {
    if (new URL(request.url).pathname.startsWith('/api/'))
      requested.push(new URL(request.url).pathname);
  });
  try {
    await writeFile(source, 'x,text\n1,first\n2,second\n');
    await browser.url('/');
    await expect(role('heading', { name: 'Data Loader', exact: true })).toBeDisplayed();
    const graph = label('Data Block graph', { exact: true });
    const split = role('separator', { name: 'Resize graph and data panels' });
    await expect(split).not.toExist();
    const fullGraphHeight = await (await graph.getElement()).execute(
      (element) => element.getBoundingClientRect().height,
    );
    await screenshot('/tmp/wordflow-graph-no-selection.png');
    await expect(role('button', { name: 'Preprocessing', exact: true })).toBeEnabled();
    await expect(role('button', { name: 'Frequency', exact: true })).toBeEnabled();
    await expect(role('tab', { name: 'LDaCA', exact: true })).toBeDisplayed();
    await expect(role('button', { name: 'SQL console' })).not.toExist();
    await role('button', { name: 'Open settings' }).click();
    const settings = role('dialog', { name: 'Settings', exact: true });
    await expect(settings).toBeDisplayed();
    await checked(role('switch', { name: 'Use Dark 2026 theme' }, settings), true);
    await expect(browser.$('html')).toHaveAttribute('data-theme', 'dark-2026');
    await screenshot('/tmp/wordflow-native-settings.png');
    await checked(role('switch', { name: 'Use Dark 2026 theme' }, settings), false);
    await role('button', { name: 'Close', exact: true }, settings).click();
    await label('Data file path').setValue(source);
    await role('button', { name: 'Choose files…' }).click();
    await expect(role('textbox', { name: 'Data Block name' })).not.toExist();
    await expect(role('button', { name: 'Select source', exact: true })).toBeDisplayed();
    await expect(split).not.toExist();
    await role('button', { name: 'Select source', exact: true }).click();
    await expect(role('cell', { name: 'first', exact: true })).toBeDisplayed();
    await expect(role('heading', { name: 'Data View', exact: true })).not.toExist();
    await expect(role('button', { name: 'Data Viewer', exact: true })).not.toExist();
    await expect(split).toBeDisplayed();
    await press('ArrowDown', split);
    const savedRatio = await split.getAttribute('aria-valuenow');
    await browser.waitUntil(
      async () => Math.abs((await rect(graph)).height - fullGraphHeight) < 0.5,
    );
    await role('button', { name: 'Close preview', exact: true }).click();
    await expect(split).not.toExist();
    await expect(role('button', { name: 'Sort by x' })).not.toExist();
    await browser.waitUntil(
      async () => Math.abs((await rect(graph)).height - fullGraphHeight) < 0.5,
    );
    await role('button', { name: 'Deselect source', exact: true }).click();
    await role('button', { name: 'Select source', exact: true }).click();
    await expect(split).toHaveAttribute('aria-valuenow', savedRatio ?? '');
    await expect(role('cell', { name: 'first', exact: true })).toBeDisplayed();
    await expect(
      text('Type: View', { exact: true }, browser.$('.react-flow__node')),
    ).toBeDisplayed();
    await hover(browser.$('.react-flow__node'));
    await expect(text('Columns: 2', {}, browser.$('.react-flow__node'))).toBeDisplayed();
    await expect(role('button', { name: 'Rename project', exact: true })).not.toExist();
    await screenshot('/tmp/wordflow-desktop-restored.png');
    // Recent-file dragging imports immediately without replacing the current preview.
    await (await label('Data Block graph').getElement()).execute((element, path) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('application/x-wordflow-file', path);
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    }, source);
    await expect(role('button', { name: 'Select source_2', exact: true })).toBeDisplayed();
    await expect(role('cell', { name: 'first', exact: true })).toBeDisplayed();
    await screenshot('/tmp/wordflow-desktop-import-inline.png');
    await rm(source);
    const saved = await post('/api/project/save', { path: project });
    expect(saved.ok).toBe(true);
    // Save As must keep the existing event subscription connected to new writes.
    const importedAfterSave = await post('/api/project/import', {
      sources: [{ table_name: 'after_save', sql: 'SELECT 42 AS value' }],
    });
    expect(importedAfterSave.ok).toBe(true);
    await expect(role('button', { name: 'Select after_save', exact: true })).toBeDisplayed();
    await expect(role('cell', { name: 'first', exact: true })).toBeDisplayed();
    await browser.refresh();
    await browser.$('[aria-label="Data Block graph"]').waitForExist();
    await role('button', { name: 'Select source', exact: true }).click();
    await expect(role('cell', { name: 'first', exact: true })).toBeDisplayed();
    expect(errors).toEqual([]);
    expect(requested.length).toBeGreaterThan(0);
    expect(requested.every((path) => path.startsWith('/api/project'))).toBe(true);
  } finally {
    // The launcher removes the saved project after the backend releases it.
    await rm(source, { force: true });
  }
});
