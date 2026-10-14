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
it('Concordance previews on demand, saves typed matches, publishes live documents and resolves a restored source after reopen', async () => {
  await browser.url('/');
  await concordanceScenario(baseUrl, 'browser_concordance');
  const results = $('[aria-label="Concordance results"]');
  await results.$('button=Column order').click();
  await $('[aria-label="Move matched_text up"]').click();
  await browser.keys('Escape');
  const resultFile = resolve(outputDir, 'downloads', 'results.json');
  await rm(resultFile, { force: true });
  await results.$('button=Download').click();
  await $('button=JSON').click();
  await browser.waitUntil(async () => {
    try {
      return JSON.parse(await readFile(resultFile, 'utf8')).length === 4;
    } catch {
      return false;
    }
  });
  const exported = JSON.parse(await readFile(resultFile, 'utf8')) as Record<string, unknown>[];
  expect(exported.map((row) => row.text)).toEqual([
    '😀 cat cat dog',
    '😀 cat cat dog',
    'cat fresh',
    '猫 cat',
  ]);
  expect(Object.keys(exported[0] ?? {}).indexOf('matched_text')).toBeLessThan(
    Object.keys(exported[0] ?? {}).indexOf('left_context'),
  );
  await browser.keys('Escape');
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
