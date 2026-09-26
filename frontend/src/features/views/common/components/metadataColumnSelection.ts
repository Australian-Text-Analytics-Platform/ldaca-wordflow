/**
 * De-duplicate metadata column names. Used by: MetadataColumnSelector.
 * to keep its `availableColumns` / `selectedColumns` lists canonical. Names
 * are kept exactly: " text" and "text" are different columns (issue 108).
 */
export const normalizeMetadataColumns = (columns: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  columns.forEach((column) => {
    if (!column || seen.has(column)) return;
    seen.add(column);
    normalized.push(column);
  });

  return normalized;
};
