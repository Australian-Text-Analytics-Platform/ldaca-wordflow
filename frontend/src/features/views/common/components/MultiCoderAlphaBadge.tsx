import { useState } from 'react';
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
import {
  AgreementMatrixDownloadButton,
  AgreementMatrixDownloadDialog,
} from './AgreementMatrixDownload';

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
  /** The Data Block's name, for the downloaded matrix's subtitle and file name. */
  nodeName?: string;
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
  nodeName,
}: MultiCoderAlphaBadgeProps) {
  const [downloadOpen, setDownloadOpen] = useState(false);
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
  const method = `${name} across ${coders}: ${columns.join(', ')}. ${
    scale ? 'A near miss counts as partial agreement.' : 'Only exact matches agree.'
  } A text counts when at least two of them coded it${counted ? ` (${counted})` : ''}.`;
  const caption =
    'Coincidence matrix: each cell counts the pairs of codes two coders gave the same text.';
  const agreementKey = 'Green: two coders gave the same code.';
  const showMatrix =
    !isLoading && !isError && agreement !== null && agreement.coincidences.length > 0;
  const downloadLabel = 'Download coincidence matrix';
  return (
    <>
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
            <div className="mb-2 flex items-start gap-3">
              <p className="max-w-sm whitespace-normal" data-testid="multi-coder-method">
                {method}
              </p>
              {showMatrix ? (
                <AgreementMatrixDownloadButton
                  label={downloadLabel}
                  onClick={() => {
                    setDownloadOpen(true);
                  }}
                />
              ) : null}
            </div>
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
                  {caption}
                </p>
                <AgreementMatrix
                  rows={agreement.coincidences}
                  scale={scale}
                  rowAxis="code"
                  columnAxis="code"
                  tableLabel={`coincidence matrix of ${coders}`}
                  agreementKey={agreementKey}
                />
              </>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AgreementMatrixDownloadDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        title={downloadLabel}
        image={() => ({
          title: `${name} across ${coders}: ${score}${pageOnly ? ' (Preview)' : ''}`,
          ...(nodeName ? { subtitle: `Data Block: ${nodeName}` } : {}),
          paragraphs: [method, ...fitNotes.map((note) => note.text)],
          caption,
          rows: agreement?.coincidences ?? [],
          scale,
          rowAxis: 'code',
          columnAxis: 'code',
          agreementKey,
        })}
        fileStem={nodeName ?? columns[0] ?? 'annotation'}
        fileSuffix={pageOnly ? 'coincidence_matrix_preview' : 'coincidence_matrix'}
      />
    </>
  );
}
