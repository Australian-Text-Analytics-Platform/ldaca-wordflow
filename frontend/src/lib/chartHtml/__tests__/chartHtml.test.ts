import { describe, expect, it, vi } from 'vitest';

import { formatChartDate } from '@/lib/chartDates';
import { buildChartHtmlDocument, buildChartHtmlPayload } from '../chartHtmlExport';
import { runChartHtml, type ChartHtmlPayload } from '../chartHtmlRuntime';
import { formatterFromSpec, portableFormatter, portableFormatterSpec } from '../portableFormatter';

/** Evaluates a function's source on its own, as the downloaded file does. */
const standalone = <T>(fn: (...args: never[]) => unknown): T =>
  new Function(`return (${fn.toString()});`)() as T;

describe('portable formatters (issue 278)', () => {
  it('give the labels the charts showed before', () => {
    const percent = portableFormatter({ kind: 'percent', round: false });
    expect(percent(12.5)).toBe('12.5%');
    const rounded = portableFormatter({ kind: 'percent', round: true });
    expect(rounded(12.5)).toBe('13%');
    expect(rounded(Number.NaN)).toBe('');
    expect(portableFormatter({ kind: 'number' })(1999)).toBe('1999');
    expect(portableFormatter({ kind: 'number' })('x')).toBe('');
    const offset = 10 * 3_600_000;
    const date = portableFormatter({ kind: 'chartDate', unit: 'day', offsetMs: offset });
    const instant = Date.UTC(2020, 9, 17, 20);
    expect(date(instant)).toBe(formatChartDate(instant + offset, 'day'));
    expect(date(instant)).toBe('18 Oct 2020');
    expect(portableFormatterSpec(date)).toEqual({
      kind: 'chartDate',
      unit: 'day',
      offsetMs: offset,
    });
    expect(portableFormatterSpec(() => '')).toBeUndefined();
  });

  it('embeds functions that run without the app', () => {
    const date = standalone<typeof formatChartDate>(formatChartDate);
    for (const unit of ['second', 'minute', 'day', 'month', 'quarter', 'year'] as const) {
      for (const ms of [0, Date.UTC(2020, 9, 18, 14, 5, 9), Date.UTC(1999, 11, 31, 23, 59)]) {
        expect(date(ms, unit)).toBe(formatChartDate(ms, unit));
      }
    }
    const fromSpec = standalone<typeof formatterFromSpec>(formatterFromSpec);
    expect(fromSpec({ kind: 'percent', round: true }, date)(49.6)).toBe('50%');
    expect(standalone<typeof runChartHtml>(runChartHtml)).toBeTypeOf('function');
  });
});

const appTooltip = (rawParams: unknown) => {
  const params = rawParams as {
    seriesId: string;
    marker: string;
    value: Record<string, unknown>;
  }[];
  const row = params[0]?.value ?? {};
  return [
    `Period ${String(row.period)}`,
    ...params.map((param) => `${param.marker}${param.seriesId}: ${String(row[param.seriesId])}`),
  ].join('\n');
};

const fakeChart = (option: Record<string, unknown>) => {
  const dom = document.createElement('div');
  dom.style.setProperty('--vscode-charts-foreground', '#123456');
  document.body.append(dom);
  return {
    getOption: () => option,
    getWidth: () => 640,
    getHeight: () => 300,
    getDom: () => dom,
  };
};

describe('buildChartHtmlPayload (issue 278)', () => {
  const option = {
    dataset: [
      {
        dimensions: ['period', 'a', 'b'],
        source: [
          { period: 'k1', a: 1, b: 2 },
          { period: 'k2', a: 3, b: 4 },
        ],
      },
    ],
    tooltip: [{ trigger: 'axis', formatter: appTooltip }],
    xAxis: [
      {
        type: 'category',
        axisLabel: {
          color: 'var(--vscode-charts-foreground)',
          formatter: (v: unknown) => `P-${String(v)}`,
        },
      },
    ],
    yAxis: [
      {
        type: 'value',
        axisLabel: { formatter: portableFormatter({ kind: 'percent', round: false }) },
      },
    ],
    grid: [{ top: 20 }],
    series: [
      { id: '__overview', type: 'line', data: [[0, 3]] },
      { id: 'a', name: 'Group A', type: 'line' },
      { id: 'b', name: 'Group B', type: 'line' },
    ],
  };

  it('keeps the chart as shown and replaces every function', () => {
    const payload = buildChartHtmlPayload(fakeChart(option));
    const text = JSON.stringify(payload);
    expect(text).not.toContain('var(--');
    expect(text).toContain('#123456');
    expect(payload.tooltipSeriesIds).toEqual(['a', 'b']);
    expect(payload.tooltips?.[1]).toBe('Period k2\n\u0001a\u0002a: 3\n\u0001b\u0002b: 4');
    const portable = payload.option as {
      xAxis: { axisLabel: { formatter: unknown } }[];
      yAxis: { axisLabel: { formatter: unknown } }[];
      legend: { data: string[] }[];
      grid: { top: number }[];
    };
    expect(portable.xAxis[0]?.axisLabel.formatter).toEqual({
      __wordflowFormatter: { kind: 'lookup', labels: { k1: 'P-k1', k2: 'P-k2' } },
    });
    expect(portable.yAxis[0]?.axisLabel.formatter).toEqual({
      __wordflowFormatter: { kind: 'percent', round: false },
    });
    expect(portable.legend[0]?.data).toEqual(['Group A', 'Group B']);
    expect(portable.grid[0]?.top).toBe(52);
  });

  it('runs in the file: formatters revived and colour dots filled in', () => {
    const payload: ChartHtmlPayload = buildChartHtmlPayload(fakeChart(option));
    const setOption = vi.fn();
    const echartsLib = { init: () => ({ setOption, on: vi.fn() }) };
    const run = standalone<typeof runChartHtml>(runChartHtml);
    run(
      echartsLib,
      document.createElement('div'),
      JSON.parse(JSON.stringify(payload)) as ChartHtmlPayload,
      standalone(formatterFromSpec),
      standalone(formatChartDate),
    );
    const shown = setOption.mock.calls[0]?.[0] as {
      tooltip: { formatter: (params: unknown) => string }[];
      xAxis: { axisLabel: { formatter: (v: unknown) => string } }[];
      yAxis: { axisLabel: { formatter: (v: unknown) => string } }[];
    };
    expect(shown.xAxis[0]?.axisLabel.formatter('k2')).toBe('P-k2');
    expect(shown.yAxis[0]?.axisLabel.formatter(40)).toBe('40%');
    expect(
      shown.tooltip[0]?.formatter([
        { seriesId: 'a', dataIndex: 0, marker: '[A]' },
        { seriesId: 'b', dataIndex: 0, marker: '[B]' },
      ]),
    ).toBe('Period k1\n[A]a: 1\n[B]b: 2');
  });
});

describe('buildChartHtmlDocument (issue 278)', () => {
  it('escapes text and cannot close its scripts early', () => {
    const html = buildChartHtmlDocument(
      {
        option: { title: '</script><b>' },
        tooltips: null,
        tooltipSeriesIds: [],
        width: 1,
        height: 1,
      },
      {
        title: 'Trends: <Corpus>',
        header: [{ label: 'Group', value: 'a & b' }],
        background: '#fff',
        foreground: '#000',
        echartsSource: 'var x = "</script>";',
        generatedAt: 'now',
      },
    );
    expect(html).toContain('<title>Trends: &lt;Corpus&gt;</title>');
    expect(html).toContain('a &amp; b');
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });
});

describe('what the file keeps (issues 298, 299, 303)', () => {
  const base = {
    dataset: [
      {
        dimensions: ['period', 'a', 'b'],
        source: [
          { period: 'k1', a: 1, b: 2 },
          { period: 'k2', a: 3, b: 4 },
        ],
      },
    ],
    tooltip: [{ trigger: 'axis', formatter: appTooltip }],
    xAxis: [{ type: 'category' }],
    yAxis: [{ type: 'value' }],
    grid: [{ top: 20 }],
    dataZoom: [{ type: 'inside', zoomOnMouseWheel: 'meta', moveOnMouseWheel: true }],
  };

  it('stores per-point symbols, drops helper series, and reads stacked legends in app order', () => {
    const selected = new Set([1]);
    const payload = buildChartHtmlPayload(
      fakeChart({
        ...base,
        series: [
          { id: '__wordflow_slider_overview__', type: 'line' },
          { id: 'b', name: 'Group B', type: 'bar', stack: 'wordflow-total' },
          {
            id: 'a',
            name: 'Group A',
            type: 'bar',
            stack: 'wordflow-total',
            symbol: (_v: unknown, p: { dataIndex: number }) =>
              selected.has(p.dataIndex) ? 'circle' : 'emptyCircle',
            symbolSize: (_v: unknown, p: { dataIndex: number }) =>
              selected.has(p.dataIndex) ? 11 : 5,
          },
        ],
      }),
    );
    expect(payload.tooltipSeriesIds).toEqual(['b', 'a']);
    const option = payload.option as {
      legend: { data: string[] }[];
      series: Record<string, unknown>[];
    };
    expect(option.legend[0]?.data).toEqual(['Group A', 'Group B']);
    expect(option.series[2]?.symbol).toEqual({
      __wordflowFormatter: { kind: 'perPoint', values: ['emptyCircle', 'circle'] },
    });
    expect(option.series[2]?.symbolSize).toEqual({
      __wordflowFormatter: { kind: 'perPoint', values: [5, 11] },
    });
  });

  it('in the file: revives per-point symbols, drops hidden groups from the tooltip, and zooms with the platform key', () => {
    const payload = buildChartHtmlPayload(
      fakeChart({
        ...base,
        series: [
          {
            id: 'a',
            name: 'Group A',
            type: 'line',
            symbolSize: (_v: unknown, p: { dataIndex: number }) => (p.dataIndex === 1 ? 11 : 5),
          },
          { id: 'b', name: 'Group B', type: 'line' },
        ],
      }),
    );
    const setOption = vi.fn();
    const element = document.createElement('div');
    standalone<typeof runChartHtml>(runChartHtml)(
      { init: () => ({ setOption, on: vi.fn() }) },
      element,
      JSON.parse(JSON.stringify(payload)) as ChartHtmlPayload,
      standalone(formatterFromSpec),
      standalone(formatChartDate),
    );
    const shown = setOption.mock.calls[0]?.[0] as {
      series: { symbolSize: (v: unknown, p: { dataIndex: number }) => number }[];
      tooltip: { formatter: (params: unknown) => string }[];
      dataZoom: { zoomOnMouseWheel: string; moveOnMouseWheel: boolean }[];
    };
    expect(shown.series[0]?.symbolSize(null, { dataIndex: 1 })).toBe(11);
    expect(shown.series[0]?.symbolSize(null, { dataIndex: 0 })).toBe(5);
    // Group B hidden through the legend: only Group A's line is listed.
    expect(shown.tooltip[0]?.formatter([{ seriesId: 'a', dataIndex: 0, marker: '[A]' }])).toBe(
      'Period k1\n[A]a: 1',
    );
    expect(['meta', 'ctrl']).toContain(shown.dataZoom[0]?.zoomOnMouseWheel);
    expect(shown.dataZoom[0]?.moveOnMouseWheel).toBe(false);
    // A plain wheel never reaches the chart, so the page scrolls.
    const plain = new WheelEvent('wheel', { bubbles: true, cancelable: true });
    const stop = vi.spyOn(plain, 'stopPropagation');
    element.dispatchEvent(plain);
    expect(stop).toHaveBeenCalled();
  });

  it('links Wordflow in the footer to its home page', () => {
    const html = buildChartHtmlDocument(
      { option: {}, tooltips: null, tooltipSeriesIds: [], width: 1, height: 1 },
      {
        title: 't',
        header: [],
        background: '#fff',
        foreground: '#000',
        echartsSource: '',
        generatedAt: 'now',
      },
    );
    expect(html).toContain(
      '<a href="https://australian-text-analytics-platform.github.io/LDaCa_Text_Analytics_Tools/" target="_blank" rel="noopener">Wordflow</a>',
    );
  });
});
