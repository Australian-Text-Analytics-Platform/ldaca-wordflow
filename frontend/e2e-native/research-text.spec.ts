import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { researchTextScenario, researchQuotationScenario } from './scenarios/researchText';
for (const [label, scenario] of [
  ['Frequency and Concordance', researchTextScenario],
  ['Quotation', researchQuotationScenario],
] as const) {
  it(`native imported research documents exercise ${label}`, async function () {
    this.timeout(180000);
    const { url } = await browser.tauri.execute(
      ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
    );
    await scenario(url, 'native_discourse');
  });
}
