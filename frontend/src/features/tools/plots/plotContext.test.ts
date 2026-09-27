import { expect, it } from 'vitest';
import { decodeAnalysisRequest } from '../common/analysisRequest';
import { plotExportContext, plotPublicationScope } from './plotContext';
import type { PlotDisplay } from './plotModel';
const selection = { hidden: [], rows: [], cells: [], intervals: [], transitions: [] };
const display: PlotDisplay = {
  style: 'line',
  smooth: true,
  normalize: false,
  uncased: false,
  minimum_rows: 0,
  order: 'total',
  year: 2026,
  nonnegative: true,
  orientation: 'horizontal',
};
it('exports mode-specific encodings rather than Trends presentation defaults', () => {
  const heatmap = plotExportContext(
    'heatmap',
    {
      ...decodeAnalysisRequest('heatmap', undefined).request,
      row: 'topic',
      column: 'region',
      measure: 'mean',
      value: 'score',
    },
    display,
  ).join('\n');
  expect(heatmap).toContain('Mean of score');
  expect(heatmap).toContain('Rows: topic · Columns: region');
  expect(heatmap).not.toContain('Smooth');
  expect(heatmap).not.toContain('line');
  const compare = plotExportContext(
    'compare',
    { ...decodeAnalysisRequest('compare', undefined).request, category: 'topic', stack: 'region' },
    display,
  ).join('\n');
  expect(compare).toContain('horizontal stacked bars');
  expect(compare).toContain('Stacks: region');
  const sankey = plotExportContext(
    'sankey',
    { ...decodeAnalysisRequest('sankey', undefined).request, stages: ['before', 'after'] },
    display,
  ).join('\n');
  expect(sankey).toContain('Stages: before → after');
});
it('describes exact disjoint publication counts after selection and hidden groups', () => {
  const request = decodeAnalysisRequest('compare', undefined).request;
  const rows = [
    { cell_key: '["A","yes"]', group_key: '["yes"]', row_count: '9007199254740993' },
    { cell_key: '["A","no"]', group_key: '["no"]', row_count: 2 },
  ];
  const scope = plotPublicationScope('compare', request, rows, {
    ...selection,
    cells: ['["A","yes"]', '["A","no"]'],
    hidden: ['["no"]'],
  });
  expect(scope.summary).toContain(9007199254740993n.toLocaleString());
  expect(scope.details.join(' ')).toContain('Hidden groups excluded: no');
});
it('never sums overlapping Sankey band counts into a claimed original-row count', () => {
  const request = {
    ...decodeAnalysisRequest('sankey', undefined).request,
    stages: ['before', 'after', 'followup'],
  };
  const scope = plotPublicationScope(
    'sankey',
    request,
    [
      { transition_key: '[0,["A","B"]]', row_count: 20 },
      { transition_key: '[1,["B","C"]]', row_count: 20 },
    ],
    { ...selection, transitions: ['[0,["A","B"]]', '[1,["B","C"]]'] },
  );
  expect(scope.summary).toBe('2 selected bands');
  expect(scope.details.join(' ')).toContain('before → after: A · B');
  expect(scope.details.join(' ')).toContain('included once');
});
