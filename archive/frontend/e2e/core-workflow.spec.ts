import { readFile } from 'node:fs/promises';

import type { Page } from '@playwright/test';

import { createWorkspace, expect, test } from './fixtures';

const csvFixtureUrl = new URL('./fixtures/workflow.csv', import.meta.url);

async function addDataBlock(page: Page, dataBlockName: string) {
  await page.getByRole('button', { name: 'Add data block' }).click();
  await page.getByPlaceholder('Search data blocks…').fill(dataBlockName);
  await page.getByRole('button', { name: dataBlockName, exact: true }).click();
}

async function selectColumn(page: Page, label: string, column: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: column, exact: true }).click();
}

test('runs the core data and analysis workflow', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `${String(testInfo.repeatEachIndex)}-${String(testInfo.retry)}`;
  const workspaceName = `Golden workflow ${suffix}`;
  const filename = `workflow-${suffix}.csv`;
  const sourceName = `workflow-${suffix}`;
  const derivedName = `first-four-${suffix}`;

  await createWorkspace(page, workspaceName);

  await page.getByLabel('Upload files', { exact: true }).setInputFiles({
    name: filename,
    mimeType: 'text/csv',
    buffer: await readFile(csvFixtureUrl),
  });
  const fileRow = page.getByTestId(`file-row-${filename}`);
  await expect(fileRow).toBeVisible();

  await fileRow.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('dialog', { name: `Preview: ${filename}` })).toContainText(
    'the cat sat on the mat',
  );
  await page.keyboard.press('Escape');

  await fileRow.getByRole('button', { name: 'Add' }).click();
  const addDialog = page.getByRole('dialog', { name: `Add File: ${filename}` });
  await expect(addDialog).toContainText('Preview (first rows)');
  await addDialog.getByRole('button', { name: 'Add to Project' }).click();
  await expect(page.getByText(sourceName, { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Preprocessing', exact: true }).click();
  await page.getByRole('tab', { name: 'Sample', exact: true }).click();
  await addDataBlock(page, sourceName);
  await expect(page.getByRole('spinbutton', { name: 'Offset', exact: true })).toBeEnabled();
  await page.getByRole('spinbutton', { name: 'Offset', exact: true }).fill('0');
  await page.getByRole('spinbutton', { name: 'Length', exact: true }).fill('4');
  await page.getByRole('textbox', { name: 'New data block name', exact: true }).fill(derivedName);
  await expect(page.getByRole('button', { name: 'Create Data Block' })).toBeEnabled();
  await page.getByRole('button', { name: 'Create Data Block' }).click();
  const sliceCreated = page.getByRole('alertdialog');
  await expect(sliceCreated).toContainText(`Slice created: ${derivedName}`);
  await sliceCreated.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText(derivedName, { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Frequency', exact: true }).click();
  await addDataBlock(page, derivedName);
  await selectColumn(page, 'Text Column:', 'document');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('Token Frequency Results', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('tab', { name: 'List view' }).click();
  const frequencies = page.getByRole('list', { name: `${derivedName} token frequencies` });
  await expect(frequencies).toContainText('cat');

  await frequencies.getByRole('button', { name: 'cat', exact: true }).click();
  await expect(page.getByText('Concordance Search', { exact: true }).first()).toBeVisible();
  await expect(page.getByPlaceholder('Enter word or phrase to search for')).toHaveValue('cat');
  await page.getByRole('button', { name: 'Run All', exact: true }).click();
  await expect(page.getByText(/Found 4 matches in 4 documents/)).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole('button', { name: 'Trends', exact: true }).click();
  await addDataBlock(page, derivedName);
  await selectColumn(page, 'Time/Numeric Column *', 'sequence');
  await page.getByPlaceholder('e.g. 10').fill('1');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('Trends and Sequence Results', { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await addDataBlock(page, derivedName);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export 1 Data Block', exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('Playwright did not retain the downloaded file.');
  expect(download.suggestedFilename()).toBe(`${derivedName}.csv`);
  const exported = (await readFile(downloadPath, 'utf8')).trim().split(/\r?\n/);
  expect(exported).toEqual([
    'document,date,group,sequence',
    'the cat sat on the mat,2024-01-01,A,1',
    'the dog sat beside the cat,2024-01-02,A,2',
    'the cat watched the bird,2024-01-03,B,3',
    'the bird watched the cat,2024-01-04,B,4',
  ]);
});
