import { createWorkspace, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

async function addDataBlock(page: Page, dataBlockName: string) {
  await page.getByRole('button', { name: 'Add data block' }).click();
  await page.getByPlaceholder('Search data blocks…').fill(dataBlockName);
  await page.getByRole('button', { name: dataBlockName, exact: true }).click();
}

async function selectColumn(page: Page, label: string, column: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: column, exact: true }).click();
}


test('native quotation preview, saved review and workspace creation', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const sourceName = `quotation-${String(testInfo.repeatEachIndex)}-${String(testInfo.retry)}`;
  const filename = `${sourceName}.csv`;
  await createWorkspace(page, `Native quotation acceptance ${sourceName}`);
  await page.getByLabel('Upload files', { exact: true }).setInputFiles({
    name: filename, mimeType: 'text/csv',
    buffer: Buffer.from('document\n"José said, “The project will finish tomorrow morning.”"\n"According to Alice, the project will finish tomorrow morning."\n'),
  });
  const file = page.getByTestId(`file-row-${filename}`);
  await expect(file).toBeVisible({ timeout: 120_000 });
  await file.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('dialog', { name: `Add File: ${filename}` }).getByRole('button', { name: 'Add to Workspace' }).click();
  await page.getByRole('button', { name: 'Quotation', exact: true }).click();
  await addDataBlock(page, sourceName);
  await selectColumn(page, 'Text Column:', 'document');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByText('Search Results', { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('José', { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  await page.reload();
  await expect(page.getByText('José', { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Run All', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Matches', exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('radio', { name: 'Matches', exact: true }).check();
  await expect(page.getByText('José', { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  await page.getByRole('radio', { name: 'Documents', exact: true }).check();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Documents', exact: true })).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Add to Workspace', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Quotation Results to Workspace' });
  await expect(dialog).toBeVisible({ timeout: 120_000 });
  await dialog.getByRole('button', { name: 'Add to Workspace', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`${sourceName}_quotation`, { exact: true }).first()).toBeVisible({ timeout: 60_000 });
});
