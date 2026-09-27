import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { plotsScenario, plotsBenchmark, plotsProjectionBenchmark } from './scenarios/plots';
it('native Plots restores all five modes and independent named tabs', async function () {
  this.timeout(300000);
  const { url } = await browser.tauri.execute(
    ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
  );
  await plotsScenario(url, 'native-plots');
  if (process.env.PLOTS_BENCHMARK) await plotsBenchmark(url);
  if (process.env.PLOTS_PROJECTION_BENCHMARK) await plotsProjectionBenchmark(url);
});
