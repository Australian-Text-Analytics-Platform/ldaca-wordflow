import { fireEvent, render as renderUi, screen, within } from '@testing-library/react';
import { createRef, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SequentialChart } from '../SequentialChart';
import { buildSequentialChartModel } from '../../hooks/sequentialChartModel';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useUIStore } from '@/stores/uiStore';

const render = (ui: ReactElement) => renderUi(ui, { wrapper: TooltipProvider });

const echartsOptions = vi.hoisted(() => [] as { yAxis?: unknown }[]);
vi.mock('@/features/views/common/components/EChartsView', () => ({
  EChartsView: ({ option }: { option: { yAxis?: unknown } }) => {
    echartsOptions.push(option);
    return <div data-testid="echarts-view" />;
  },
}));

const model = buildSequentialChartModel({
  results: {
    data: [
      {
        time_period: '2024-01',
        period_index: 0,
        group_index: 0,
        period_start: '2024-01-01',
        period_end: '2024-02-01',
        sequential_count: 1,
      },
      {
        time_period: '2024-02',
        period_index: 1,
        group_index: 0,
        period_start: '2024-02-01',
        period_end: '2024-03-01',
        sequential_count: 2,
      },
    ],
  },
  parameters: { column_type: 'datetime' },
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
  selectedPeriodIndices: new Set([0]),
});

describe('SequentialChart', () => {
  it('renders canonical chart model metadata', () => {
    const containerRef = createRef<HTMLDivElement>();

    render(
      <SequentialChart
        model={model}
        minimumGroupCount={0}
        onMinimumGroupCountChange={vi.fn()}
        onToggleGroupIndices={vi.fn()}
        onUncasedChange={vi.fn()}
        onPeriodClick={vi.fn()}
        onClearSelection={vi.fn()}
        dataResetKey="task-1"
        containerRef={containerRef}
      />,
    );

    expect(screen.getByRole('button', { name: 'Count (1/3 · 100.0%)' })).toBeInTheDocument();
    expect(containerRef.current).toBeInstanceOf(HTMLDivElement);
    expect(
      within(screen.getByTestId('filterable-series-controls')).getByRole('button', {
        name: 'Clear selection',
      }),
    ).toBeEnabled();
    expect(screen.queryByText(/data points but only/)).not.toBeInTheDocument();
  });

  it('names the y-axis and keeps count ticks whole (issue 346)', () => {
    render(
      <SequentialChart
        model={model}
        minimumGroupCount={0}
        onMinimumGroupCountChange={vi.fn()}
        onToggleGroupIndices={vi.fn()}
        onUncasedChange={vi.fn()}
        onPeriodClick={vi.fn()}
        onClearSelection={vi.fn()}
        dataResetKey="task-1"
        containerRef={createRef<HTMLDivElement>()}
      />,
    );

    const yAxes = echartsOptions.at(-1)?.yAxis as { name?: string; minInterval?: number }[];
    expect(yAxes[0]).toMatchObject({ name: 'Rows', minInterval: 1 });
  });

  it('opens the legend section of the tutorial from the legend help icon', () => {
    render(
      <SequentialChart
        model={model}
        minimumGroupCount={0}
        onMinimumGroupCountChange={vi.fn()}
        onToggleGroupIndices={vi.fn()}
        onUncasedChange={vi.fn()}
        onPeriodClick={vi.fn()}
        onClearSelection={vi.fn()}
        dataResetKey="task-1"
        containerRef={createRef<HTMLDivElement>()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'About the legend' }));

    expect(useUIStore.getState().documentTarget).toMatchObject({
      file: 'tutorials/sequential-analysis.md',
      anchor: 'help-sequential-legend',
    });
  });

  it('shows the shared Uncased control for string-valued result groups', () => {
    const groupedModel = buildSequentialChartModel({
      results: {
        data: [
          {
            time_period: '2024-01',
            period_index: 0,
            group_index: 0,
            period_start: '2024-01-01',
            period_end: '2024-02-01',
            group: 'Jobs',
            sequential_count: 1,
          },
          {
            time_period: '2024-01',
            period_index: 0,
            group_index: 1,
            period_start: '2024-01-01',
            period_end: '2024-02-01',
            group: 'jobs',
            sequential_count: 2,
          },
        ],
      },
      parameters: { column_type: 'datetime', group_by_columns: ['group'] },
      fallbacks: {
        timeColumn: 'date',
        groupBy: ['group'],
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
      uncased: true,
      excludedGroupIndices: new Set(),
      selectedPeriodIndices: new Set(),
    });

    const onToggleGroupIndices = vi.fn();
    const onMinimumGroupCountChange = vi.fn();
    render(
      <SequentialChart
        model={groupedModel}
        minimumGroupCount={0}
        onMinimumGroupCountChange={onMinimumGroupCountChange}
        onToggleGroupIndices={onToggleGroupIndices}
        onUncasedChange={vi.fn()}
        onPeriodClick={vi.fn()}
        onClearSelection={vi.fn()}
        dataResetKey="task-2"
      />,
    );

    const controls = within(screen.getByTestId('filterable-series-controls'));
    const uncased = controls.getByRole('checkbox', { name: 'Ignore capitals' });
    const minimumCount = controls.getByRole('spinbutton', { name: 'Minimum group count' });
    expect(uncased).toBeChecked();
    expect(minimumCount).toHaveValue(0);
    expect(screen.getByTestId('filterable-series-controls')).toHaveTextContent(
      /Ignore capitals.*Minimum group count/s,
    );
    fireEvent.change(minimumCount, { target: { value: '4' } });
    expect(onMinimumGroupCountChange).toHaveBeenCalledWith(4);
    // Issue 465: the setting explains itself beside its label.
    fireEvent.click(controls.getByRole('button', { name: 'About Minimum group count' }));
    expect(useUIStore.getState().documentTarget).toMatchObject({
      file: 'tutorials/sequential-analysis.md',
      anchor: 'help-sequential-minimum-group-count',
    });
    fireEvent.click(screen.getByRole('button', { name: 'jobs/Jobs (3 · 100.0%)' }));
    expect(onToggleGroupIndices).toHaveBeenCalledWith([0, 1]);
  });

  it('shows guidance when the minimum count filters every grouped series', () => {
    const filteredModel = buildSequentialChartModel({
      results: {
        data: [
          {
            time_period: '2024-01',
            period_index: 0,
            group_index: 0,
            period_start: '2024-01-01',
            period_end: '2024-02-01',
            group: 'Small',
            sequential_count: 9,
          },
        ],
      },
      parameters: { column_type: 'datetime', group_by_columns: ['group'] },
      fallbacks: {
        timeColumn: 'date',
        groupBy: ['group'],
        columnType: 'datetime',
        numericOrigin: null,
        numericInterval: null,
        frequency: 'monthly',
        customIntervalValue: null,
        customIntervalUnit: null,
      },
      chartType: 'line',
      xAxisType: 'category',
      minimumGroupCount: 10,
      uncased: false,
      excludedGroupIndices: new Set(),
      selectedPeriodIndices: new Set(),
    });

    render(
      <SequentialChart
        model={filteredModel}
        minimumGroupCount={10}
        onMinimumGroupCountChange={vi.fn()}
        onToggleGroupIndices={vi.fn()}
        onUncasedChange={vi.fn()}
        onPeriodClick={vi.fn()}
        onClearSelection={vi.fn()}
        dataResetKey="task-filtered"
      />,
    );

    expect(
      screen.getByText(
        'No groups meet the minimum group count of 10. Lower the filter to show groups.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Small/ })).not.toBeInTheDocument();
  });

  it('notes a reference that lacks a Group By column, in bold, with a suggestion pointing to the note', () => {
    const rateModel = buildSequentialChartModel({
      results: {
        data: [
          {
            time_period: '2024-01',
            period_index: 0,
            group_index: 0,
            period_start: '2024-01-01',
            period_end: '2024-02-01',
            party: 'ALP',
            sequential_count: 2,
            reference_rows: 4,
            reference_words: 100,
          },
        ],
        source: {
          node_id: 'matches',
          node_name: 'Matches',
          columns: ['date', 'party'],
          period_count: 1,
          group_count: 1,
          reference: {
            node_id: 'corpus',
            node_name: 'Corpus',
            text_column: 'text',
            tokenizer_model: 'native:plain_words_en',
            group_by_columns: [],
            ignored_group_by_columns: ['party'],
          },
        },
      },
      parameters: { column_type: 'datetime', group_by_columns: ['party'] },
      fallbacks: {
        timeColumn: 'date',
        groupBy: ['party'],
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
      scale: 'per-million-words',
    });

    render(
      <SequentialChart
        model={rateModel}
        minimumGroupCount={0}
        onMinimumGroupCountChange={vi.fn()}
        onToggleGroupIndices={vi.fn()}
        onUncasedChange={vi.fn()}
        onPeriodClick={vi.fn()}
        onClearSelection={vi.fn()}
        dataResetKey="task-rate"
      />,
    );

    const stressed = screen.getByText("'party' is not in the reference", { selector: 'strong' });
    expect(stressed).toBeInTheDocument();
    expect(
      screen.getByText(/Rates divide each group's rows/, { selector: '[data-nudge-target]' }),
    ).toHaveAttribute('data-nudge-target', 'trends-reference-note');
    expect(screen.getByRole('status')).toHaveTextContent(
      "Some groups share a total. 'party' is not in the reference. The groups of that column divide by the whole period’s total rather than their own.",
    );
  });
});
