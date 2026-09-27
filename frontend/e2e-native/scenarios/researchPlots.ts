import { browser, $, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import * as api from '../../src/features/project/api';
import { setAnalysisPaneSize } from '../../e2e-browser/layout';
import {
  withResearchFile,
  readResearchData,
  prepareResearchVisit,
  addResearchInput,
  chooseColumn,
  runResearchAnalysis,
  researchScreenshot,
  setResearchTheme,
  type SurveyRow,
} from './researchData';

export async function researchPlotScenario(
  base: string,
  prefix: string,
  mode: api.PlotMode,
  inputFile?: string,
) {
  const records = await readResearchData<SurveyRow>('community-survey.json');
  const source = `${prefix}_${mode}`;
  // Both inference from CSV and typed Parquet imports belong in the ordinary suite.
  const file =
    inputFile ??
    (['trends', 'scatter', 'heatmap'].includes(mode)
      ? 'community-survey.parquet'
      : 'community-survey.csv');
  await prepareResearchVisit();
  await withResearchFile(file, source, async () => {
    const imported = await api.querySql(base, [
      { sql: `SELECT count(*) AS n FROM data.${api.identifier(source)}` },
    ]);
    expect(Number(imported.getChild('n')?.get(0))).toBe(records.length);
    if (file.endsWith('.parquet')) {
      const types = await api.querySql(base, [{ sql: `DESCRIBE data.${api.identifier(source)}` }]);
      const columns = types
        .toArray()
        .map((row: Record<string, unknown>) => [row.column_name, row.column_type]);
      expect(columns).toContainEqual(['recorded_at', 'TIMESTAMP WITH TIME ZONE']);
      expect(columns).toContainEqual(['measurement', 'DECIMAL(12,2)']);
    }
    if (mode === 'trends' && file.endsWith('.csv')) {
      await $(`[aria-label="Select ${source}"]`).click();
      const stamp = $('[aria-label="Change data type for column recorded_at"]');
      await expect(stamp).toHaveText(expect.stringContaining('string'));
      await stamp.click();
      if (!(await $('[role="menuitemradio"]').isExisting())) await browser.keys('ArrowDown');
      await $('[role="menuitemradio"]=datetime').click();
      await expect(stamp).toHaveText(expect.stringContaining('datetime with timezone'));
      await expect($('[role="dialog"]')).not.toExist();
      await $('[aria-label="Close preview"]').click();
      const converted = await api.querySql(base, [
        {
          sql: `SELECT recorded_at=TIMESTAMPTZ '2025-11-01 04:00:15.125+00' AS correct FROM data.${api.identifier(source)} WHERE row_id=1`,
        },
      ]);
      expect(converted.getChild('correct')?.get(0)).toBe(true);
    }
    await $('button=Plots').click();
    const label = mode.slice(0, 1).toUpperCase() + mode.slice(1);
    await $('[role="tablist"][aria-label="Plot modes"]').$(`[role="tab"]=${label}`).click();
    const panel = $(`[data-testid="${mode}-workspace"]`);
    if ((await api.listTabs(base, undefined, mode)).some((tab) => tab.analysis)) {
      const previous = await panel.$('[role="tab"][aria-selected="true"]').getText();
      await panel.$('button[aria-label="New tab"]').click();
      await browser.waitUntil(async () => {
        const selected = await panel.$('[role="tab"][aria-selected="true"]').getText();
        return selected.length > 0 && selected !== previous;
      });
    }
    await addResearchInput(panel, source);
    const choose = (label: string, value: string) => chooseColumn(label, value, panel);
    if (mode === 'trends') {
      await choose('Axis', 'recorded_at');
      await expect(panel.$('[aria-label="Timezone"]')).toHaveText('UTC');
      await panel.$('button[aria-label="Add group"]').click();
      await choose('Group 1', 'topic');
    } else if (mode === 'compare') {
      await choose('Category', 'topic');
      await choose('Stack category', 'region');
      await choose('Measure', 'Sum');
      await choose('Value', 'weight');
    } else if (mode === 'scatter') {
      for (const [label, column] of [
        ['X', 'x'],
        ['Y', 'y'],
        ['Color category', 'topic'],
        ['Bubble size', 'weight'],
        ['Row label', 'label'],
      ]) {
        if (label && column) await choose(label, column);
      }
    } else if (mode === 'heatmap') {
      await choose('Row category', 'topic');
      await choose('Column category', 'region');
      await choose('Measure', 'Mean');
      await choose('Value', 'measurement');
    } else {
      await choose('Stage 1', 'before');
      await choose('Stage 2', 'after');
      await choose('Stage 3', 'followup');
    }
    const id = await runResearchAnalysis(base, mode, panel);
    const results = panel.$('[aria-label="Plot results"]');
    const chart = results.$('[data-testid="plot-chart"]');
    await chart.$('svg').waitForExist();
    await expect(results).toHaveText(expect.stringContaining('480 rows'));
    const data = await api.queryPlot(base, id, mode, { uncased: false, minimum_rows: 0 });
    const rows = data.toArray() as Record<string, unknown>[];
    if (mode === 'trends') {
      expect(rows.reduce((n, r) => n + Number(r.value), 0)).toBe(480);
      expect(rows.some((r) => Number(r.row_count) === 0)).toBe(true);
      expect(new Set(rows.map((r) => r.group_key)).size).toBe(8);
    } else if (mode === 'compare') {
      expect(rows.reduce((n, r) => n + Number(r.value), 0)).toBe(
        records.reduce((n, r) => n + r.weight, 0),
      );
    } else if (mode === 'scatter') {
      expect(rows.length).toBe(records.filter((r) => r.x !== null && r.y !== null).length);
    } else if (mode === 'heatmap') {
      // Independently calculate each group's mean from original measurements.
      for (const row of rows) {
        const [topic] = JSON.parse(String(row.category_key)) as string[];
        const [region] = JSON.parse(String(row.column_key)) as string[];
        const values = records
          .filter((r) => r.topic === topic && r.region === region && r.measurement !== null)
          .flatMap((r) => (r.measurement === null ? [] : [r.measurement]));
        expect(values.length).toBeGreaterThan(0);
        expect(Number(row.value)).toBeCloseTo(values.reduce((a, b) => a + b, 0) / values.length, 8);
      }
    } else {
      expect(rows.reduce((n, r) => n + Number(r.value), 0)).toBe(480 * 2);
    }
    const chartText = async () =>
      String(
        await chart.execute((element) =>
          [...element.querySelectorAll('svg text')].map((node) => node.textContent).join(' '),
        ),
      );
    if (mode === 'compare') {
      await expect(results.$('[aria-label="Bar orientation"]')).toHaveText('Horizontal');
      const labels = (await chartText()).replace(/\s/g, '');
      for (const topic of new Set(records.map((row) => row.topic)))
        expect(labels).toContain(topic.replace(/\s/g, ''));
      await chooseColumn('Bar orientation', 'Vertical', results);
      await expect(results.$('[aria-label="Bar orientation"]')).toHaveText('Vertical');
      await chooseColumn('Bar orientation', 'Horizontal', results);
    } else if (mode === 'heatmap') {
      const labels = await chartText();
      for (const region of ['North', 'South', 'Inner city', '(empty)'])
        expect(labels).toContain(region);
      expect(labels).toContain('Mean of measurement');
      const before = await chart.$('svg').getHTML();
      await results.$('button=Zoom in').click();
      await browser.waitUntil(async () => (await chart.$('svg').getHTML()) !== before, {
        timeoutMsg: 'Heatmap did not redraw after zooming in',
      });
      await results.$('button=Reset zoom').click();
    } else if (mode === 'sankey') {
      const labels = await chartText();
      for (const stage of ['before', 'after', 'followup']) expect(labels).toContain(stage);
    } else if (mode === 'scatter') {
      expect(await chartText()).toContain('Bubble area: weight');
      await results.$('button=Zoom in').click();
      await expect(results).toHaveText(expect.stringContaining('No observations in this viewport'));
      await results.$('button=Show full plot').click();
      await results.$('button=Zoom area').click();
      await expect(results.$('button=Zoom area')).toHaveAttribute('aria-pressed', 'true');
      await chart.click();
      await browser.keys('Escape');
    }
    await researchScreenshot(`${prefix}-${mode}-normal`, results);
    if (mode === 'trends' || mode === 'compare') {
      const connectingLines = async () =>
        chart.execute(
          (element) =>
            [...element.querySelectorAll('path')].filter(
              (path) =>
                path.getAttribute('fill') === 'none' &&
                path.getAttribute('stroke-width') === '2' &&
                (path.getAttribute('d') ?? '').includes('C') &&
                !(path.getAttribute('d') ?? '').includes('NaN') &&
                !['transparent', 'none'].includes(path.getAttribute('stroke') ?? 'none'),
            ).length,
        );
      if (mode === 'trends') expect(await connectingLines()).toBe(8);
      const legend = results.$('button[aria-pressed="true"]');
      await legend.click();
      await expect(results.$('button[aria-pressed="false"]')).toExist();
      if (mode === 'trends') expect(await connectingLines()).toBe(7);
      await results.$('button[aria-pressed="false"]').click();
      if (mode === 'trends') expect(await connectingLines()).toBe(8);
      await results.$('label=Normalize to 100%').click();
      await expect(results).toHaveText(expect.stringContaining('including hidden groups'));
    }
    if (mode !== 'sankey') {
      await results.$('button=Zoom in').click();
      await results.$('button=Reset zoom').click();
    }
    // Select identifiable marks through the chart's public keyboard interface.
    // Expected publication rows come from the original file, never plotModel.
    const inspect = async (prefix: string) => {
      await chart.execute((element) => {
        element.focus();
      });
      const announcement = results.$('[aria-live="polite"]');
      for (let step = 0; step <= rows.length; step++) {
        const summary = String(await announcement.execute((element) => element.textContent));
        if (summary.startsWith(prefix)) return summary;
        await browser.keys('ArrowRight');
      }
      throw new Error(`Chart keyboard inspection did not reach ${prefix}`);
    };
    let chosen: SurveyRow[];
    if (mode === 'trends') {
      await inspect('2025-11-01');
      await browser.keys('Enter');
      await inspect('2025-11-03');
      // The embedded driver's special-key branch drops modifiers. Space follows
      // its regular-key path and exercises the same supported selection gesture.
      await browser.action('key').down(Key.Shift).down(' ').up(' ').up(Key.Shift).perform();
      chosen = records.filter((r) => r.day >= '2025-11-01' && r.day <= '2025-11-03');
    } else if (mode === 'compare' || mode === 'heatmap') {
      const topic = 'Housing and rental affordability';
      const summary = await inspect(`${topic} · North:`);
      chosen = records.filter((r) => r.topic === topic && r.region === 'North');
      if (mode === 'compare') {
        const value = chosen.reduce((sum, r) => sum + r.weight, 0);
        const total = records
          .filter((r) => r.topic === topic)
          .reduce((sum, r) => sum + r.weight, 0);
        const share = `: ${String(value)} (${((100 * value) / total).toLocaleString('en-US', { maximumFractionDigits: 2 })}%)`;
        expect(summary).toContain(share);
        const hidden = results.$('button*=South ·');
        await hidden.click();
        await expect(hidden).toHaveAttribute('aria-pressed', 'false');
        expect(await inspect(`${topic} · North:`)).toContain(share);
        await hidden.click();
        await inspect(`${topic} · North:`);
      }
      await browser.keys('Enter');
    } else if (mode === 'scatter') {
      // These two observations have identical coordinates but separate source identities.
      chosen = records.filter((r) => [8, 128].includes(r.row_id));
      expect(chosen.map((r) => [r.x, r.y])).toEqual([
        [-13, 14],
        [-13, 14],
      ]);
      for (const row of chosen) {
        await inspect(row.label + ' · X:');
        await browser.keys('Enter');
      }
    } else {
      await inspect('before → after · Support · Support:');
      await browser.keys('Enter');
      await inspect('after → followup · Support · Support:');
      await browser.keys('Enter');
      chosen = records.filter(
        (r) =>
          (r.before === 'Support' && r.after === 'Support') ||
          (r.after === 'Support' && r.followup === 'Support'),
      );
      const intersection = records.filter(
        (r) => r.before === 'Support' && r.after === 'Support' && r.followup === 'Support',
      );
      expect(intersection.length).toBeGreaterThan(0);
      expect(chosen.length).toBeGreaterThan(intersection.length);
    }
    await publishRows(base, results, `${source}_selected`, chosen.length);
    const selected = await api.querySql(base, [
      {
        sql: `SELECT row_id FROM data.${api.identifier(`${source}_selected`)} ORDER BY row_id`,
      },
    ]);
    expect(selected.toArray().map((row: Record<string, unknown>) => Number(row.row_id))).toEqual(
      chosen.map((r) => r.row_id),
    );
    if (mode === 'heatmap') {
      expect(
        await chart.execute((element) =>
          [...element.querySelectorAll('path')].some(
            (path) => path.getAttribute('stroke-width') === '3',
          ),
        ),
      ).toBe(true);
    }
    await results.$('button=Clear Selection').click();
    if (mode === 'trends') {
      await chooseColumn('Plot presentation', 'area', results);
      await researchScreenshot(`${prefix}-trends-area`, results);
      await chooseColumn('Plot presentation', 'calendar', results);
      await chooseColumn('Calendar year', '2026', results);
      await researchScreenshot(`${prefix}-trends-calendar`, results);
    }
    if (mode === 'heatmap') {
      await expect(results.$('label=Normalize to 100%')).not.toExist();
    }
    await setResearchTheme(true);
    await researchScreenshot(`${prefix}-${mode}-dark`, results);
    await setAnalysisPaneSize('narrow');
    await researchScreenshot(`${prefix}-${mode}-narrow`, results);
    expect(await panel.execute((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    );
    await setAnalysisPaneSize('normal');
    await setResearchTheme(false);
    // Clear selection restores the original-row scope; publish through the real dialog.
    const eligible =
      mode === 'scatter' ? records.filter((r) => r.x !== null && r.y !== null) : records;
    await publishRows(base, results, `${source}_published`, eligible.length);
    const published = await api.querySql(base, [
      { sql: `SELECT row_id FROM data.${api.identifier(`${source}_published`)} ORDER BY row_id` },
    ]);
    expect(published.toArray().map((r: Record<string, unknown>) => Number(r.row_id))).toEqual(
      eligible.map((r) => r.row_id),
    );
    await expect($('[data-testid="project-data-overlay"]')).not.toExist();
  });
}

async function publishRows(
  base: string,
  results: ReturnType<typeof $>,
  name: string,
  count: number,
) {
  await results.$('button=Add to Project').waitForEnabled();
  await results.$('button=Add to Project').click();
  const dialog = $('[role="dialog"]');
  await dialog.waitForDisplayed();
  await expect(dialog.$('[aria-label="Captured publication scope"]')).toExist();
  await dialog.$('input').setValue(name);
  await dialog.$('button=Select all').click();
  await dialog.$('button=Add').click();
  await dialog.waitForExist({ reverse: true });
  const rows = await api.querySql(base, [
    { sql: `SELECT count(*) AS n FROM data.${api.identifier(name)}` },
  ]);
  expect(Number(rows.getChild('n')?.get(0))).toBe(count);
}
