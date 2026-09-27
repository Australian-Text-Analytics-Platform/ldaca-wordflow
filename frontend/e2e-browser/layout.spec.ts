import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { layoutScenario } from '../e2e-native/scenarios/layout';
it('uses the normal pane layout by default and bounds explicit responsive sizes', async () => {
  await browser.url('/');
  await layoutScenario('browser');
});
