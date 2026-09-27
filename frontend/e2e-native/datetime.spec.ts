import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { datetimeScenario } from './scenarios/datetime';
it('native datetime conversion infers offsets and requests manual formats only when needed', async () => {
  const { url } = await browser.tauri.execute(({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>);
  await datetimeScenario(url);
});
