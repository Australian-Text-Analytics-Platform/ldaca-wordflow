import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { requestCompatibilityScenario, compatibilityKinds } from './scenarios/requestCompatibility';
for (const kind of compatibilityKinds)
  it(`native restores compatible settings with safe warnings for ${kind}`, async function () {
    this.timeout(240000);
    const { url } = await browser.tauri.execute(
      ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
    );
    await requestCompatibilityScenario(url, 'native', kind);
  });
