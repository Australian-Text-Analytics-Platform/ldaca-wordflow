import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type CodeCombination,
  multiCoderAgreement,
  type OrderedScale,
} from '@/features/views/common/columnComparisonModel';
import {
  type CodebookFitByColumn,
  codebookFitNotes,
} from '@/features/views/annotation/codebookFit';
import { AgreementMatrix } from './AgreementMatrix';

interface MultiCoderAlphaBadgeProps {
  /** Every coder's column: the annotation column, then the comparisons. */
  columns: readonly string[];
  combinations: readonly CodeCombination[] | undefined;
  scale: OrderedScale | null;
  isLoading: boolean;
  isError: boolean;
  /** Preview counts the page on screen only. */
  pageOnly?: boolean;
  /** Per column, how many values are not codes, so the tooltip can name the columns left out. */
  codebookFit?: CodebookFitByColumn;
}

/**
 * Krippendorff's Alpha across all coders (Chao, 16 Nov 2026), above the
 * annotation column when Alpha is chosen and two or more columns are
 * compared. Each comparison header keeps its own pairwise score. The tooltip
 * names the method and the coders, and shows the coincidence matrix: code
 * against code, counting the pairs of codes two coders gave the same text.
 */
export function MultiCoderAlphaBadge({
  columns,
  combinations,
  scale,
  isLoading,
  isError,
  pageOnly = false,
  codebookFit,
}: MultiCoderAlphaBadgeProps) {
  const fitNotes = codebookFitNotes(
    columns.map((column) => ({ column, fit: codebookFit?.get(column) })),
    { pageOnly },
  );
  const agreement = combinations ? multiCoderAgreement(combinations, scale) : null;
  const symbol = scale ? 'αo' : 'α';
  const name = scale ? 'Ordinal Krippendorff’s Alpha' : 'Krippendorff’s Alpha';
  const coders = `${String(columns.length)} coders`;
  const value = agreement?.alpha;
  const score = isLoading
    ? `${symbol} …`
    : value == null
      ? `${symbol} —`
      : `${symbol} ${value.toFixed(3)}`;
  const accessibleName = isLoading
    ? `${name} across ${coders} loading`
    : value == null
      ? `${name} across ${coders} unavailable`
      : `${name} across ${coders} ${value.toFixed(3)}`;
  const counted = agreement
    ? `${String(agreement.pairableTexts)} ${agreement.pairableTexts === 1 ? 'text' : 'texts'}${pageOnly ? ' on this page' : ''}`
    : '';
  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            asChild
            variant="outline"
            className="h-7 gap-1.5 px-2.5 text-body font-medium tabular-nums"
          >
            <button type="button" aria-label={accessibleName} data-testid="multi-coder-alpha">
              {score}
              <span className="font-normal text-description">· {coders}</span>
            </button>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-none p-3">
          <p className="mb-2 max-w-sm whitespace-normal" data-testid="multi-coder-method">
            {name} across {coders}: {columns.join(', ')}.{' '}
            {scale ? 'A near miss counts as partial agreement. ' : 'Only exact matches agree. '}A
            text counts when at least two of them coded it
            {counted ? ` (${counted})` : ''}.
          </p>
          {fitNotes.map((note) => (
            <p
              key={note.column}
              className="mb-2 max-w-sm whitespace-normal"
              data-testid="codebook-fit-note"
            >
              {note.text}
            </p>
          ))}
          {isLoading ? (
            <p>Loading agreement…</p>
          ) : isError || !agreement ? (
            <p>Couldn't load the agreement.</p>
          ) : agreement.coincidences.length === 0 ? (
            // A column left out already explains the missing score.
            fitNotes.some((note) => note.leftOut) ? null : (
              <p>No text has codes from two coders yet.</p>
            )
          ) : (
            <>
              <p className="mb-1 max-w-sm whitespace-normal text-label-secondary text-widget-foreground/80">
                Coincidence matrix: each cell counts the pairs of codes two coders gave the same
                text.
              </p>
              <AgreementMatrix
                rows={agreement.coincidences}
                scale={scale}
                rowAxis="code"
                columnAxis="code"
                tableLabel={`coincidence matrix of ${coders}`}
                agreementKey="Green: two coders gave the same code."
              />
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
