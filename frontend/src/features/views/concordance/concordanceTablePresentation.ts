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

/**
 * Background band for a Run results row (issue 268): the backend flips
 * `__wordflow_document_band` whenever the source document changes, so
 * consecutive matches from one document share a shade. Preview rows have no
 * band and alternate by row as before.
 * Used by: ConcordanceTableNodeBlock.
 */
export function concordanceRowBand(row: Record<string, unknown>, index: number): 0 | 1 {
  const band = row.__wordflow_document_band;
  if (band === 0 || band === 1) return band;
  return index % 2 === 0 ? 0 : 1;
}

const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * Locates the L1 (last) or R1 (first) word inside its context cell for the
 * L1/R1 tint. An exact match wins; otherwise the match ignores case, because
 * Tokens mode takes L1/R1 from lowercased tokens while the contexts keep the
 * original text ("australian" must tint "Australian", issue 272). Returns the
 * matched span so the original casing is shown.
 * Used by: ConcordanceRowsTable.
 */
export function findContextAnchor(
  context: string,
  anchor: string,
  occurrence: 'first' | 'last',
): { index: number; length: number } | null {
  if (!anchor) return null;
  const escaped = anchor.replace(REGEX_SPECIAL_CHARS, '\\$&');
  const search = (pattern: RegExp) => {
    let found: RegExpExecArray | null = null;
    for (let match = pattern.exec(context); match; match = pattern.exec(context)) {
      found = match;
      if (occurrence === 'first') break;
    }
    return found ? { index: found.index, length: found[0].length } : null;
  };
  // A whole word first, ignoring case: L1 "a" in "I saw a cat. A " is the
  // final "A", not the "a" inside "cat" (issue 295). Text without spaces
  // (Japanese, Chinese) has no word edges, so it falls through.
  const wholeWord = search(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu'));
  if (wholeWord) return wholeWord;
  const exact = occurrence === 'last' ? context.lastIndexOf(anchor) : context.indexOf(anchor);
  if (exact >= 0) return { index: exact, length: anchor.length };
  return search(new RegExp(escaped, 'giu'));
}

/**
 * The sort a Data Block made from one source's table should keep (issue 275):
 * what you see is what you get. Mirrors the Review page query: Combined view
 * and an empty sort mean Data Block order.
 * Used by: ConcordanceFeature's Add Concordance Matches to Project.
 */
export function concordanceDetachSort(
  pagination: { sortBy?: string | null; descending?: boolean } | undefined,
  viewMode: 'separated' | 'combined',
): { sort_by: string | null; descending: boolean } {
  // An empty sortBy is Preview's spelling of unsorted.
  const raw = pagination?.sortBy;
  const sortBy = viewMode === 'combined' || !raw ? null : raw;
  return { sort_by: sortBy, descending: sortBy ? Boolean(pagination?.descending) : false };
}
