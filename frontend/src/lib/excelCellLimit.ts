import { ApiError } from '@/lib/apiError';

/** The backend's code for text longer than an Excel cell holds (issue 397). */
const EXCEL_CELL_LIMIT_CODE = 'excel_cell_too_long';

/**
 * The columns an Excel download or export refused because their text is
 * longer than an Excel cell holds (issue 397), or null for any other error.
 */
export function excelCellLimitColumns(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.code !== EXCEL_CELL_LIMIT_CODE) return null;
  const detail = error.detail as { details?: { columns?: unknown } } | null | undefined;
  const columns = detail?.details?.columns;
  return Array.isArray(columns)
    ? columns.filter((column): column is string => typeof column === 'string')
    : [];
}

/** "'document'" or "'document' and 'notes'". */
export const quotedColumns = (columns: string[]): string => {
  const quoted = columns.map((column) => `'${column}'`);
  const last = quoted.pop();
  return quoted.length === 0 ? (last ?? 'A column') : `${quoted.join(', ')} and ${last ?? ''}`;
};
