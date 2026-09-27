import { expect, test as base, type Page } from '@playwright/test';

export async function createWorkspace(page: Page, name: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Data Loader' })).toBeVisible();
  const disableHints = page.getByRole('button', { name: 'Disable Hints' });
  if (await disableHints.isVisible()) {
    await disableHints.click();
    await page.getByRole('alertdialog', { name: 'Disable contextual hints?' })
      .getByRole('button', { name: 'Disable Hints' }).click();
  }
  const activeWorkspace = page.getByTestId('active-workspace-card');
  if (await activeWorkspace.isVisible()) {
    await activeWorkspace.getByRole('button', { name: 'Unload', exact: true }).click();
  }
  await page.getByPlaceholder('Project name').fill(name);
  await page.getByTestId('create-workspace-card')
    .getByRole('button', { name: 'Create project', exact: true })
    .filter({ hasText: 'Create project' }).click();
  await expect(activeWorkspace).toContainText(name);
}

export const test = base.extend<{ runtimeErrors: boolean }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      const recordPageError = (error: Error) => {
        errors.push(`Unhandled page error: ${error.message}`);
      };
      const recordConsoleError = (message: {
        type(): string;
        text(): string;
        location(): { url?: string };
      }) => {
        if (message.type() === 'error') {
          // MediaPipe writes this successful native initialization message to stderr.
          if (message.text() === 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.') return;
          const source = message.location().url;
          errors.push(`Console error${source ? ` (${source})` : ''}: ${message.text()}`);
        }
      };

      page.on('pageerror', recordPageError);
      page.on('console', recordConsoleError);
      await use(true);
      page.off('pageerror', recordPageError);
      page.off('console', recordConsoleError);

      expect(errors, 'The page should not emit unhandled runtime errors.').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
