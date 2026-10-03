import { ResultChartFit, ResultFrame } from '@/features/views/common/components/ResultFrame';
import React from 'react';

import { MultiSeriesChart } from '@/features/views/common/components/MultiSeriesChart';
import { FilterableSeriesControls } from '@/features/views/common/components/FilterableSeriesControls';
import { Input } from '@/components/ui/input';
import type { SequentialChartModel } from '../hooks/sequentialChartModel';

interface SequentialChartProps {
  model: SequentialChartModel;
  onToggleGroupIndices: (groupIndices: readonly number[]) => void;
  onUncasedChange: (value: boolean) => void;
  minimumGroupCount: number;
  onMinimumGroupCountChange: (value: number) => void;
  onPeriodClick: (index: number, shiftHeld: boolean) => void;
  onClearSelection: () => void;
  dataResetKey: string;
  toolbarStart?: React.ReactNode;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

const CHART_HEIGHT_PX = 400;
const TRENDS_LEGEND_HELP = {
  targetKey: 'analysis.sequential-analysis.legend',
  tooltip:
    'Each entry shows the number of rows in that group and its share of the rows in all groups listed here, hidden ones included, for example (40 · 30.0%). Hiding a group does not change the shares. When periods are selected, the count reads selected/total, for example (12/40 · 30.0%). Click an entry to hide or show it.',
};

/**
 * Renders the chart and interaction controls from a canonical Sequential model.
 *
 * Rendered by: `SequentialAnalysisResultsPanel`. The pure model already owns
 * row/axis/series/legend shaping; this component only binds ECharts selection,
 * legend clicks, resize container identity, and chart selection controls.
 */
export function SequentialChart({
  model,
  onToggleGroupIndices,
  onUncasedChange,
  minimumGroupCount,
  onMinimumGroupCountChange,
  onPeriodClick,
  onClearSelection,
  dataResetKey,
  toolbarStart,
  containerRef,
}: SequentialChartProps) {
  // A refreshed result can invalidate indices held by the interaction hook.
  // Keep Clear enabled for that stale state even though the model deliberately
  // excludes invalid indices from rendering.
  const hasSelection = model.selection.selectedCount > 0 || model.selection.hasInvalidSelection;
  const allGroupsFiltered =
    model.groupFilter.totalGroupCount > 0 &&
    model.groupFilter.filteredGroupCount === model.groupFilter.totalGroupCount;
  if (!model.chartData.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-surface-border-foreground/30 text-body text-description">
        {model.status === 'malformed'
          ? 'The sequential analysis result is malformed and has no chartable rows.'
          : 'No Trends data available. Adjust your configuration and try again.'}
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      {model.status === 'malformed' ? (
        <div className="mb-3 rounded-md border border-warning bg-warning-background px-3 py-2 text-body text-foreground">
          Some malformed result rows were ignored ({String(model.diagnostics.length)} issue
          {model.diagnostics.length === 1 ? '' : 's'}).
        </div>
      ) : null}
      {allGroupsFiltered ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-surface-border-foreground/30 px-4 text-center text-body text-description">
          No groups meet the minimum group count of {String(model.groupFilter.minimumCount)}. Lower
          the filter to show groups.
        </div>
      ) : (
        <ResultFrame storageKey="trends.chart" minHeight={240}>
          {(frameHeight) => (
            <ResultChartFit frameHeight={frameHeight} fallbackHeight={CHART_HEIGHT_PX}>
              {(chartHeight) => (
                <MultiSeriesChart
                  data={model.axisData}
                  xKey={model.xKey}
                  series={model.series}
                  chartType={model.chartType}
                  xAxis={model.xAxis}
                  height={chartHeight}
                  overviewValue={model.overviewValue}
                  tooltip={{
                    labelFormatter: model.tooltip.labelFormatter,
                    valueFormatter: model.tooltip.valueFormatter,
                  }}
                  yAxis={
                    model.normalised
                      ? {
                          min: 0,
                          // Stacked areas and bars of every group reach 100%.
                          ...(model.chartType === 'area' || model.chartType === 'stacked-bar'
                            ? { max: 100 }
                            : {}),
                          axisLabel: { formatter: (value: number) => `${String(value)}%` },
                        }
                      : undefined
                  }
                  selection={{
                    selectedIndices: model.selection.selectedIndices,
                    onSelect: onPeriodClick,
                    hint: 'Click a period to select it, click it again to deselect it, and Shift-click another period to select every period in between.',
                  }}
                  ariaLabel="Trends chart"
                  fitBarsLabel="periods"
                  dataResetKey={`${dataResetKey}:${model.chartData
                    .map((row) =>
                      typeof row.__period_key__ === 'string' ? row.__period_key__ : '',
                    )
                    .join('|')}`}
                  toolbarStart={toolbarStart}
                />
              )}
            </ResultChartFit>
          )}
        </ResultFrame>
      )}
      {model.normalised && !allGroupsFiltered ? (
        <p className="mt-2 text-label-secondary text-description">
          Each period adds up to 100% across the groups listed below, hidden ones included, so
          hiding a group does not change the others. A period with no rows is left blank.
        </p>
      ) : null}
      <div className="mt-4">
        <FilterableSeriesControls
          items={model.groups.map((group) => ({
            key: group.id,
            color: group.color,
            text: group.legendText,
            label: group.label,
            hidden: group.hidden,
            marker:
              model.chartType === 'line' || model.chartType === 'area' ? model.chartType : 'bar',
          }))}
          ariaLabel="Trends groups"
          legendHelp={TRENDS_LEGEND_HELP}
          uncased={model.uncased}
          onUncasedChange={model.supportsUncased ? onUncasedChange : undefined}
          controlsAfterUncased={
            model.summary.groupBy.length > 0 ? (
              <label className="flex items-center gap-2 text-label-secondary text-foreground">
                <span className="shrink-0">Minimum group count</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={minimumGroupCount}
                  aria-label="Minimum group count"
                  className="w-20"
                  onChange={(event) => {
                    onMinimumGroupCountChange(event.currentTarget.valueAsNumber);
                  }}
                />
              </label>
            ) : null
          }
          onClearSelection={onClearSelection}
          clearSelectionDisabled={!hasSelection}
          onToggle={(key) => {
            const group = model.groups.find((candidate) => candidate.id === key);
            if (group) onToggleGroupIndices(group.memberGroupIndices);
          }}
        />
      </div>
    </div>
  );
}
