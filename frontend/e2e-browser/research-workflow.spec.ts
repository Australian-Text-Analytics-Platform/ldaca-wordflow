import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { baseUrl } from './fixtures';
import { researchWorkflow } from '../e2e-native/scenarios/researchWorkflow';
it('joins real research files with missing/duplicate keys, analyses and publishes the original rows', async function () {
  this.timeout(180000);
  await browser.url('/');
  await researchWorkflow(baseUrl);
});
