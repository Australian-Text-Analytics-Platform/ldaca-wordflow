import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browser, $, expect } from '@wdio/globals';
import { it } from 'mocha';
import { baseUrl, outputDir } from './fixtures';
import { concordanceScenario } from '../e2e-native/scenarios/concordance';
import { frequencyConcordanceScenario } from '../e2e-native/scenarios/frequency';
it('clicking a Frequency token opens a new Concordance tab and previews both corpora', async () => {
  await browser.url('/');
  await frequencyConcordanceScenario(baseUrl, 'browser_handoff');
});
it('Concordance previews on demand, saves typed matches, publishes documents and reopens independently of its source', async () => {
  await browser.url('/');
  await concordanceScenario(baseUrl, 'browser_concordance');
  const results = $('[aria-label="Concordance results"]');
  await results.$('button=Dispersion').click();
  for (const format of ['svg', 'png', 'jpeg']) {
    const destination = resolve(outputDir, 'downloads', `concordance-line.${format}`);
    await rm(destination, { force: true });
    await results.$('button[aria-label="Download chart"]').click();
    const dialog = $('[role="dialog"][data-state="open"]');
    await dialog.$('[aria-label="Chart download format"]').click();
    await $(`[role="option"]=${format.toUpperCase()}`).click();
    await dialog.$('button=Download').click();
    await dialog.waitForExist({ reverse: true });
    await browser.waitUntil(async () => {
      try {
        return (await readFile(destination)).length > 100;
      } catch {
        return false;
      }
    });
    const bytes = await readFile(destination);
    if (format === 'svg') {
      expect(bytes.toString()).toContain('Complete saved result');
      expect(bytes.toString()).toContain('cat (4)');
      expect(bytes.toString()).toContain('browser_concordance_documents');
    } else {
      expect([...bytes.subarray(0, 2)]).toEqual(format === 'png' ? [137, 80] : [255, 216]);
    }
  }
});
