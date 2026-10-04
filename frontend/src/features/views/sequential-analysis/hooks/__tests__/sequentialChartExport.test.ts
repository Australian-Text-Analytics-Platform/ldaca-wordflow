import { describe, expect, it } from 'vitest';

import { buildSequentialChartExportMetadata } from '../sequentialChartExport';
import { buildSequentialChartModel } from '../sequentialChartModel';

describe('buildSequentialChartExportMetadata', () => {
  it('reuses canonical summary, counts, and grouped legend entries', () => {
    const fallbacks = {
      timeColumn: '',
      groupBy: [],
      columnType: 'datetime' as const,
      numericOrigin: null,
      numericInterval: null,
      frequency: 'daily' as const,
      customIntervalValue: null,
      customIntervalUnit: null,
    };
    const base = buildSequentialChartModel({
      results: {
        data: [
          {
            period_index: 0,
            group_index: 0,
            time_period: '2024-01',
            period_start: '2024-01-01',
            period_end: '2024-02-01',
            speaker: 'Ada',
            sequential_count: 2,
          },
          {
            period_index: 0,
            group_index: 1,
            time_period: '2024-01',
            period_start: '2024-01-01',
            period_end: '2024-02-01',
            speaker: 'Grace',
            sequential_count: 3,
          },
        ],
      },
      parameters: {
        time_column: 'date',
        column_type: 'datetime',
        frequency: 'monthly',
        group_by_columns: ['speaker'],
      },
      fallbacks,
      chartType: 'area',
      xAxisType: 'category',
      minimumGroupCount: 0,
      uncased: false,
      excludedGroupIndices: new Set(),
      selectedPeriodIndices: new Set(),
    });
    const graceIndex = base.groups.find((group) => group.label === 'Grace')?.memberGroupIndices[0];
    const model = buildSequentialChartModel({
      results: {
        data: [
          {
            period_index: 0,
            group_index: 0,
            time_period: '2024-01',
            period_start: '2024-01-01',
            period_end: '2024-02-01',
            speaker: 'Ada',
            sequential_count: 2,
          },
          {
            period_index: 0,
            group_index: 1,
            time_period: '2024-01',
            period_start: '2024-01-01',
            period_end: '2024-02-01',
            speaker: 'Grace',
            sequential_count: 3,
          },
        ],
      },
      parameters: {
        time_column: 'date',
        column_type: 'datetime',
        frequency: 'monthly',
        group_by_columns: ['speaker'],
      },
      fallbacks,
      chartType: 'area',
      xAxisType: 'category',
      minimumGroupCount: 3,
      uncased: false,
      excludedGroupIndices: new Set(graceIndex === undefined ? [] : [graceIndex]),
      selectedPeriodIndices: new Set(),
    });

    const metadata = buildSequentialChartExportMetadata({ nodeName: 'Interviews', model });

    expect(metadata.header).toEqual([
      { label: 'Data Block', value: 'Interviews' },
      { label: 'Time column', value: 'date' },
      { label: 'Period', value: 'monthly' },
      { label: 'Groups', value: 'speaker' },
    ]);
    expect(metadata.legend).toEqual([
      { label: 'Grace (3 · 100.0% · Hidden)', color: '#16a34a', type: 'area', hidden: true },
    ]);
  });

  it('says the values are percentages when normalised (issue 219)', () => {
    const period = (group: string, count: number, index: number) => ({
      period_index: 0,
      group_index: index,
      time_period: '2024-01',
      period_start: '2024-01-01',
      period_end: '2024-02-01',
      speaker: group,
      sequential_count: count,
    });
    const model = buildSequentialChartModel({
      results: { data: [period('Ada', 2, 0), period('Grace', 3, 1)] },
      parameters: { column_type: 'datetime', group_by_columns: ['speaker'] },
      fallbacks: {
        timeColumn: 'date',
        groupBy: [],
        columnType: 'datetime',
        numericOrigin: null,
        numericInterval: null,
        frequency: 'monthly',
        customIntervalValue: null,
        customIntervalUnit: null,
      },
      chartType: 'line',
      xAxisType: 'category',
      minimumGroupCount: 0,
      uncased: false,
      excludedGroupIndices: new Set(),
      selectedPeriodIndices: new Set(),
      normalise: true,
    });
    const { header } = buildSequentialChartExportMetadata({ nodeName: 'speeches', model });
    expect(header.at(-1)).toEqual({
      label: 'Values',
      value: 'Percentage of all rows in each period',
    });
  });
});
