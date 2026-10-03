import { describe, expect, it } from 'vitest';

import { buildMultiSeriesChartOption } from '../MultiSeriesChart';
import { SLIDER_OVERVIEW_ID, sliderOverviewData } from '../../sliderOverview';

/** The chart's group series, without the hidden slider overview (issue 269). */
const groupSeries = (option: ReturnType<typeof buildMultiSeriesChartOption>) =>
  (option.series as Record<string, unknown>[]).filter((item) => item.id !== SLIDER_OVERVIEW_ID);

const data = [
  { period: '2024-01', alpha: 2, beta: 1 },
  { period: '2024-02', alpha: 3, beta: 4 },
];
const series = [
  { key: 'alpha', label: 'Alpha', color: '#123456' },
  { key: 'beta', label: 'Beta', color: '#abcdef' },
];

describe('buildMultiSeriesChartOption', () => {
  it('lets the caller write each tooltip value (issue 219)', () => {
    const option = buildMultiSeriesChartOption({
      data,
      xKey: 'period',
      series,
      tooltip: {
        valueFormatter: (key, row) => `${String(row[key])} rows`,
      },
    });
    const formatter = (option.tooltip as { formatter: (params: unknown) => string }).formatter;
    expect(formatter([{ value: data[0] }])).toBe('2024-01\nAlpha: 2 rows\nBeta: 1 rows');
  });

  it('starts each tooltip line with its colour dot (issue 243)', () => {
    const option = buildMultiSeriesChartOption({ data, xKey: 'period', series, tooltip: {} });
    const formatter = (option.tooltip as { formatter: (params: unknown) => string }).formatter;
    expect(
      formatter([
        { value: data[0], seriesId: 'beta', marker: '{marker1|}' },
        { value: data[0], seriesId: 'alpha', marker: '{marker0|}' },
      ]),
    ).toBe('2024-01\n{marker0|}Alpha: 2\n{marker1|}Beta: 1');
  });

  it('draws stacked charts with the first legend group on top (issue 243)', () => {
    const ids = (chartType: 'stacked-bar' | 'area' | 'bar' | 'line') =>
      (
        buildMultiSeriesChartOption({ data, xKey: 'period', series, chartType }).series as {
          id: string;
        }[]
      )
        .map((item) => item.id)
        .filter((id) => !id.startsWith('__wordflow'));
    // ECharts stacks the first series at the bottom, so the first group comes last.
    expect(ids('stacked-bar')).toEqual(['beta', 'alpha']);
    expect(ids('area')).toEqual(['beta', 'alpha']);
    expect(ids('bar')).toEqual(['alpha', 'beta']);
    expect(ids('line')).toEqual(['alpha', 'beta']);
  });

  it('stacks Stacked bars and stripes every other period behind side-by-side Bars (issue 226)', () => {
    const three = [...data, { period: '2024-03', alpha: 1, beta: 2 }];
    interface Series {
      id: string;
      type: string;
      stack?: string;
      markArea?: { data: unknown[] };
    }
    const seriesOf = (option: ReturnType<typeof buildMultiSeriesChartOption>) =>
      option.series as Series[];

    const stacked = seriesOf(
      buildMultiSeriesChartOption({
        data: three,
        xKey: 'period',
        series,
        chartType: 'stacked-bar',
      }),
    );
    expect(stacked.filter((item) => item.type === 'bar').every((item) => item.stack)).toBe(true);
    expect(stacked.some((item) => item.id === '__wordflow_period_stripes__')).toBe(false);

    const sideBySide = seriesOf(
      buildMultiSeriesChartOption({ data: three, xKey: 'period', series, chartType: 'bar' }),
    );
    expect(sideBySide.filter((item) => item.type === 'bar').some((item) => item.stack)).toBe(false);
    // Even spacing: the category axis shades every other period's slot.
    const sideOption = buildMultiSeriesChartOption({
      data: three,
      xKey: 'period',
      series,
      chartType: 'bar',
    });
    expect((sideOption.xAxis as { splitArea?: unknown }).splitArea).toMatchObject({
      show: true,
      interval: 0,
    });

    const numeric = seriesOf(
      buildMultiSeriesChartOption({
        data: [
          { x: 0, alpha: 1 },
          { x: 10, alpha: 2 },
          { x: 30, alpha: 3 },
        ],
        xKey: 'x',
        series,
        chartType: 'bar',
        xAxis: { type: 'value' },
      }),
    ).find((item) => item.id === '__wordflow_period_stripes__');
    // Halfway to each neighbour: 5 to 20 around x = 10.
    expect(numeric?.markArea?.data).toEqual([[{ xAxis: 5 }, { xAxis: 20 }]]);
  });

  it('uses an ECharts dataset and explicit dimension encoding', () => {
    const option = buildMultiSeriesChartOption({ data, xKey: 'period', series });
    expect(option.dataset).toMatchObject({
      dimensions: ['period', 'alpha', 'beta'],
    });
    expect(option.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'alpha',
          type: 'line',
          encode: { x: 'period', y: 'alpha', tooltip: ['alpha'] },
        }),
      ]),
    );
    expect(option.grid).toMatchObject({ containLabel: true, bottom: 32 });
    expect(groupSeries(option)[0]).toMatchObject({ smooth: true });
  });

  it('maps bar and stacked area modes without changing the input rows', () => {
    const bar = buildMultiSeriesChartOption({ data, xKey: 'period', series, chartType: 'bar' });
    expect(groupSeries(bar)[0]).toMatchObject({
      type: 'bar',
      itemStyle: { color: '#123456', borderRadius: [6, 6, 0, 0] },
    });

    const area = buildMultiSeriesChartOption({ data, xKey: 'period', series, chartType: 'area' });
    expect(groupSeries(area)[0]).toMatchObject({
      type: 'line',
      smooth: true,
      stack: 'wordflow-total',
    });
    expect(groupSeries(area)[0]?.areaStyle).toBeTruthy();
    expect(data[0]).not.toHaveProperty('__wordflow_selected__');
  });

  it('uses native ECharts states to soften focused-series fading', () => {
    const line = buildMultiSeriesChartOption({ data, xKey: 'period', series });
    expect(groupSeries(line)[0]).toMatchObject({
      emphasis: { focus: 'series', scale: false },
      blur: {
        itemStyle: { opacity: 0.45 },
        lineStyle: { opacity: 0.45 },
      },
    });

    const bar = buildMultiSeriesChartOption({ data, xKey: 'period', series, chartType: 'bar' });
    expect(groupSeries(bar)[0]).toMatchObject({
      emphasis: { focus: 'series' },
      blur: { itemStyle: { opacity: 0.45 } },
    });

    const area = buildMultiSeriesChartOption({ data, xKey: 'period', series, chartType: 'area' });
    expect(groupSeries(area)[0]).toMatchObject({
      areaStyle: { opacity: 0.35 },
      blur: {
        itemStyle: { opacity: 0.45 },
        lineStyle: { opacity: 0.45 },
        areaStyle: { opacity: 0.1575 },
      },
    });
  });

  it('encodes bar selection opacity while retaining complete dataset indices', () => {
    const option = buildMultiSeriesChartOption({
      data,
      xKey: 'period',
      series,
      chartType: 'bar',
      selection: {
        selectedIndices: new Set([1]),
        onSelect: () => undefined,
      },
    });
    const dataset = option.dataset as { source: Record<string, unknown>[] };
    expect(dataset.source.map((row) => row.__wordflow_selected__)).toEqual([0, 1]);
    expect(option.visualMap).toMatchObject({
      type: 'piecewise',
      dimension: '__wordflow_selected__',
    });

    const line = buildMultiSeriesChartOption({
      data,
      xKey: 'period',
      series,
      selection: {
        selectedIndices: new Set([1]),
        onSelect: () => undefined,
      },
    });
    expect(line.visualMap).toBeUndefined();
    const lineSeries = groupSeries(line)[0];
    const symbol = lineSeries?.symbol as (value: unknown, params: { dataIndex?: number }) => string;
    const symbolSize = lineSeries?.symbolSize as (
      value: unknown,
      params: { dataIndex?: number },
    ) => number;
    expect(symbol(undefined, { dataIndex: 0 })).toBe('emptyCircle');
    expect(symbol(undefined, { dataIndex: 1 })).toBe('circle');
    // Selected points are much larger, with a white ring (issue 190).
    expect(symbolSize(undefined, { dataIndex: 1 })).toBeGreaterThan(
      2 * symbolSize(undefined, { dataIndex: 0 }),
    );
    expect(lineSeries).toMatchObject({ itemStyle: { borderColor: '#ffffff', borderWidth: 2 } });
    // A band shades the selected period on a hidden second axis.
    const band = groupSeries(line).at(-1);
    expect(band).toMatchObject({ type: 'bar', yAxisIndex: 1, silent: true });
    const lineDataset = line.dataset as { source: Record<string, unknown>[] };
    expect(lineDataset.source.map((row) => row.__wordflow_selection_band__)).toEqual([null, 1]);
    expect(Array.isArray(line.yAxis) && line.yAxis[1]).toMatchObject({ show: false, max: 1 });
  });

  it('shades selected runs on a numeric axis halfway to the neighbouring points (issue 190)', () => {
    const numeric = buildMultiSeriesChartOption({
      data: [{ x: 0 }, { x: 10 }, { x: 20 }, { x: 30 }].map((row) => ({ ...row, a: 1 })),
      xKey: 'x',
      series: [{ key: 'a', color: '#2563eb' }],
      xAxis: { type: 'value' },
      selection: { selectedIndices: new Set([1, 2]), onSelect: () => undefined },
    });
    const first = groupSeries(numeric)[0] as { markArea?: { data: unknown } } | undefined;
    expect(first?.markArea?.data).toEqual([[{ xAxis: 5 }, { xAxis: 25 }]]);
  });

  it('accepts native ECharts axis options without compatibility translation', () => {
    const option = buildMultiSeriesChartOption({
      data,
      xKey: 'period',
      series,
      xAxis: {
        type: 'value',
        min: 'dataMin',
        max: 'dataMax',
        splitNumber: 10,
        axisLabel: { rotate: 45 },
      },
      yAxis: { minInterval: 1 },
    });

    expect(option.xAxis).toMatchObject({
      type: 'value',
      min: 'dataMin',
      max: 'dataMax',
      splitNumber: 10,
      axisLabel: { rotate: 45 },
    });
    expect((option.yAxis as unknown[])[0]).toMatchObject({ type: 'value', minInterval: 1 });
  });

  describe('range slider overview (issue 269)', () => {
    const day = 86_400_000;

    it('is the first series, hidden from tooltips and clicks, on its own axis', () => {
      const option = buildMultiSeriesChartOption({ data, xKey: 'period', series });
      const first = (option.series as Record<string, unknown>[])[0];
      expect(first).toMatchObject({
        id: SLIDER_OVERVIEW_ID,
        silent: true,
        tooltip: { show: false },
        yAxisIndex: 1,
        data: [
          ['2024-01', 3],
          ['2024-02', 7],
        ],
      });
      expect((option.yAxis as Record<string, unknown>[])[1]).toMatchObject({ show: false });
    });

    it('counts the amount the caller asks for, such as counts behind percentages', () => {
      const option = buildMultiSeriesChartOption({
        data: [{ period: 'a', alpha: 50, beta: 50, n_alpha: 2, n_beta: 6 }],
        xKey: 'period',
        series,
        overviewValue: (row, key) => Number(row[`n_${key}`]),
      });
      expect((option.series as Record<string, unknown>[])[0]).toMatchObject({ data: [['a', 8]] });
    });

    it('shows a gap where To scale has empty periods', () => {
      const days = [0, 1, 2, 7, 8].map((offset) => ({ x: offset * day }));
      const samples = sliderOverviewData({
        data: days,
        xKey: 'x',
        xAxisType: 'value',
        totals: [1, 1, 1, 1, 1],
        samples: 81,
      }) as [number, number][];
      const at = (offset: number) =>
        samples.find(([x]) => Math.abs(x - offset * day) < day / 20)?.[1];
      expect(at(1)).toBe(1);
      expect(at(4.5)).toBe(0);
      expect(at(7)).toBe(1);
    });

    it('leaves no false gaps between consecutive months of different lengths', () => {
      const months = Array.from({ length: 24 }, (_, index) => ({
        x: Date.UTC(2020, index, 1),
      }));
      const samples = sliderOverviewData({
        data: months,
        xKey: 'x',
        xAxisType: 'value',
        totals: months.map(() => 5),
      }) as [number, number][];
      expect(samples.every(([, value]) => value === 5)).toBe(true);
    });

    it('keeps one point per period on an evenly spaced axis', () => {
      expect(
        sliderOverviewData({ data, xKey: 'period', xAxisType: 'category', totals: [3, 7] }),
      ).toEqual([
        ['2024-01', 3],
        ['2024-02', 7],
      ]);
    });
  });
});
