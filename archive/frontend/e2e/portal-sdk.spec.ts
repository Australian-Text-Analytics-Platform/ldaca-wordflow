import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

test.skip(!process.env.WORDFLOW_SDK_ACCEPTANCE, 'Requires the synthetic SDK ONI server.');

async function state(page: Page, url: string): Promise<string> {
  const result = (await (await page.request.get(url)).json()) as { state: string };
  return result.state;
}

async function download(page: Page, query?: string) {
  await page.getByRole('button', { name: 'Import from LDaCA', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from LDaCA' });
  if (query) {
    await dialog.getByLabel('Search', { exact: true }).fill(query);
    await dialog.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(dialog.getByRole('link', { name: query, exact: true })).toBeVisible();
  } else {
    await expect(dialog.getByText('Staff Picks', { exact: true })).toBeVisible();
    await expect(
      dialog.getByRole('link', { name: 'Australian Conversation Corpus', exact: true }),
    ).toBeVisible();
  }
  const accepted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/data-portal/imports'),
  );
  await dialog.getByRole('button', { name: 'Download', exact: true }).click();
  const response = await accepted;
  expect(response.status()).toBe(202);
  const location = response.headers().location;
  if (!location) throw new Error('Import response is missing Location');
  await expect(dialog).toBeHidden();
  return new URL(location, response.url()).href;
}

test('SDK featured collections, search, public import, failure and cancellation', async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Data Loader' })).toBeVisible({
    timeout: 120_000,
  });
  const hints = page.getByRole('button', { name: 'Disable Hints', exact: true });
  await expect(hints).toBeVisible();
  await hints.click();
  await page
    .getByRole('alertdialog', { name: 'Disable contextual hints?' })
    .getByRole('button', { name: 'Disable Hints' })
    .click();
  const successful = await download(page);
  await expect.poll(() => state(page, successful)).toBe('succeeded');
  await expect(page.getByTestId('folder-row-LDaCA/Australian Conversation Corpus')).toBeVisible();
  const failure = await download(page, 'sdk-failure');
  await expect.poll(() => state(page, failure)).toBe('failed');
  const slow = await download(page, 'sdk-slow');
  await expect.poll(() => state(page, slow)).toBe('running');
  await page
    .getByRole('button', { name: 'Task: data portal import. Expand details', exact: true })
    .filter({ has: page.getByRole('progressbar') })
    .click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect.poll(() => state(page, slow)).toBe('cancelled');
});
