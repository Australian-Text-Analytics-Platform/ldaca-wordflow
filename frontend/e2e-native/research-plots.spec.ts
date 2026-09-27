import { trendsRenderingScenario } from './scenarios/trendsRendering';
import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { researchPlotScenario } from './scenarios/researchPlots';
for (const mode of ['trends', 'compare', 'scatter', 'heatmap', 'sankey'] as const) {
  it(`native representative file import, ${mode} controls, selections and publication`, async function () {
    this.timeout(180000);
    const { url } = await browser.tauri.execute(
      ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
    );
    await researchPlotScenario(url, 'native_research', mode);
  });
}

it('native CSV import and datetime conversion feeds Trends', async function () {
  this.timeout(180000);
  const { url } = await browser.tauri.execute(
    ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
  );
  await researchPlotScenario(url, 'native_research_csv', 'trends', 'community-survey.csv');
});

it('native dense Trends lines, non-overlapping ticks and bounded Calendar months', async function () {
  this.timeout(180000);
  const { url } = await browser.tauri.execute(
    ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
  );
  await trendsRenderingScenario(url, 'native');
});
