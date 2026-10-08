interface GroupedResultsPageSizeSummaryProps<
  Row extends Record<string, unknown> = Record<string, unknown>,
> {
  groups: Row[][];
  totalProcessed?: number;
  /** All documents in the Data Block, so a Preview says how few it checked (issue 347). */
  totalDocuments?: number;
}

/** Called by: GroupedResultsPageSizeSummary when backend totals are unavailable. */
const countGroupedResultMatches = (groups: Record<string, unknown>[][]): number => {
  return groups.reduce((total, group) => total + group.length, 0);
};

/** Called by: GroupedResultsPageSizeSummary for grouped source-document counts. */
const countGroupedResultDocuments = (groups: Record<string, unknown>[][]): number => {
  return groups.length;
};

/**
 * Supplies the shared page-size summary copy for grouped analysis result tables,
 * using the current page's grouped instance and document counts.
 * Used by: concordance and quotation paginated grouped result tables.
 */
export function GroupedResultsPageSizeSummary<Row extends Record<string, unknown>>({
  groups,
  totalProcessed,
  totalDocuments,
}: GroupedResultsPageSizeSummaryProps<Row>) {
  const matchCount = countGroupedResultMatches(groups);
  const documentCount = countGroupedResultDocuments(groups);
  const plural = (count: number) => (count === 1 ? '' : 's');
  // A Preview checks only one page of documents; say how few, so 0 matches
  // is not read as "none in the Data Block".
  const partial =
    totalProcessed != null && totalDocuments != null && totalDocuments > totalProcessed;
  const checked =
    totalProcessed == null
      ? ''
      : partial
        ? ` after checking ${totalProcessed.toLocaleString()} of ${totalDocuments.toLocaleString()} documents`
        : ` after checking ${totalProcessed.toLocaleString()} document${plural(totalProcessed)}`;

  return (
    <>
      (Found {matchCount} match{matchCount === 1 ? '' : 'es'} in {documentCount} document
      {plural(documentCount)}
      {checked}).{partial ? ' Run searches them all.' : ''}
    </>
  );
}
