import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { baseUrl } from './fixtures';
import {
  requestCompatibilityScenario,
  compatibilityKinds,
} from '../e2e-native/scenarios/requestCompatibility';
for (const kind of compatibilityKinds)
  it(`requires explicit reset and preserves unsupported settings for ${kind}`, async function () {
    this.timeout(240000);
    await browser.url('/');
    await requestCompatibilityScenario(baseUrl, 'browser', kind);
  });
