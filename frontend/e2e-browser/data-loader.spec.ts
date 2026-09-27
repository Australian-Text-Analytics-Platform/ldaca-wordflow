import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { role, label, testId, checked, screenshot, stubResponse, rect, press } from './fixtures';

for (const theme of ['light-2026', 'dark-2026']) {
  it(`Data Loader imports immediately and keeps source navigation and recent files readable in ${theme}`, async () => {
    const temp = process.env.WORDFLOW_E2E_TEMP_DIR;
    if (!temp) throw new Error('Missing runner-owned temporary directory');
    const dir = await mkdtemp(join(temp, 'loader-'));
    const name = `long_named_text_collection_for_testing_${theme}`;
    const path = join(dir, `${name}.csv`);
    await writeFile(path, 'id,text,author\n1,hello,Alice\n2,world,Bob\n');
    const jsonPath = join(dir, 'research_metadata.json');
    const tsvPath = join(dir, 'research_notes.tsv');
    await writeFile(jsonPath, JSON.stringify([{id:1, title:'Research metadata'}]));
    await writeFile(tsvPath, 'id\ttext\n1\tResearch notes\n');
    try {
      await browser.addInitScript((value) => { localStorage.setItem('ldaca-color-theme-v1', value); }, theme);
      await stubResponse('/api/project/samples', () => JSON.stringify({ commit: 'a'.repeat(40), collections: [{ id: 'sample', name: 'Example text collection', description: 'Text and accompanying metadata.', total_size_bytes: 32000, files: [{ path: 'sample/text.parquet' }, { path: 'sample/metadata.parquet' }] }] }));
      await stubResponse('/api/project/ldaca/search', () => JSON.stringify({ items: [{ id: 'example', title: 'Example research corpus', description: 'A collection description with source information available before importing.', license: 'CC BY 4.0', file_formats: ['text/plain'], access: ['Open'], collections: ['Research'], types: ['Dataset'], importable: true }] }));
      await browser.setWindowSize(1600, 1000);
      await browser.addInitScript((paths) => { localStorage.setItem('wordflow.desktop.recentDataFiles', JSON.stringify(paths)); }, [jsonPath, tsvPath]);
      await browser.url('/');
      await expect(role('tab', { name: 'Local files' })).toHaveAttribute('aria-selected', 'true');
      await screenshot(`loader-empty-${theme}.png`);
      await label('Data file path').setValue(path);
      await role('button', { name: 'Choose files…' }).click();
      await expect(role('button', { name: `Select ${name}`, exact: true })).toBeDisplayed();
      await expect(testId('local-import-file')).not.toExist();
      await expect(testId('project-data-overlay')).not.toExist();
      const recent = role('button', { name: `Import ${name}.csv`, exact: true });
      await expect(recent).toHaveText(expect.stringContaining('41 B'));
      expect((await rect(recent)).height).toBeGreaterThan(48);
      await expect(recent.$('img')).toHaveAttribute('src', '/icons/material/table.svg');
      await role('tab', { name: 'Samples' }).click();
      await checked(role('checkbox', { name: 'Example text collection', exact: true }), true);
      await screenshot(`loader-samples-${theme}.png`);
      await role('tab', { name: 'LDaCA', exact: true }).click();
      await role('textbox', { name: 'Search', exact: true }).setValue('example');
      await role('button', { name: 'Search', exact: true }).click();
      await expect(role('article', { name: 'Example research corpus' })).toBeDisplayed();
      await role('button', { name: 'Details', exact: true }).click();
      await screenshot(`loader-ldaca-${theme}.png`);
      await role('button', { name: 'Preprocessing', exact: true }).click();
      await role('button', { name: 'Data Loader', exact: true }).click();
      await expect(role('textbox', { name: 'Search', exact: true })).toHaveValue('example');
      await role('tab', { name: 'Local files' }).click();
      await expect(recent).toBeDisplayed();
      await recent.click();
      await expect(role('button', {name:`Select ${name}_2`, exact:true})).toBeDisplayed();
      // Both drop destinations use the one window-level drop owner and import directly.
      for (const [index, target] of ['loader', 'graph'].entries()) {
        await browser.$(`[data-project-file-drop="${target}"]`).execute((element, source) => {
          const dataTransfer = new DataTransfer(); dataTransfer.setData('application/x-wordflow-file', String(source));
          element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
        }, path);
        await expect(role('button', {name:`Select ${name}_${String(index + 3)}`, exact:true})).toBeDisplayed();
      }
      await expect(role('button', {name:`Select ${name}_5`, exact:true})).not.toExist();
      await expect(testId('project-data-overlay')).not.toExist();
      await screenshot(`loader-files-${theme}.png`);
      await press('End', role('separator', { name: 'Resize right panel' }));
      await browser.waitUntil(async () => (await rect(browser.$('[data-project-file-drop="loader"]'))).width < 400);
      await browser.$('main').waitForStable();
      const workspace = browser.$('[data-project-file-drop="loader"]');
      expect(await workspace.execute((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await screenshot(`loader-narrow-${theme}.png`);
      await expect(testId('project-data-overlay')).not.toExist();
      await role('tab', { name: 'Samples' }).click();
      await expect(role('checkbox', { name: 'Example text collection', exact: true })).toHaveAttribute('aria-checked', 'true');
      await expect(role('tab', { name: 'Local files' })).toBeEnabled();
      await screenshot(`loader-samples-narrow-${theme}.png`);
      await press('ArrowRight', role('tab', { name: 'Samples' }));
      await expect(role('tab', { name: 'LDaCA', exact: true })).toHaveAttribute('aria-selected', 'true');
      await screenshot(`loader-ldaca-narrow-${theme}.png`);
    } finally { await rm(dir, { recursive: true, force: true }); await browser.setWindowSize(1280, 900); }
  });
}
