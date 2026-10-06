/** SQL fragments used by frontend-owned Workspace queries. */

export const sqlIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;

export const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

/** Which values of a column count as empty besides missing: blank text, NaN, or none. */
export type SqlEmptyKind = 'text' | 'float' | 'missing';

/**
 * One ORDER BY term that puts empty values last in both directions (issue 317).
 * Used by: Data View sorting. Empty is Wordflow's usual meaning (missing, NaN, or blank text), so
 * NaN and blank text are turned into NULL before `NULLS LAST` applies. Polars SQL has no `isnan`,
 * but it treats NaN as equal to NaN.
 */
export const sqlOrder = (
  column: string,
  descending = false,
  empty: SqlEmptyKind = 'missing',
): string => {
  const identifier = sqlIdentifier(column);
  const isEmpty =
    empty === 'text'
      ? `TRIM(CAST(${identifier} AS VARCHAR)) = ''`
      : empty === 'float'
        ? `${identifier} = CAST('NaN' AS DOUBLE)`
        : null;
  const key = isEmpty ? `CASE WHEN ${isEmpty} THEN NULL ELSE ${identifier} END` : identifier;
  return `${key} ${descending ? 'DESC' : 'ASC'} NULLS LAST`;
};

export const sqlGlobPattern = (value: string): string => {
  const query = value.trim();
  let pattern = '';
  let escaped = false;
  let hasWildcard = false;
  for (const character of query) {
    if (escaped) {
      pattern += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '*') {
      pattern += '.*';
      hasWildcard = true;
    } else if (character === '?') {
      pattern += '.';
      hasWildcard = true;
    } else {
      pattern += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  if (escaped) pattern += '\\\\';
  return hasWildcard ? `^${pattern}$` : `.*${pattern}.*`;
};

export const sqlTable = (nodeId: string): string => sqlIdentifier(nodeId);
