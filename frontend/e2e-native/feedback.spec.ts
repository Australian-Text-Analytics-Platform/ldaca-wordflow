import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';

it('opens independent native feedback windows without changing the project session', async () => {
  const status = await browser.tauri.execute(({ core }) => core.invoke('get_backend_status'));
  const labels = async () => (await browser.getWindowHandles()).filter(label => label.startsWith('feedback-'));
  const existing = new Set(await labels());
  try {
    await browser.$('button=Feedback').click();
    await browser.waitUntil(async () => (await labels()).length === existing.size + 1);
    await browser.$('button=Feedback').click();
    await browser.waitUntil(async () => (await labels()).length === existing.size + 2);
    expect(await browser.tauri.execute(({ core }) => core.invoke('get_backend_status'))).toEqual(status);
    await expect(browser.$('[role="dialog"][aria-label="Send feedback"]')).not.toExist();
  } finally {
    const created = (await labels()).filter(label => !existing.has(label));
    await browser.tauri.execute(async ({ core }, created) => {
      for (const label of created) await core.invoke('plugin:window|close', { label });
    }, created);
  }
});
