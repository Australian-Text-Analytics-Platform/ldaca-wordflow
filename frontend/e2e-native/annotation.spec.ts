import { it } from 'mocha';
import { browser } from '@wdio/globals';
const base = async () =>
  (
    await browser.tauri.execute(
      ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
    )
  ).url;
import { annotationManualScenario } from './scenarios/annotation';
it('Manual Annotation imports realistic files and preserves staged edits', async () =>
  annotationManualScenario(await base()));

import { annotationAiScenario } from './scenarios/annotation';
import { annotationProvider } from './scenarios/annotationProvider';
it('AI Annotation calls a local provider and retains staged corrections', async function () {
  this.timeout(180000);
  const provider = await annotationProvider();
  try {
    await annotationAiScenario(await base(), provider);
  } finally {
    await provider.close();
  }
});
// Explicit live acceptance uses the OS model, never a cloud provider or real user data.
(process.env.WORDFLOW_TEST_APPLE_AI === '1' ? it : it.skip)(
  'Apple Foundation Models Preview and Run',
  async function () {
    this.timeout(180000);
    await annotationAiScenario(await base());
  },
).timeout(180_000);
