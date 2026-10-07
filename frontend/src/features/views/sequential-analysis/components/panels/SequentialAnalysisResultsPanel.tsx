import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import React from 'react';
import { Download } from 'lucide-react';

import HelpIcon from '@/components/help/HelpIcon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { SequentialChart } from '../SequentialChart';
import type {
  ChartTypeOption,
  SequentialChartModel,
  SequentialXAxisType,
} from '../../hooks/sequentialChartModel';

export interface SequentialAnalysisResultsPanelProps {
  resultsSummary: string;
  model: SequentialChartModel;
  minimumGroupCount: number;
  onMinimumGroupCountChange: (value: number) => void;
  onChartTypeChange: (value: ChartTypeOption) => void;
  onXAxisTypeChange: (value: SequentialXAxisType) => void;
  onNormaliseChange: (value: boolean) => void;
  onDownloadClick: () => void;
  onAddToWorkspace: () => void;
  addToWorkspaceDisabled: boolean;
  dataResetKey: string;

  onToggleGroupIndices: (groupIndices: readonly number[]) => void;
  onUncasedChange: (value: boolean) => void;
  onPeriodClick: (index: number, shiftHeld: boolean) => void;
  onClearSelection: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Rendered by: `SequentialAnalysisFeature` as the Trends result card. It reads
 * summary, counts, chart, legend, and selection metadata from one canonical
 * `SequentialChartModel`, while keeping chart-type/axis interactions outside
 * the pure model.
 */
export function SequentialAnalysisResultsPanel({
  resultsSummary,
  model,
  minimumGroupCount,
  onMinimumGroupCountChange,
  onChartTypeChange,
  onXAxisTypeChange,
  onNormaliseChange,
  onDownloadClick,
  onAddToWorkspace,
  addToWorkspaceDisabled,
  dataResetKey,
  onToggleGroupIndices,
  onUncasedChange,
  onPeriodClick,
  onClearSelection,
  containerRef,
}: SequentialAnalysisResultsPanelProps) {
  const isCategoryAxis = model.summary.columnType === 'category';

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle data-guidance="trends-results" className="flex items-center gap-2">
            Trends Results
            <HelpIcon
              targetKey="analysis.sequential-analysis.results"
              label="Trends results"
              tooltip={`${resultsSummary}. Review the chart, summaries, and adjust chart type.`}
            />
          </CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={addToWorkspaceDisabled} onClick={onAddToWorkspace}>
            Add to Project
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <SequentialChart
          model={model}
          minimumGroupCount={minimumGroupCount}
          onMinimumGroupCountChange={onMinimumGroupCountChange}
          onToggleGroupIndices={onToggleGroupIndices}
          onUncasedChange={onUncasedChange}
          onPeriodClick={onPeriodClick}
          onClearSelection={onClearSelection}
          dataResetKey={dataResetKey}
          containerRef={containerRef}
          toolbarStart={
            <>
              <span className="shrink-0 text-body text-description">Chart</span>
              <Select
                value={model.chartType}
                onValueChange={(value) => {
                  onChartTypeChange(value as ChartTypeOption);
                }}
              >
                <SelectTrigger className="w-36 shrink-0 text-body" aria-label="Chart">
                  <SelectValue placeholder="Select chart" />
                </SelectTrigger>
                <SelectContent>
                  {/* A category axis has no order in time, so only bars (issue 318). */}
                  {isCategoryAxis ? null : <SelectItem value="line">Line</SelectItem>}
                  <SelectItem value="bar">Bars</SelectItem>
                  <SelectItem value="stacked-bar">Stacked bars</SelectItem>
                  {isCategoryAxis ? null : <SelectItem value="area">Area</SelectItem>}
                </SelectContent>
              </Select>
              {isCategoryAxis ? null : (
                <>
                  <span className="flex shrink-0 items-center gap-1 text-body text-description">
                    Spacing
                    <HelpIcon
                      targetKey="analysis.sequential-analysis.spacing"
                      label="About Spacing"
                      tooltip="Even: same width per period, empty ones hidden. To scale: real time, with gaps."
                      className="size-5 shrink-0 text-description"
                    />
                  </span>
                  <Select
                    value={model.xAxisType}
                    onValueChange={(value) => {
                      onXAxisTypeChange(value as SequentialXAxisType);
                    }}
                  >
                    <SelectTrigger className="w-56 shrink-0 text-body" aria-label="Spacing">
                      <SelectValue placeholder="Spacing" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="category">Even (hide empty periods)</SelectItem>
                      <SelectItem value="number">To scale (show gaps)</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
              {/* Only when two or more groups meet the minimum group count (issue 219). */}
              {model.canNormalise ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label
                        htmlFor="trends-normalise"
                        className="flex shrink-0 items-center gap-2 text-body text-foreground"
                      >
                        <Checkbox
                          id="trends-normalise"
                          checked={model.normalised}
                          onCheckedChange={(checked) => {
                            onNormaliseChange(checked === true);
                          }}
                        />
                        Normalise to 100%
                      </label>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-80">
                      Show each group as a share of its period's rows, to compare busy and quiet
                      periods.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              <Button
                variant="outline"
                size="icon"
                className="size-control-sm shrink-0"
                aria-label="Download chart"
                onClick={onDownloadClick}
              >
                <Download className="h-4 w-4" />
              </Button>
            </>
          }
        />
      </CardContent>
    </Card>
  );
}
