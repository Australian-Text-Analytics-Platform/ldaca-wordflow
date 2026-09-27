import { browser, $, expect } from '@wdio/globals';
import * as api from '../../src/features/project/api';
import { outputDir, checked } from '../../e2e-browser/fixtures';
import { setAnalysisPaneSize } from '../../e2e-browser/layout';
import { resolve } from 'node:path';
import { Key } from 'webdriverio';
export async function plotsScenario(base: string, prefix: string) {
  expect(await api.plotTimezones(base)).toContain('UTC');
  await api.executeSql(
    base,
    [
      {
        sql: 'CREATE TABLE data.plot_fixture(day DATE,x INTEGER,y INTEGER,party VARCHAR,stance VARCHAR,followup VARCHAR,weight INTEGER)',
      },
      {
        sql: "INSERT INTO data.plot_fixture VALUES ('2026-01-01',1,2,'A','yes','yes',2),('2026-01-03',3,4,'a','no','yes',4),('2026-01-03',3,4,'B','yes','no',6)",
      },
      { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('plot_fixture')" },
    ],
    { objects: [{ schema: 'data', name: 'plot_fixture' }], resources: ['graph'] },
  );
  const source = { schema: 'data', name: 'plot_fixture' };
  const requests: api.PlotRequests = {
    trends: {
      source,
      axis: 'day',
      groups: ['party'],
      measure: 'count',
      value: null,
      interval: { type: 'time', unit: 'day', step: 1 },
      timezone: 'UTC',
    },
    compare: { source, category: 'party', stack: 'stance', measure: 'sum', value: 'weight' },
    scatter: { source, x: 'x', y: 'y', color: 'party', size: 'weight', label: 'stance' },
    heatmap: { source, row: 'party', column: 'stance', measure: 'mean', value: 'weight' },
    sankey: { source, stages: ['party', 'stance', 'followup'], measure: 'count', value: null },
  };
  const createdTabs = new Map<api.PlotMode, string>();
  for (const mode of ['trends', 'compare', 'scatter', 'heatmap', 'sankey'] as const) {
    const tab = await api.createTab(base, mode);
    createdTabs.set(mode, tab.name);
    await api.runPlot(base, tab.id, mode, requests[mode]);
  }
  await browser.refresh();
  await browser.execute(() => {
    const style = document.createElement('style');
    style.textContent =
      '*,*::before,*::after { animation:none !important; transition:none !important; }';
    document.head.append(style);
  });
  await $('button=Plots').click();
  await setAnalysisPaneSize('normal');
  for (const mode of ['trends', 'compare', 'scatter', 'heatmap', 'sankey'] as const) {
    const label = mode.charAt(0).toUpperCase() + mode.slice(1);
    await $('[role="tablist"][aria-label="Plot modes"]').$(`[role="tab"]=${label}`).click();
    const panel = $(`[data-testid="${mode}-workspace"]`);
    const createdName = createdTabs.get(mode);
    if (!createdName) throw new Error(`Missing prepared ${mode} tab`);
    const preparedTab = panel.$(`[role="tab"]*=${createdName}`);
    await preparedTab.execute((element) => {
      element.focus();
    });
    await browser.keys(Key.Enter);
    await expect(preparedTab).toHaveAttribute('aria-selected', 'true');
    await panel.$('[aria-label="Plot results"] svg').waitForExist();
    await expect(panel.$('button=Run')).toHaveAttribute('aria-disabled', 'true');
    if (mode === 'trends') {
      for (const [index, column] of [
        [2, 'stance'],
        [3, 'followup'],
      ] as const) {
        await panel.$('button[aria-label="Add group"]').click();
        await panel.$(`[role="combobox"][aria-label="Group ${String(index)}"]`).click();
        if (!(await $('[role="option"]').isExisting())) await browser.keys('ArrowDown');
        await $(`[role="option"]=${column}`).click();
      }
      await panel.$('[aria-label="Grouping"]').execute((element) => {
        element.scrollIntoView({ block: 'center' });
      });
      await browser.saveScreenshot(resolve(outputDir, `${prefix}-groups.png`));
      await setAnalysisPaneSize('narrow');
      await browser.saveScreenshot(resolve(outputDir, `${prefix}-groups-narrow.png`));
      await setAnalysisPaneSize('normal');
      await panel.$('button[aria-label="Remove group 2"]').click();
      await expect(panel.$('[role="combobox"][aria-label="Group 2"]')).toHaveText('followup');
      await panel.$('button[aria-label="Remove group 2"]').click();
      await expect(panel.$('button=Run')).toHaveAttribute('aria-disabled', 'true');
    }

    await expect(panel.$('[role="tablist"]')).toHaveText(expect.stringContaining(createdName));
    await browser.saveScreenshot(resolve(outputDir, `${prefix}-${mode}.png`));
    await panel.$('[aria-label="Plot results"]').execute((element) => {
      element.scrollIntoView({ block: 'start' });
    });
    await browser.saveScreenshot(resolve(outputDir, `${prefix}-${mode}-results.png`));
    await panel.$('button[aria-label="Download chart"]').execute((element) => {
      element.scrollIntoView({ block: 'end' });
    });
    await browser.saveScreenshot(resolve(outputDir, `${prefix}-${mode}-actions.png`));

    if (mode === 'sankey') {
      if (process.env.WORDFLOW_E2E_BINARY)
        await browser.tauri.execute(({ core }) => core.invoke('plugin:window|set_focus'));
      await panel.$('[data-testid="plot-chart"]').execute((element) => {
        element.focus();
      });
      await expect(panel.$('[data-testid="plot-chart"]')).toBeFocused();
      await browser.keys(Key.ArrowRight);
      await panel.$('[data-testid="plot-inspection"]').execute((element) => {
        element.scrollIntoView({ block: 'end' });
      });
      await expect(panel.$('[data-testid="plot-inspection"]')).toBeDisplayed();
      await browser.saveScreenshot(resolve(outputDir, `${prefix}-sankey-keyboard.png`));
    }

    if (mode === 'scatter' && !process.env.PLOTS_BENCHMARK) {
      await panel.$('[data-testid="plot-chart"]').click();
      await browser.keys(Key.Enter);
      await panel.$('button=Add to Project').click();
      const dialog = $('[role="dialog"]');
      await dialog.$('input').setValue('plot_selected_row');
      await dialog.$('button=Add').click();
      await dialog.waitForExist({ reverse: true });
      const published = await api.querySql(base, [{ sql: 'SELECT * FROM data.plot_selected_row' }]);
      expect(published.numRows).toBe(1);
    }
  }
  await $('[role="tablist"][aria-label="Plot modes"]').$('[role="tab"]=Trends').click();
  await $('[aria-label="Plot presentation"]').click();
  await $('[role="option"]=calendar').click();
  await $('[aria-label="Plot results"] svg').waitForExist();
  await browser.saveScreenshot(resolve(outputDir, `${prefix}-calendar.png`));
  await $('[aria-label="Plot results"]').execute((element) => {
    element.scrollIntoView({ block: 'start' });
  });
  await browser.saveScreenshot(resolve(outputDir, `${prefix}-calendar-results.png`));
  await $('button[aria-label="Download chart"]').execute((element) => {
    element.scrollIntoView({ block: 'end' });
  });
  await browser.saveScreenshot(resolve(outputDir, `${prefix}-calendar-actions.png`));

  await $('button[aria-label="Open settings"]').click();
  await checked($('button[role="switch"][aria-label="Use Dark 2026 theme"]'), true);
  await browser.keys(Key.Escape);
  await $('[role="dialog"]').waitForExist({ reverse: true });
  await browser.saveScreenshot(resolve(outputDir, `${prefix}-dark.png`));
  await $('[aria-label="Plot results"]').execute((element) => {
    element.scrollIntoView({ block: 'start' });
  });
  await browser.saveScreenshot(resolve(outputDir, `${prefix}-dark-results.png`));

  await setAnalysisPaneSize('narrow');
  await browser.saveScreenshot(resolve(outputDir, `${prefix}-narrow.png`));
  await $('[aria-label="Plot results"]').execute((element) => {
    element.scrollIntoView({ block: 'start' });
  });
  await browser.saveScreenshot(resolve(outputDir, `${prefix}-narrow-results.png`));
  await $('button[aria-label="Download chart"]').execute((element) => {
    element.scrollIntoView({ block: 'end' });
  });
  await browser.saveScreenshot(resolve(outputDir, `${prefix}-narrow-actions.png`));
  if (process.env.WORDFLOW_E2E_BINARY)
    await browser.tauri.execute(({ core }) => core.invoke('plugin:window|set_focus'));
  await $('[data-testid="plot-chart"]').execute((element) => {
    element.focus();
  });
  await expect($('[data-testid="plot-chart"]')).toBeFocused();
  await browser.keys(Key.ArrowRight);
  await $('[data-testid="plot-inspection"]').execute((element) => {
    element.scrollIntoView({ block: 'end' });
  });
  await expect($('[data-testid="plot-inspection"]')).toBeDisplayed();
  await browser.saveScreenshot(resolve(outputDir, `${prefix}-calendar-keyboard.png`));
  await setAnalysisPaneSize('normal');
}

export async function plotsBenchmark(base: string) {
  await setAnalysisPaneSize('normal');
  const source = { schema: 'data', name: 'plot_benchmark' };
  const request: api.PlotRequests['scatter'] = {
    source,
    x: 'x',
    y: 'y',
    color: null,
    size: null,
    label: null,
  };
  for (const count of [10000, 50000, 100000]) {
    await api.executeSql(
      base,
      [
        { sql: 'DROP TABLE IF EXISTS data.plot_benchmark' },
        {
          sql: `CREATE TABLE data.plot_benchmark AS SELECT i AS x,sin(i)*100 AS y FROM range(${String(count)}) t(i)`,
        },
        {
          sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('plot_benchmark') ON CONFLICT DO NOTHING",
        },
      ],
      { objects: [source], resources: ['graph'] },
    );
    const tab = await api.createTab(base, 'scatter');
    const start = performance.now();
    await api.runPlot(base, tab.id, 'scatter', request);
    await browser.refresh();
    await $('button=Plots').click();
    await $('[role="tablist"][aria-label="Plot modes"]').$('[role="tab"]=Scatter').click();
    const chosen = $('[data-testid="scatter-workspace"]').$(`[role="tab"]*=${tab.name}`);
    await chosen.execute((element) => {
      element.focus();
    });
    await browser.keys(Key.Enter);
    await expect(chosen).toHaveAttribute('aria-selected', 'true');
    await browser.waitUntil(
      async () =>
        browser.execute(
          (n) => document.querySelectorAll('[aria-label="Plot results"] svg path').length >= n,
          count,
        ),
      { timeout: 60000 },
    );
    console.debug(
      `PLOTS_BENCHMARK ${String(count)} points: ${String(Math.round(performance.now() - start))}ms run/reload/query/render`,
    );
    const interaction = performance.now();
    await $('button=Zoom in').click();
    await browser.execute(
      () =>
        new Promise<void>((done) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              done();
            });
          });
        }),
    );
    console.debug(
      `PLOTS_BENCHMARK ${String(count)} points: ${String(Math.round(performance.now() - interaction))}ms zoom`,
    );
  }
}

export async function plotsProjectionBenchmark(base: string) {
  await setAnalysisPaneSize('normal');
  const source = { schema: 'data', name: 'plot_capacity' };
  const cases: {
    mode: api.PlotMode;
    sql: string;
    request: api.PlotRequest;
    marks: number;
    description: string;
  }[] = [
    {
      mode: 'trends',
      sql: 'SELECT i%1000 AS axis, (i//1000)::VARCHAR AS g FROM range(100000) t(i)',
      request: {
        source,
        axis: 'axis',
        groups: ['g'],
        measure: 'count',
        value: null,
        interval: { type: 'numeric', width: '1', origin: null },
        timezone: 'UTC',
      },
      marks: 100000,
      description: '100 series / 100000 interval values',
    },
    {
      mode: 'compare',
      sql: 'SELECT (i%20)::VARCHAR AS c,(i//20)::VARCHAR AS g FROM range(10000) t(i)',
      request: { source, category: 'c', stack: 'g', measure: 'count', value: null },
      marks: 10000,
      description: '500 series / 10000 segments',
    },
    {
      mode: 'heatmap',
      sql: 'SELECT (i%1000)::VARCHAR AS c,(i//1000)::VARCHAR AS r FROM range(100000) t(i)',
      request: { source, row: 'r', column: 'c', measure: 'count', value: null },
      marks: 100000,
      description: '100000 cells',
    },
    {
      mode: 'sankey',
      sql: 'SELECT (i%100)::VARCHAR AS a,(i//100)::VARCHAR AS b FROM range(5000) t(i)',
      request: { source, stages: ['a', 'b'], measure: 'count', value: null },
      marks: 5000,
      description: '5000 links',
    },
  ];
  for (const item of cases) {
    await api.executeSql(
      base,
      [
        { sql: 'DROP TABLE IF EXISTS data.plot_capacity' },
        { sql: `CREATE TABLE data.plot_capacity AS ${item.sql}` },
        {
          sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('plot_capacity') ON CONFLICT DO NOTHING",
        },
      ],
      { objects: [source], resources: ['graph'] },
    );
    const tab = await api.createTab(base, item.mode);
    const runStart = performance.now();
    const analysis = await api.runPlot(base, tab.id, item.mode, item.request);
    const runMs = performance.now() - runStart;
    const queryStart = performance.now();
    const table = await api.queryPlot(base, analysis.id, item.mode, {
      uncased: false,
      minimum_rows: 0,
    });
    const queryMs = performance.now() - queryStart;
    await browser.refresh();
    await $('button=Plots').click();
    const label = item.mode.charAt(0).toUpperCase() + item.mode.slice(1);
    await $('[role="tablist"][aria-label="Plot modes"]').$(`[role="tab"]=${label}`).click();
    const chosen = $(`[data-testid="${item.mode}-workspace"]`).$(`[role="tab"]*=${tab.name}`);
    const renderStart = performance.now();
    await chosen.execute((element) => {
      element.focus();
    });
    await browser.keys(Key.Enter);
    await expect(chosen).toHaveAttribute('aria-selected', 'true');
    await browser.waitUntil(
      async () =>
        browser.execute(
          (n) => document.querySelectorAll('[aria-label="Plot results"] svg path').length >= n,
          item.marks,
        ),
      { timeout: 90000 },
    );
    console.debug(
      `PLOTS_BENCHMARK ${item.mode} ${item.description}: Run ${String(Math.round(runMs))}ms, query ${String(Math.round(queryMs))}ms (${String(table.numRows)} rows), query/render ${String(Math.round(performance.now() - renderStart))}ms`,
    );
  }
}
