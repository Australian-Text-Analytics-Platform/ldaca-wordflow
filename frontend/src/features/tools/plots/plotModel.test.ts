import { describe, it, expect } from 'vitest';
import { buildPlot, categoryLabel, type PlotDisplay } from './plotModel';
import { decodeAnalysisRequest, matchesAnalysisRequest } from '../common/analysisRequest';
import type { PlotSelection, CompareRequest, TrendsRequest } from '@/features/project/api';
const display: PlotDisplay = {
  style: 'bar',
  smooth: true,
  normalize: true,
  uncased: false,
  minimum_rows: 0,
  order: 'total',
  year: 2026,
  nonnegative: true,
};
const selection: PlotSelection = {
  hidden: [],
  intervals: [],
  rows: [],
  cells: [],
  transitions: [],
};
describe('Plots semantic projections', () => {
  it('keeps hidden groups in the percentage denominator', () => {
    const request: CompareRequest = {
      source: { schema: 'data', name: 'x' },
      category: 'a',
      stack: 'b',
      measure: 'count',
      value: null,
    };
    const rows = [
      {
        category_key: '["A"]',
        group_key: '["yes"]',
        cell_key: '["A","yes"]',
        value: '3',
        row_count: '3',
      },
      {
        category_key: '["A"]',
        group_key: '["no"]',
        cell_key: '["A","no"]',
        value: '1',
        row_count: '1',
      },
    ];
    const model = buildPlot('compare', request, rows, display, {
      ...selection,
      hidden: ['["no"]'],
    });
    expect(model.points).toHaveLength(1);
    expect(model.points[0]?.y).toBe(75);
  });
  it('never stacks signed sums, means or medians', () => {
    const request = decodeAnalysisRequest('trends', undefined).request;
    const result = buildPlot(
      'trends',
      { ...request, measure: 'mean' },
      [{ interval_key: '1', axis_value: '1', group_key: '[]', value: '2', row_count: '3' }],
      { ...display, normalize: false, nonnegative: false },
      { ...selection },
    );
    const series = result.option.series as { stack?: string }[];
    expect(series[0]?.stack).toBeUndefined();
  });
  it('keeps zero totals undefined and missing intervals distinct from missing measurements', () => {
    const request: TrendsRequest = {
      ...decodeAnalysisRequest('trends', undefined).request,
      axis: 'x',
      interval: { type: 'numeric', width: '1', origin: null },
    };
    const result = buildPlot(
      'trends',
      request,
      [
        { interval_key: '0', axis_value: '0', group_key: '[]', value: '0', row_count: '0' },
        { interval_key: '1', axis_value: '1', group_key: '[]', value: null, row_count: '1' },
      ],
      display,
      selection,
    );
    const series = result.option.series as { data: { value: unknown[] }[] }[];
    expect(series[0]?.data.map((p) => p.value[1])).toEqual([null, null]);
  });
  it('distinguishes null, empty and literal labels', () => {
    expect(categoryLabel('[null]')).not.toBe(categoryLabel('["(Missing)"]'));
    expect(categoryLabel('[""]')).not.toBe(categoryLabel('["(empty)"]'));
  });
  it('restores supported siblings while reporting incompatible saved fields', () => {
    const restored = decodeAnalysisRequest('trends', {
      source: { schema: 'data', name: 'x' },
      axis: 'year',
      groups: ['one', 4, 'two', 'three', 'four'],
      interval: { type: 'numeric', width: 3, origin: null },
      measure: 'future',
      timezone: 'UTC',
      future: true,
    });
    expect(restored.request.axis).toBe('year');
    expect(restored.request.groups).toEqual(['one', 'two', 'three']);
    expect(restored.issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(['groups[1]', 'groups[4]', 'interval.width', 'measure', 'future']),
    );
    expect(
      matchesAnalysisRequest('trends', restored.request, { ...restored.request, future: true }),
    ).toBe(false);
  });
});

it('preserves adjacent unsafe integer coordinates and exact tooltip values', () => {
  const request = { ...decodeAnalysisRequest('scatter', undefined).request, x: 'x', y: 'y' };
  const model = buildPlot(
    'scatter',
    request,
    [
      { row_id: '1', x: 9007199254740992n, y: 1, size: 1, group_key: '[]' },
      { row_id: '2', x: 9007199254740993n, y: 2, size: 1, group_key: '[]' },
    ],
    display,
    selection,
  );
  expect(model.points.map((p) => p.x)).toEqual([0, 1]);
  expect(model.points[1]?.summary).toContain('9007199254740993');
});

describe('Trends calendar and axis rendering', () => {
  const request: TrendsRequest = {
    ...decodeAnalysisRequest('trends', undefined).request,
    axis: 'day',
    groups: ['topic'],
  };
  const rows = ['2025-12-24', '2025-12-31', '2026-01-01', '2026-01-08'].flatMap((day) =>
    ['A long category label that must wrap without overlapping the month labels', 'B'].map(
      (group) => ({
        group_key: JSON.stringify([group]),
        interval_key: day,
        axis_value: day,
        value: day.endsWith('01') ? null : day.endsWith('31') ? '0' : '4',
        row_count: '4',
      }),
    ),
  );
  it('uses complete intersecting months, shared before hiding, and preserves missing values', () => {
    const calendar = (year: number, hidden: string[] = []) =>
      buildPlot(
        'trends',
        request,
        rows,
        { ...display, style: 'calendar', normalize: false, year },
        { ...selection, hidden },
      );
    const first = calendar(2025);
    const options = first.option.calendar as { range: string[]; cellSize: number[]; top: number }[];
    expect(options.map((c) => c.range)).toEqual([
      ['2025-12-01', '2025-12-31'],
      ['2025-12-01', '2025-12-31'],
    ]);
    expect(options[0]?.cellSize).toEqual([22, 20]);
    const titles = first.option.title as { text: string; top: number }[];
    expect(titles[0]?.text).toContain('\n');
    expect(options[0]?.top).toBeGreaterThan((titles[0]?.top ?? 0) + 36);
    const hidden = calendar(2025, ['["B"]']);
    expect((hidden.option.calendar as typeof options)[0]?.range).toEqual(options[0]?.range);
    const january = calendar(2026);
    expect((january.option.calendar as typeof options)[0]?.range).toEqual([
      '2026-01-01',
      '2026-01-31',
    ]);
    const series = january.option.series as { data: { value: unknown[] }[] }[];
    expect(series[0]?.data.map((p) => p.value)).toEqual([
      ['2026-01-01', null],
      ['2026-01-08', 4],
    ]);
    expect(january.points.every((p) => Number.isFinite(p.x))).toBe(true);
  });
  it('uses native overlap suppression and daily timezone labels without midnight times', () => {
    const model = buildPlot(
      'trends',
      request,
      rows,
      { ...display, style: 'line', timezone: 'UTC' },
      selection,
    );
    const axis = model.option.xAxis as {
      type: string;
      axisLabel: { hideOverlap: boolean; formatter: (n: number) => string };
    };
    expect(axis.type).toBe('time');
    expect(axis.axisLabel.hideOverlap).toBe(true);
    expect(axis.axisLabel.formatter(Date.UTC(2026, 0, 8))).toContain('2026');
    expect(axis.axisLabel.formatter(Date.UTC(2026, 0, 8))).not.toContain(':');
    const series = model.option.series as { id: string }[];
    expect(series.map((s) => s.id)).toEqual(rows.slice(0, 2).map((r) => r.group_key));
  });
});

it('rotates Compare without changing category identities or the percentage denominator', () => {
  const request = {
    ...decodeAnalysisRequest('compare', undefined).request,
    category: 'topic',
    stack: 'region',
  };
  const rows = [
    {
      category_key: '["A long research category"]',
      group_key: '["North"]',
      cell_key: '["A long research category","North"]',
      value: 3,
      row_count: 3,
    },
    {
      category_key: '["A long research category"]',
      group_key: '["South"]',
      cell_key: '["A long research category","South"]',
      value: 1,
      row_count: 1,
    },
  ];
  const model = buildPlot(
    'compare',
    request,
    rows,
    { ...display, orientation: 'horizontal' },
    { ...selection, hidden: ['["South"]'] },
  );
  expect(model.points[0]).toMatchObject({ x: 75, y: 0, key: rows[0]?.cell_key });
  expect(model.option.yAxis).toMatchObject({
    type: 'category',
    inverse: true,
    name: 'topic',
    axisLabel: { interval: 0 },
  });
  expect(model.option.xAxis).toMatchObject({ name: 'Percentage (%)' });
});

it('keeps Heatmap values and opacity intact when outlining a selection', () => {
  const request = {
    ...decodeAnalysisRequest('heatmap', undefined).request,
    row: 'topic',
    column: 'region',
    measure: 'mean' as const,
    value: 'score',
  };
  const rows = [0, 1].map((i) => ({
    category_key: '["A"]',
    column_key: JSON.stringify([i]),
    cell_key: JSON.stringify(['A', i]),
    value: i * 10,
    row_count: 5,
  }));
  const model = buildPlot('heatmap', request, rows, display, { ...selection, cells: ['["A",0]'] });
  const data = (
    model.option.series as {
      data: { value: number[]; itemStyle: { opacity: number }; selectionOutline: boolean }[];
    }[]
  )[0]?.data;
  expect(data?.map((d) => d.value[2])).toEqual([0, 10]);
  expect(data?.map((d) => d.itemStyle.opacity)).toEqual([1, 1]);
  expect(data?.map((d) => d.selectionOutline)).toEqual([true, false]);
  expect(model.option.title).toMatchObject([{ text: 'Mean of score' }]);
  expect(model.option.dataZoom).toHaveLength(4);
});

it('keeps Scatter bubble area stable after hiding the largest group', () => {
  const request = { ...decodeAnalysisRequest('scatter', undefined).request, size: 'weight' };
  const rows = [
    { row_id: '1', group_key: '["A"]', x: 1, y: 2, size: 25 },
    { row_id: '2', group_key: '["B"]', x: 1, y: 2, size: 100 },
  ];
  const shown = buildPlot('scatter', request, rows, display, selection);
  const hidden = buildPlot('scatter', request, rows, display, { ...selection, hidden: ['["B"]'] });
  const series = (model: typeof shown) =>
    model.option.series as { data: { symbolSize: number; itemStyle: { opacity: number } }[] }[];
  expect(series(shown)[0]?.data[0]?.symbolSize).toBe(14);
  expect(series(hidden)[0]?.data[0]?.symbolSize).toBe(14);
  expect(series(hidden)[0]?.data[0]?.itemStyle.opacity).toBe(0.6);
});

it('names Sankey stages and colors equal categories consistently across stages', () => {
  const request = {
    ...decodeAnalysisRequest('sankey', undefined).request,
    stages: ['before', 'after', 'followup'],
  };
  const model = buildPlot(
    'sankey',
    request,
    [
      { transition_key: '[0,["Yes","Yes"]]', value: 8, row_count: 8 },
      { transition_key: '[1,["Yes",null]]', value: 3, row_count: 3 },
    ],
    display,
    selection,
  );
  const nodes = (
    model.option.series as { data: { itemStyle: { color: string }; summary: string }[] }[]
  )[0]?.data;
  expect(nodes?.[0]?.itemStyle.color).toBe(nodes?.[1]?.itemStyle.color);
  expect(nodes?.[0]?.summary).toBe('before: Yes');
  expect(model.points[1]?.summary).toContain('after → followup');
  expect(model.option.title).toMatchObject([
    { text: 'before' },
    { text: 'after' },
    { text: 'followup' },
  ]);
});
