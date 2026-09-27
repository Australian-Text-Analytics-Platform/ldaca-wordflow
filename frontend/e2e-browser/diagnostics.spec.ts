import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { sessionErrorsScenario } from './diagnosticsScenario';

it('session diagnostics retains errors for E2E after history clear and reload', async () => {
  await browser.setViewport({ width: 680, height: 850 });
  await browser.url('/');
  await sessionErrorsScenario('browser');
});
