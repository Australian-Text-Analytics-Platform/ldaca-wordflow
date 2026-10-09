import { setTestPreferences } from './fixtures';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import * as projectApi from '@/features/project/api';
import { baseUrl, role, label, testId, checked, screenshot, stubResponse, rect, press } from './fixtures';

async function workbook() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="First" sheetId="1" r:id="rId1"/><sheet name="Second" sheetId="2" r:id="rId2"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
  for (const [index, value] of ['first', 'second'].entries()) {
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>document</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>${value}</t></is></c></row></sheetData></worksheet>`);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

it('imports mixed ZIP contents atomically with selected workbook sheets and reports skipped text', async () => {
  const temp = process.env.WORDFLOW_E2E_TEMP_DIR;
  if (!temp) throw new Error('Missing runner-owned temporary directory');
  const dir = await mkdtemp(join(temp, 'mixed-import-'));
  const archive = join(dir, 'corpus.zip');
  const zip = new JSZip();
  zip.file('z.txt', 'whole\nfile');
  zip.file('nested/a.md', '猫😀');
  zip.file('invalid.txt', Buffer.from([0xff]));
  zip.file('.hidden/secret.txt', 'hidden');
  zip.file('__MACOSX/hidden.txt', 'hidden');
  zip.file('nested.zip', 'not expanded');
  zip.file('records.csv', 'id,text\n1,table row\n');
  zip.file('book.xlsx', await workbook());
  await writeFile(archive, await zip.generateAsync({ type: 'nodebuffer' }));
  try {
    await browser.url('/');
    await label('Data file path').setValue(archive);
    await role('button', { name: 'Choose files…' }).click();
    await expect(role('region', { name: 'Choose import contents' })).toBeDisplayed();
    await expect(role('checkbox', { name: 'First', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(role('checkbox', { name: 'Second', exact: true })).toHaveAttribute('aria-checked', 'true');
    await role('checkbox', { name: 'First', exact: true }).click();
    await role('button', { name: 'Import selected', exact: true }).click();
    for (const name of ['corpus', 'records', 'book_Second']) {
      await expect(role('button', { name: `Select ${name}`, exact: true })).toBeDisplayed();
    }
    await expect(role('button', { name: 'Select book_First', exact: true })).not.toExist();
    await expect(browser.$('[data-testid="local-file-content"]')).toHaveText(expect.stringContaining('Invalid UTF-8 text'));
    const rows = await projectApi.querySql(baseUrl, [{ sql: 'SELECT file_path, document FROM data.corpus' }]);
    expect(rows.toArray().map((row) => ({ ...row }))).toEqual([
      { file_path: 'nested/a.md', document: '猫😀' },
      { file_path: 'z.txt', document: 'whole\nfile' },
    ]);
    const sheet = await projectApi.querySql(baseUrl, [{ sql: 'SELECT document FROM data.book_Second' }]);
    expect(sheet.getChild('document')?.get(0)).toBe('second');
    await screenshot('loader-mixed-zip.png');
    const folder = join(dir, 'texts');
    await mkdir(folder);
    await writeFile(join(folder, 'note.txt'), 'one whole document');
    await label('Data file path').setValue(folder);
    await role('button', { name: 'Choose files…' }).click();
    await expect(role('button', { name: 'Select texts', exact: true })).toBeDisplayed();
    await expect(role('region', { name: 'Choose import contents' })).not.toExist();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

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
      await setTestPreferences({ theme, recentDataFiles: [jsonPath, tsvPath] });
      await stubResponse('/api/project/samples', () => JSON.stringify({ commit: 'a'.repeat(40), collections: [{ id: 'sample', name: 'Example text collection', description: 'Text and accompanying metadata.', total_size_bytes: 32000, files: [{ path: 'sample/text.parquet' }, { path: 'sample/metadata.parquet' }] }] }));
      await stubResponse('/api/project/ldaca/browse', () => JSON.stringify({ items: [{ id: 'example', title: 'Example research corpus', description: 'A collection description with source information available before importing.', license: 'CC BY 4.0', file_formats: ['text/plain'], access: ['Open'], collections: ['Research'], types: ['Dataset'], importable: true }] }));
      await stubResponse('/api/project/ldaca/search', () => JSON.stringify({ items: [{ id: 'example', title: 'Example research corpus', description: 'A collection description with source information available before importing.', license: 'CC BY 4.0', file_formats: ['text/plain'], access: ['Open'], collections: ['Research'], types: ['Dataset'], importable: true }] }));
      await browser.setWindowSize(1600, 1000);
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
