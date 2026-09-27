import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { baseUrl } from './fixtures';
import { quotationScenario } from '../e2e-native/scenarios/quotation';
it(
  'Quotation previews on demand and saves typed source-independent results with native extraction',
  async () => {
    await browser.url('/');
    await quotationScenario(baseUrl, 'browser_quotation');
  },
);
