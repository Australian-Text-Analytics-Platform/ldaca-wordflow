import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { quotationScenario } from './scenarios/quotation';
it(
  'native Quotation previews, saves, publishes and reopens retained documents',
  async () => {
    const { url } = await browser.tauri.execute(
      ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
    );
    await quotationScenario(url, 'native_quotation');
  },
);
