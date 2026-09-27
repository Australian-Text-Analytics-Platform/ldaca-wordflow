import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { concordanceScenario } from './scenarios/concordance';
import { frequencyConcordanceScenario } from './scenarios/frequency';
it('clicking a native Frequency token opens a new Concordance tab and previews both corpora', async () => {
  const { url } = await browser.tauri.execute(
    ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
  );
  await frequencyConcordanceScenario(url, 'native_handoff');
});
it('native Concordance previews, saves, publishes and reopens retained results', async () => {
  const { url } = await browser.tauri.execute(
    ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
  );
  await concordanceScenario(url, 'native_concordance');
});
