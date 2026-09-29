import { CONCORDANCE_COLUMN_KEYS, CONCORDANCE_FREQ_COLUMNS } from '../common/generatedColumns';

export type ConcordanceHeaderMode = 'plain' | 'preview-review-hint' | 'sortable';

const REVIEW_SORTABLE_ANALYSIS_COLUMNS: ReadonlySet<string> = new Set([
  CONCORDANCE_COLUMN_KEYS.leftContext,
  CONCORDANCE_COLUMN_KEYS.rightContext,
  CONCORDANCE_COLUMN_KEYS.matchedText,
  CONCORDANCE_COLUMN_KEYS.startIdx,
  CONCORDANCE_COLUMN_KEYS.endIdx,
  CONCORDANCE_COLUMN_KEYS.leftToken,
  CONCORDANCE_COLUMN_KEYS.rightToken,
  ...CONCORDANCE_FREQ_COLUMNS,
]);

interface ConcordanceHeaderPolicyInput {
  columnKey: string;
  documentColumn: string;
  metadataColumns: readonly string[];
  isCombined: boolean;
  isReview: boolean;
}

/**
 * Selects the table-header affordance for one visible Concordance column.
 * Used by: ConcordanceTableNodeBlock for both rendering and click dispatch so
 * Preview, Review, separated, and combined tables cannot drift apart.
 *
 * Flow: combined tables and the document column stay plain; selected source
 * metadata remains sortable; materialized scalar analysis fields, including the
 * left and right contexts (issue 241), sort in separated Review and advertise
 * Run All while still in separated Preview.
 */
export function concordanceHeaderMode({
  columnKey,
  documentColumn,
  metadataColumns,
  isCombined,
  isReview,
}: ConcordanceHeaderPolicyInput): ConcordanceHeaderMode {
  if (isCombined || columnKey === documentColumn) {
    return 'plain';
  }
  if (metadataColumns.includes(columnKey)) return 'sortable';
  if (!REVIEW_SORTABLE_ANALYSIS_COLUMNS.has(columnKey)) return 'plain';
  return isReview ? 'sortable' : 'preview-review-hint';
}

/**
 * The column a header click sorts by (issue 241).
 * Used by: ConcordanceTableNodeBlock. With Highlight L1/R1 for sorting on, the
 * left context sorts by L1 and the right context by R1, as corpus linguists
 * read a concordance; off, each context sorts by its own text.
 */
export function concordanceSortColumn(columnKey: string, highlightL1R1: boolean): string {
  if (!highlightL1R1) return columnKey;
  if (columnKey === CONCORDANCE_COLUMN_KEYS.leftContext) return CONCORDANCE_COLUMN_KEYS.leftToken;
  if (columnKey === CONCORDANCE_COLUMN_KEYS.rightContext) return CONCORDANCE_COLUMN_KEYS.rightToken;
  return columnKey;
}

/**
 * Says what a context header sorts by when that is not its own text.
 * Used by: ConcordanceTableNodeBlock for the sortable header's tooltip.
 */
export function concordanceSortHint(columnKey: string, highlightL1R1: boolean): string | undefined {
  if (concordanceSortColumn(columnKey, highlightL1R1) === columnKey) return undefined;
  return columnKey === CONCORDANCE_COLUMN_KEYS.leftContext
    ? 'Sorts by L1, the word before the match. Turn off Highlight L1/R1 for sorting to sort by the text.'
    : 'Sorts by R1, the word after the match. Turn off Highlight L1/R1 for sorting to sort by the text.';
}
