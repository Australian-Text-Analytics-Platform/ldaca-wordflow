import { createWorkspace, expect, test } from './fixtures';

test('opens in single-user mode and renders every function view', async ({ page }, testInfo) => {
  await createWorkspace(page, `Navigation smoke ${String(testInfo.retry)}`);

  const views = [
    ['Data Loader', 'Data Loader'],
    ['Preprocessing', 'Data Preprocessing'],
    ['Frequency', 'Token Frequency Analysis'],
    ['Concordance', 'Concordance Search'],
    ['Trends', 'Trends and Sequence'],
    ['Topic Modelling', 'Topic Modelling'],
    ['Quotation', 'Quotation Extraction'],
    ['Annotation', 'Annotation'],
    ['Export', 'Export Data Blocks'],
  ] as const;

  for (const [navigationLabel, panelText] of views) {
    await page.getByRole('button', { name: navigationLabel, exact: true }).click();
    await expect(page.getByText(panelText, { exact: true }).first()).toBeVisible();
  }
});
