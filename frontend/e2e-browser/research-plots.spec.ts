import { trendsRenderingScenario } from '../e2e-native/scenarios/trendsRendering';
import { browser, $, expect } from '@wdio/globals';
import { it } from 'mocha';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { baseUrl, outputDir } from './fixtures';
import { researchPlotScenario } from '../e2e-native/scenarios/researchPlots';

for (const mode of ['trends', 'compare', 'scatter', 'heatmap', 'sankey'] as const) {
  it(`imports representative files and configures, selects, publishes and exports ${mode}`, async function () {
    this.timeout(180000);
    await browser.url('/');
    await researchPlotScenario(baseUrl, 'browser_research', mode);
    const results = $('[aria-label="Plot results"]');
    await results.$('button[aria-label="Download chart"]').click();
    const dialog = $('[role="dialog"]');
    await dialog.$('[aria-label="Chart download format"]').click();
    await $('[role="option"]=SVG').click();
    const path = resolve(outputDir, 'downloads', `browser_research_${mode}_${mode}.svg`);
    await rm(path, { force: true });
    await dialog.$('button=Download').click();
    await browser.waitUntil(async () => {
      try {
        return (await readFile(path, 'utf8')).includes(`browser_research_${mode}`);
      } catch {
        return false;
      }
    });
    const svg = await readFile(path, 'utf8');
    expect(svg).toContain('<svg');
    expect(Number(/<svg[^>]*width="(\d+)"/.exec(svg)?.[1])).toBeGreaterThan(300);
    if (mode === 'trends') expect(svg).toContain('clipPath');
    expect(svg).toContain(mode === 'scatter' ? 'Individual rows' : mode === 'heatmap' ? 'Mean of measurement' : mode === 'compare' ? 'Sum of weight' : 'Rows');
    if (mode !== 'trends') expect(svg).not.toContain('Smooth curves');
    expect(svg).toContain('font-family');
  });
}

it('imports offset-bearing CSV dates, converts through Data View and runs Trends', async function () {
  this.timeout(180000);
  await browser.url('/');
  await researchPlotScenario(baseUrl, 'browser_research_csv', 'trends', 'community-survey.csv');
});

it('renders dense Trends lines, non-overlapping ticks and bounded Calendar months', async function () {
  this.timeout(180000);
  await browser.url('/');
  await trendsRenderingScenario(baseUrl, 'browser');
});
