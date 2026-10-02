import { useId, type ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import HelpIcon from '@/components/help/HelpIcon';
import type { DocumentKey } from '@/tutorials/documentationRegistry';
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
  /** What each legend entry shows: a tooltip on a help icon that opens `targetKey`. */
  legendHelp?: { tooltip: string; targetKey: DocumentKey<'tutorial'> };
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
            <HelpIcon
              targetKey={legendHelp.targetKey}
              label="About the legend"
              tooltip={legendHelp.tooltip}
              className="size-5 shrink-0 text-description"
            />
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
                Clear selection
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
