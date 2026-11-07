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
  const { summary } = model;
  // Plain words (issues 278 and 286). No totals: the result's rows and points
  // include groups the chart hides, so a total could not be read against the
  // legend; the legend carries each shown group's count.
  const header: ChartExportHeaderItem[] = [
    { label: 'Data Block', value: nodeName },
    { label: 'Time column', value: summary.timeColumn || '—' },
    { label: 'Period', value: summary.frequencyDisplay },
    {
      label: 'Groups',
      value: summary.groupBy.length ? summary.groupBy.join(', ') : 'None',
    },
    ...(summary.reference
      ? [
          {
            label: 'Reference',
            value: summary.reference.textColumn
              ? `${summary.reference.nodeName}, words in ${summary.reference.textColumn}`
              : `${summary.reference.nodeName}, rows`,
          },
        ]
      : []),
    // Composition (issue 219) and the rates plot shares, not counts.
    ...(model.scale === 'composition'
      ? [{ label: 'Values', value: 'Percentage of all rows in each period' }]
      : model.scale === 'per-million-words'
        ? [
            {
              label: 'Values',
              value: 'Rows per million words of the reference in each period',
            },
          ]
        : model.scale === 'per-100k-words'
          ? [
              {
                label: 'Values',
                value: 'Rows per 100,000 words of the reference in each period',
              },
            ]
          : model.scale === 'percent-of-rows'
            ? [
                {
                  label: 'Values',
                  value: "Percentage of the reference's rows in each period",
                },
              ]
            : []),
  ];
  return { header, legend: model.legend };
}
