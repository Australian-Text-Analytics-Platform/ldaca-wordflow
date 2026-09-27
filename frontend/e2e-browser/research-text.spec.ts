import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { baseUrl } from './fixtures';
import {
  researchTextScenario,
  researchQuotationScenario,
} from '../e2e-native/scenarios/researchText';
it('imports research corpora for dense Frequency clouds and two-source Concordance', async function () {
  this.timeout(180000);
  await browser.url('/');
  await researchTextScenario(baseUrl, 'browser_discourse');
});
it('imports quotation documents, pages occurrences and publishes original metadata', async function () {
  this.timeout(180000);
  await browser.url('/');
  await researchQuotationScenario(baseUrl, 'browser_discourse');
});
