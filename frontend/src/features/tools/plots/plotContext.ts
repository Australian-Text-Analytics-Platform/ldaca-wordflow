import type { PlotMode, PlotRequest, PlotSelection } from '@/features/project/api';
import { categoryLabel, plotMeasure, type PlotDisplay, type PlotRow } from './plotModel';
import { showValue } from '../common/analysisValue';
import { plotLabels } from './plotState';

export function plotSelectionKeys(mode: PlotMode, selection: PlotSelection): string[] {
  return mode === 'trends'
    ? selection.intervals
    : mode === 'scatter'
      ? selection.rows
      : mode === 'sankey'
        ? selection.transitions
        : selection.cells;
}

/** Exact row counts are additive except for Sankey's overlapping transition unions. */
export function plotPublicationScope(
  mode: PlotMode,
  request: PlotRequest,
  rows: PlotRow[],
  selection: PlotSelection,
) {
  const keys = plotSelectionKeys(mode, selection);
  const field = mode === 'trends' ? 'interval_key' : mode === 'scatter' ? 'row_id' : 'cell_key';
  const selected = new Set(keys);
  const eligible = rows.filter(
    (row) =>
      !selection.hidden.includes(showValue(row.group_key ?? '[]')) &&
      (!keys.length || selected.has(showValue(row[field]))),
  );
  const count =
    mode === 'sankey'
      ? null
      : eligible.reduce(
          (total, row) => total + (mode === 'scatter' ? 1n : BigInt(showValue(row.row_count ?? 0))),
          0n,
        );
  const unit =
    mode === 'trends'
      ? 'interval'
      : mode === 'compare'
        ? 'segment'
        : mode === 'heatmap'
          ? 'cell'
          : mode === 'scatter'
            ? 'point'
            : 'band';
  const labels = keys.slice(0, 20).map((key) => {
    if (mode === 'sankey' && 'stages' in request) {
      const [stage, pair] = JSON.parse(key) as [number, unknown[]];
      return `${String(request.stages[stage])} → ${String(request.stages[stage + 1])}: ${categoryLabel(JSON.stringify(pair))}`;
    }
    return mode === 'heatmap' || mode === 'compare' ? categoryLabel(key) : key;
  });
  return {
    summary: `${keys.length ? `${String(keys.length)} selected ${unit}${keys.length === 1 ? '' : 's'}` : 'All eligible rows'}${count === null ? '' : ` · ${count.toLocaleString()} original rows`}`,
    details: [
      ...(labels.length
        ? [
            `Selected ${unit}${keys.length === 1 ? '' : 's'}: ${labels.join('; ')}${keys.length > labels.length ? `; and ${String(keys.length - labels.length)} more` : ''}`,
          ]
        : []),
      ...(selection.hidden.length
        ? [`Hidden groups excluded: ${selection.hidden.map(categoryLabel).join('; ')}`]
        : []),
      ...(mode === 'sankey'
        ? [
            'Rows matching any selected band are included once. Selected bands do not require a complete path through all stages.',
          ]
        : []),
    ],
  };
}

export function plotExportContext(
  mode: PlotMode,
  request: PlotRequest,
  display: PlotDisplay,
): string[] {
  const presentation =
    mode === 'trends'
      ? ` · ${display.style}${['line', 'area'].includes(display.style) && display.smooth ? ' · Smooth curves' : ''}`
      : mode === 'compare'
        ? ` · ${display.orientation ?? 'vertical'} stacked bars`
        : '';
  const context = [
    `${plotLabels[mode]} · ${request.source.name}${presentation}`,
    plotMeasure(request),
  ];
  if ('axis' in request) {
    const interval = request.interval;
    context.push(
      `Axis: ${request.axis} · Interval: ${interval.type === 'time' ? `${String(interval.step)} ${interval.unit}${interval.step === 1 ? '' : 's'}` : `${interval.width} (origin: ${interval.origin ?? 'automatic'})`}`,
    );
    if (display.timezone) context.push(`Timezone: ${display.timezone}`);
    if (request.groups.length) context.push(`Groups: ${request.groups.join(', ')}`);
    if (display.style === 'calendar') context.push(`Calendar year: ${String(display.year)}`);
    context.push(`Minimum rows per group: ${String(display.minimum_rows)}`);
  } else if ('category' in request) {
    context.push(
      `Category: ${request.category}${request.stack ? ` · Stacks: ${request.stack}` : ''}`,
    );
  } else if ('row' in request) {
    context.push(
      `Rows: ${request.row} · Columns: ${request.column}`,
      'Blank cells: no usable measurement or no observations. Zero is a measured value.',
    );
  } else if ('x' in request) {
    context.push(`X: ${request.x} · Y: ${request.y}`);
    if (request.color) context.push(`Color: ${request.color}`);
    if (request.size) context.push(`Bubble area: ${request.size} · Hollow markers: zero`);
    if (request.label) context.push(`Labels: ${request.label}`);
  } else context.push(`Stages: ${request.stages.join(' → ')}`);
  if (display.normalize) context.push('Percentage of all eligible groups, including hidden groups');
  context.push(display.uncased ? 'Categories: case variants combined' : 'Categories: exact case');
  return context;
}
