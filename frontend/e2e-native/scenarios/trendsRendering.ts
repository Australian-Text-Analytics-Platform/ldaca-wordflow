import { $, expect } from '@wdio/globals';
import * as api from '../../src/features/project/api';
import { setAnalysisPaneSize } from '../../e2e-browser/layout';
import { withResearchFile, prepareResearchVisit, addResearchInput, chooseColumn, runResearchAnalysis, researchScreenshot, setResearchTheme } from './researchData';

export async function trendsRenderingScenario(base: string, prefix: string) {
  await prepareResearchVisit();
  await withResearchFile('dense-trends.parquet', `${prefix}_dense`, async (source) => {
    await $('button=Plots').click();
    await $('[role="tablist"][aria-label="Plot modes"]').$('[role="tab"]=Trends').click();
    const panel = $('[data-testid="trends-workspace"]');
    if ((await api.listTabs(base, undefined, 'trends')).some((tab) => tab.analysis)) {
      await panel.$('button[aria-label="New tab"]').click();
    }
    await addResearchInput(panel, source);
    await chooseColumn('Axis', 'recorded_at', panel);
    await panel.$('button[aria-label="Add group"]').click();
    await chooseColumn('Group 1', 'topic', panel);
    const id = await runResearchAnalysis(base, 'trends', panel);
    const results = panel.$('[aria-label="Plot results"]');
    const chart = results.$('[data-testid="plot-chart"]');
    await chart.$('svg').waitForExist();
    const lines = () => chart.execute((element) => [...element.querySelectorAll('path')].filter((path) =>
      path.getAttribute('fill') === 'none' && path.getAttribute('stroke-width') === '2' &&
      (path.getAttribute('d') ?? '').includes('C') && !(path.getAttribute('d') ?? '').includes('NaN') &&
      !['none', 'transparent'].includes(path.getAttribute('stroke') ?? 'none') &&
      path.getBoundingClientRect().width > 10,
    ).length);
    expect(await lines()).toBe(8);
    // Make legend visibility the very first update, before zoom or normalization.
    await results.$('button[aria-pressed="true"]').click();
    expect(await lines()).toBe(7);
    await researchScreenshot(`${prefix}-dense-first-toggle`, results);
    await results.$('button[aria-pressed="false"]').click();
    expect(await lines()).toBe(8);
    await results.$('button=Zoom in').click();
    await results.$('button[aria-pressed="true"]').click();
    expect(await lines()).toBe(7);
    await results.$('button[aria-pressed="false"]').click();
    await results.$('button=Reset zoom').click();
    const checkLabels = async () => {
      const labels = await chart.execute((element) => [...element.querySelectorAll('text')]
        .filter((text) => /(?:Dec|Jan).*20(?:25|26)/.test(text.textContent))
        .map((text) => { const r = text.getBoundingClientRect(); return { left: r.left, right: r.right }; })
        .sort((a, b) => a.left - b.left)) as { left: number; right: number }[];
      expect(labels.length).toBeGreaterThan(1);
      labels.slice(1).forEach((label, i) => { expect(label.left).toBeGreaterThanOrEqual(labels[i]?.right ?? 0); });
    };
    await checkLabels();
    await setAnalysisPaneSize('narrow');
    await checkLabels();
    await researchScreenshot(`${prefix}-dense-narrow`, results);
    await setAnalysisPaneSize('normal');
    await chooseColumn('Plot presentation', 'calendar', results);
    await chooseColumn('Calendar year', '2025', results);
    await expect(results.$('label=Smooth curves')).not.toExist();
    const monthLabels = () => chart.execute((element) => [...element.querySelectorAll('text')]
      .map((text) => text.textContent).filter((text) => /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(text)));
    expect(await monthLabels()).toEqual(Array.from({ length: 8 }, () => 'Dec'));
    await researchScreenshot(`${prefix}-dense-calendar`, results);
    await results.$('button[aria-pressed="true"]').click();
    expect(await monthLabels()).toEqual(Array.from({ length: 7 }, () => 'Dec'));
    await chooseColumn('Calendar year', '2026', results);
    expect(await monthLabels()).toEqual(Array.from({ length: 7 }, () => 'Jan'));
    await setResearchTheme(true);
    await researchScreenshot(`${prefix}-dense-calendar-dark`, results);
    await setResearchTheme(false);
    expect((await api.listTabs(base, undefined, 'trends')).find((tab) => tab.analysis?.id === id)?.analysis?.id).toBe(id);
  });
}
