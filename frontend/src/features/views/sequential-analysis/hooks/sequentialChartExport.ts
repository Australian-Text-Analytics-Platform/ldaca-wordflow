import type { ChartExportHeaderItem, ChartExportLegendItem } from '@/lib/chartExport';
import type { SequentialChartModel } from './sequentialChartModel';

interface SequentialChartExportInput {
  nodeName: string;
  model: SequentialChartModel;
}

export interface SequentialChartExportMetadata {
  header: ChartExportHeaderItem[];
  legend: ChartExportLegendItem[];
}

/**
 * Builds the header and legend metadata embedded in downloaded sequential charts.
 * Used by: SequentialAnalysisFeature's download handler because export context
 * should stay in sync with the rendered result summary without keeping the
 * formatting rules inside the feature component.
 * Flow: format the model's canonical result summary/counts and reuse its
 * export-ready legend, so downloaded metadata cannot rebuild series identity
 * differently from the rendered chart.
 */
export function buildSequentialChartExportMetadata({
  nodeName,
  model,
}: SequentialChartExportInput): SequentialChartExportMetadata {
  const { summary, counts } = model;
  // Plain words (issue 278). The old "Total 219/29936" paired the chart's
  // points with rows and read as a riddle; the Shown and Chosen pairs
  // followed the filter and the selection, which a saved chart does not have.
  const header: ChartExportHeaderItem[] = [
    { label: 'Data Block', value: nodeName },
    { label: 'Time column', value: summary.timeColumn || '—' },
    { label: 'Period', value: summary.frequencyDisplay },
    { label: 'Rows counted', value: counts.totalDocumentCount.toLocaleString() },
    {
      label: 'Points in the result',
      value: `${counts.totalPointCount.toLocaleString()} (one per period and group)`,
    },
    { label: 'Groups', value: summary.groupBy.length ? summary.groupBy.join(', ') : 'None' },
    // Normalise to 100% (issue 219) plots shares, not counts.
    ...(model.normalised
      ? [{ label: 'Values', value: 'Percentage of all rows in each period' }]
      : []),
  ];
  return { header, legend: model.legend };
}
