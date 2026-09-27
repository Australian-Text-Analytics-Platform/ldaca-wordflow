import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { baseUrl } from './fixtures';
import { annotationManualScenario } from '../e2e-native/scenarios/annotation';
it('Manual Annotation imports realistic files and preserves staged edits', async function () {
  this.timeout(180000);
  await browser.url('/');
  await annotationManualScenario(baseUrl);
});

import { annotationAiScenario } from '../e2e-native/scenarios/annotation';
import { annotationProvider } from '../e2e-native/scenarios/annotationProvider';
it('AI Annotation uses a real local provider and retains correction drafts through Clear', async function () {
  this.timeout(180000);
  const provider = await annotationProvider();
  try {
    await browser.url('/');
    await annotationAiScenario(baseUrl, provider);
    if (provider.requests() < 2) throw new Error('Preview and Run must both perform inference');
  } finally {
    await provider.close();
  }
});
