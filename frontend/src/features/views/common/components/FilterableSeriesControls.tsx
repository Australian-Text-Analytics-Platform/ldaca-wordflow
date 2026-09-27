import { useId, type ReactNode } from 'react';
import { Info } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FilterableSeriesLegend, type FilterableSeriesLegendItem } from './FilterableSeriesLegend';

interface Props {
  items: readonly FilterableSeriesLegendItem[];
  ariaLabel: string;
  onToggle?: (key: string) => void;
  pressedWhenHidden?: boolean;
  uncased?: boolean;
  onUncasedChange?: (value: boolean) => void;
  controlsAfterUncased?: ReactNode;
  onClearSelection?: () => void;
  clearSelectionDisabled?: boolean;
  /** Plain explanation of what each legend entry shows, behind an info icon. */
  legendHelp?: string;
}

/** Result-level series visibility and optional case-folding controls. */
export function FilterableSeriesControls({
  items,
  ariaLabel,
  onToggle,
  pressedWhenHidden = false,
  uncased = false,
  onUncasedChange,
  controlsAfterUncased,
  onClearSelection,
  clearSelectionDisabled = false,
  legendHelp,
}: Props) {
  const controlId = useId();

  return (
    <Card data-testid="filterable-series-controls">
      <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-body text-description">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {legendHelp ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="About the legend"
                    className="inline-flex shrink-0 items-center text-description/70 hover:text-description"
                  >
                    <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-80">{legendHelp}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <FilterableSeriesLegend
            items={items}
            ariaLabel={ariaLabel}
            pressedWhenHidden={pressedWhenHidden}
            className="flex flex-wrap items-center gap-3 text-label-secondary text-description"
            onToggle={onToggle}
          />
        </div>
        {onUncasedChange || controlsAfterUncased || onClearSelection ? (
          <div className="flex flex-wrap items-center gap-3">
            {onUncasedChange ? (
              <label
                htmlFor={`${controlId}-uncased`}
                className="flex items-center gap-2 text-label-secondary text-foreground"
              >
                <Checkbox
                  id={`${controlId}-uncased`}
                  checked={uncased}
                  onCheckedChange={(checked) => {
                    onUncasedChange(checked === true);
                  }}
                />
                <span>Ignore capitals</span>
              </label>
            ) : null}
            {controlsAfterUncased}
            {onClearSelection ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={clearSelectionDisabled}
                onClick={onClearSelection}
              >
                Clear Selection
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
