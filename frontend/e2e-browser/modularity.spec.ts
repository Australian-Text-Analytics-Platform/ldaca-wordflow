import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { baseUrl } from './fixtures';
import { directInputsAndBuilder, explicitSavedRequestReset } from '../e2e-native/scenarios/modularity';
it('direct input destinations and one-way builder preserve tool drafts', async () => {
  await browser.url('/');
  await directInputsAndBuilder(baseUrl);
});
it('Frequency creates its first tab and requires explicit reset before replacing unsupported JSON', async () => {
  await browser.url('/');
  await explicitSavedRequestReset(baseUrl);
});
