import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AnnotationRowFilterValue } from '@/features/views/annotation/annotationRowFilter';
import {
  type ConfusionCount,
  INTERCODER_RELIABILITY_METRICS,
  type IntercoderReliabilityMetric,
  calculateIntercoderReliability,
  formatIntercoderReliability,
  intercoderReliabilityLabel,
  intercoderReliabilitySymbol,
  isIntercoderReliabilityMetric,
  type OrderedScale,
} from '@/features/views/common/columnComparisonModel';
import { AgreementMatrix } from './AgreementMatrix';
import { AnnotationColumnFilterMenu } from './AnnotationColumnFilterMenu';
import { COLUMN_MENU_CLASS, COLUMN_MENU_ITEM_CLASS } from './columnMenuStyles';

export type { ConfusionCount } from '@/features/views/common/columnComparisonModel';

/** The method behind the score, in words, so a scale and categories can't be mistaken. */
const reliabilityMethod = (metric: IntercoderReliabilityMetric, ordered: boolean): string => {
  if (metric === 'percent_agreement') {
    return ordered
      ? 'Percent Agreement on an ordered scale: only exact matches agree.'
      : 'Percent Agreement on categories: only exact matches agree.';
  }
  if (!ordered) {
    return `${intercoderReliabilityLabel(metric)} on categories: only exact matches agree.`;
  }
  return metric === 'cohens_kappa'
    ? 'Weighted Cohen’s Kappa on an ordered scale: a near miss counts as partial agreement (quadratic weights).'
    : 'Ordinal Krippendorff’s Alpha on an ordered scale: a near miss counts as partial agreement.';
};

interface ColumnComparisonHeaderProps {
  label?: string;
  metric: IntercoderReliabilityMetric;
  referenceColumn: string;
  comparisonColumn: string;
  rows: ConfusionCount[] | undefined;
  isLoading: boolean;
  isError: boolean;
  revealed: boolean;
  onRevealedChange: (revealed: boolean) => void;
  /** Row filter carried by this column; omitted by tables without server-side filtering. */
  filter?: AnnotationRowFilterValue;
  onFilterChange?: (filter: AnnotationRowFilterValue) => void;
  /**
   * An ordered-scale codebook: Kappa is then weighted, Alpha ordinal, and
   * the matrix lists the levels in order, then the codes outside the scale.
   */
  scale?: OrderedScale | null;
}

/**
 * Presents one comparison column without exposing its coding until the user reveals it.
 * Rendered by: Annotation Manual, Preview, and Review headers. Flow: stack the aggregate
 * reliability score (with its matrix tooltip) above the column name, the disclosure control, and
 * (when the table supports it) the row-filter menu, so the header stays narrow. Only per-row values and difference tint wait for reveal, so a
 * coder can track agreement and filter rows without seeing how any individual row was coded.
 */
export function ColumnComparisonHeader({
  label,
  metric,
  referenceColumn,
  comparisonColumn,
  rows,
  isLoading,
  isError,
  revealed,
  onRevealedChange,
  filter,
  onFilterChange,
  scale = null,
}: ColumnComparisonHeaderProps) {
  const ordered = scale !== null;
  const metricDefinition = {
    label: intercoderReliabilityLabel(metric, ordered),
    symbol: intercoderReliabilitySymbol(metric, ordered),
  };
  const reliability = rows ? calculateIntercoderReliability(rows, metric, scale) : null;
  const accessibleScore =
    reliability == null
      ? null
      : metric === 'percent_agreement'
        ? `${(reliability * 100).toFixed(1)}%`
        : reliability.toFixed(3);
  const score = isLoading
    ? `${metricDefinition.symbol} …`
    : reliability == null
      ? `${metricDefinition.symbol} —`
      : formatIntercoderReliability(reliability, metric, ordered);
  const scoreDescription = isLoading
    ? `${metricDefinition.label} loading for ${referenceColumn} versus ${comparisonColumn}`
    : isError || !rows || reliability == null
      ? `${metricDefinition.label} unavailable for ${referenceColumn} versus ${comparisonColumn}`
      : `${metricDefinition.label} ${accessibleScore ?? ''} for ${referenceColumn} versus ${comparisonColumn}`;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <TooltipProvider delayDuration={120} skipDelayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              asChild
              variant="outline"
              className="h-7 px-2.5 text-body font-medium tabular-nums"
            >
              <button type="button" aria-label={scoreDescription}>
                {score}
              </button>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-none p-3">
            {/* Says which method the score uses, since the scale setting is a
                hidden codebook row (Chao, 16 Nov 2026). */}
            <p className="mb-2 max-w-sm whitespace-normal" data-testid="reliability-method">
              {reliabilityMethod(metric, ordered)}
            </p>
            {isLoading ? (
              <p>Loading comparison…</p>
            ) : isError || !rows ? (
              <p>Couldn't load comparison.</p>
            ) : rows.length === 0 ? (
              <p>No rows contain values in both columns.</p>
            ) : (
              <AgreementMatrix
                rows={rows}
                scale={scale}
                rowAxis={referenceColumn}
                columnAxis={comparisonColumn}
                tableLabel={`${referenceColumn} versus ${comparisonColumn} confusion matrix`}
                agreementKey="Green: both columns agree."
              />
            )}
          </TooltipContent>
        </Tooltip>
        <span className="inline-flex items-center gap-1.5">
          <span>{label ?? comparisonColumn}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="size-7 p-0"
                aria-label={`${revealed ? 'Hide' : 'Show'} comparison values for ${comparisonColumn}`}
                aria-pressed={revealed}
                onClick={() => {
                  onRevealedChange(!revealed);
                }}
              >
                {revealed ? (
                  <EyeOff aria-hidden="true" className="size-3.5" />
                ) : (
                  <Eye aria-hidden="true" className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{revealed ? 'Hide comparison' : 'Show comparison'}</TooltipContent>
          </Tooltip>
          {filter && onFilterChange ? (
            <AnnotationColumnFilterMenu
              column={comparisonColumn}
              value={filter}
              onChange={onFilterChange}
              differsLabel={`Differs from ${referenceColumn}`}
            />
          ) : null}
        </span>
      </TooltipProvider>
    </span>
  );
}

interface ColumnComparisonSelectorProps {
  availableColumns: string[];
  selectedColumns: string[];
  onSelectedColumnsChange: (columns: string[]) => void;
  metric: IntercoderReliabilityMetric;
  onMetricChange: (metric: IntercoderReliabilityMetric) => void;
  disabledColumns?: string[];
  disabled?: boolean;
  /** An ordered-scale codebook: the menu names weighted Kappa and ordinal Alpha. */
  ordered?: boolean;
}

/**
 * Shared immediate multi-column checklist for Annotation comparison surfaces.
 * Used by: Manual, Preview, and Review toolbars. Columns owned by Show metadata remain visible but
 * disabled, and Select all operates only on columns that have no opposing role.
 */
export function ColumnComparisonSelector({
  availableColumns,
  selectedColumns,
  onSelectedColumnsChange,
  metric,
  onMetricChange,
  disabledColumns = [],
  disabled = false,
  ordered = false,
}: ColumnComparisonSelectorProps) {
  const normalizedAvailableColumns = Array.from(new Set(availableColumns));
  const normalizedSelectedColumns = selectedColumns.filter((column) =>
    normalizedAvailableColumns.includes(column),
  );
  const disabledColumnSet = new Set(disabledColumns);
  const selectableColumns = normalizedAvailableColumns.filter(
    (column) => !disabledColumnSet.has(column),
  );
  const allSelected =
    selectableColumns.length > 0 &&
    selectableColumns.every((column) => normalizedSelectedColumns.includes(column));

  const toggleColumn = (column: string, checked: boolean) => {
    onSelectedColumnsChange(
      checked
        ? Array.from(new Set([...normalizedSelectedColumns, column]))
        : normalizedSelectedColumns.filter((selectedColumn) => selectedColumn !== column),
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || normalizedAvailableColumns.length === 0}
          aria-label="Compare to"
        >
          Compare to ({normalizedSelectedColumns.length})
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={COLUMN_MENU_CLASS}>
        <DropdownMenuLabel>Intercoder reliability</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={metric}
          onValueChange={(value) => {
            if (isIntercoderReliabilityMetric(value)) onMetricChange(value);
          }}
        >
          {INTERCODER_RELIABILITY_METRICS.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              onSelect={(event) => {
                event.preventDefault();
              }}
            >
              {intercoderReliabilityLabel(option.value, ordered)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          className={COLUMN_MENU_ITEM_CLASS}
          checked={allSelected}
          disabled={selectableColumns.length === 0}
          onCheckedChange={(checked) => {
            onSelectedColumnsChange(checked ? selectableColumns : []);
          }}
          onSelect={(event) => {
            event.preventDefault();
          }}
        >
          Select all
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {normalizedAvailableColumns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column}
            className={COLUMN_MENU_ITEM_CLASS}
            checked={normalizedSelectedColumns.includes(column)}
            disabled={disabledColumnSet.has(column)}
            onCheckedChange={(checked) => {
              toggleColumn(column, checked);
            }}
            onSelect={(event) => {
              event.preventDefault();
            }}
          >
            {column}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
