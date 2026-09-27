import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { researchWorkflow } from './scenarios/researchWorkflow';
it('native import, duplicate-key join, analysis and independent publication', async function () {
  this.timeout(180000);
  const { url } = await browser.tauri.execute(
    ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
  );
  await researchWorkflow(url);
});
