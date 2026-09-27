import type { ColumnMapping } from '../projectPreprocessing';
import type { JoinType } from '../types';

/** Map the native join output, including USING's merged key and DuckDB's renamed columns. */
export function joinColumnMappings(
  left: ColumnMapping[],
  right: ColumnMapping[],
  kind: JoinType,
  leftKey: string | undefined,
  rightKey: string | undefined,
  outputColumns: string[],
): ColumnMapping[] {
  if (kind === 'semi' || kind === 'anti')
    return left.map((column, index) => ({
      ...column,
      output: outputColumns[index] ?? column.output,
    }));

  const merged = kind !== 'cross' && leftKey === rightKey;
  const mappings = [
    ...left,
    ...right.filter((column) => !merged || column.column !== rightKey),
  ].map((column, index) => ({ ...column, output: outputColumns[index] ?? column.output }));
  if (merged && (kind === 'right' || kind === 'full')) {
    const index = left.findIndex((column) => column.column === leftKey);
    const rightColumn = right.find((column) => column.column === rightKey);
    if (index >= 0 && rightColumn) {
      const key = { ...rightColumn, output: outputColumns[index] ?? rightColumn.output };
      if (kind === 'right') mappings[index] = key;
      // A coalesced key inherits settings only when both contributors agree.
      else mappings.push(key);
    }
  }
  return mappings;
}
