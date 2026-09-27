import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browser, $, expect } from '@wdio/globals';
import { it } from 'mocha';
import { baseUrl, outputDir } from './fixtures';
import {
  plotsScenario,
  plotsBenchmark,
  plotsProjectionBenchmark,
} from '../e2e-native/scenarios/plots';
it('Plots restores all five native modes and independent named tabs', async function () {
  this.timeout(300000);
  await browser.url('/');
  await plotsScenario(baseUrl, 'browser-plots');
  await verifyPlotDownloads();
  if (process.env.PLOTS_BENCHMARK) await plotsBenchmark(baseUrl);
  if (process.env.PLOTS_PROJECTION_BENCHMARK) await plotsProjectionBenchmark(baseUrl);
});

async function verifyPlotDownloads() {
  for (const format of ['svg', 'png', 'jpeg']) {
    const file = resolve(outputDir, 'downloads', `plot_fixture_trends.${format}`);
    await rm(file, { force: true });
    await $('button[aria-label="Download chart"]').click();
    await $('[aria-label="Chart download format"]').click();
    await $(`[role="option"]=${format.toUpperCase()}`).click();
    await $('[role="dialog"]').$('button=Download').click();
    await browser.waitUntil(
      async () => {
        try {
          return (await readFile(file)).length > 100;
        } catch {
          return false;
        }
      },
      { timeout: 20000 },
    );
    const bytes = await readFile(file);
    if (format === 'svg') {
      expect(bytes.toString()).toContain('plot_fixture');
      expect(bytes.toString()).toContain('Interval:');
    } else if (format === 'png') expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    else expect([...bytes.subarray(0, 2)]).toEqual([255, 216]);
  }
}
