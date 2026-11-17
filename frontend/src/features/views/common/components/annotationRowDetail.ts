import {
  isInvalidAnnotationLabel,
  NOT_A_CODE_EXPLANATION,
} from '@/features/views/annotation/annotationLabelModel';
import type { RowDetailPayload } from './RowDetailPanel';

/** Shown in place of a comparison value the reviewer has not revealed yet. */
export const HIDDEN_COMPARISON_TEXT = 'Hidden until revealed';

export interface AnnotationRowViewColumns {
  textColumn: string;
  annotationColumn: string;
  /** The value shown in the table, which may differ from the loaded row after an edit. */
  annotationValue: unknown;
  correctionColumn?: string | null;
  correctionValue?: unknown;
  /** Compare To columns, in table order. */
  comparisonColumns: readonly string[];
  revealedComparisonColumns: ReadonlySet<string>;
  metadataColumns: readonly string[];
  /** The codebook's codes: other values in coded columns are marked as not codes. */
  classOptions?: readonly string[];
}

/**
 * Every visible column of one annotator row, in table order, for the read-only
 * row viewer (issue 92). Comparison values stay masked until revealed.
 */
export function buildAnnotationRowDetailPayload(
  row: Record<string, unknown>,
  columns: AnnotationRowViewColumns,
): RowDetailPayload {
  const record: Record<string, unknown> = {
    [columns.textColumn]: row[columns.textColumn],
    [columns.annotationColumn]: columns.annotationValue,
  };
  if (columns.correctionColumn) {
    record[columns.correctionColumn] = columns.correctionValue;
  }
  for (const column of columns.comparisonColumns) {
    record[column] = columns.revealedComparisonColumns.has(column)
      ? row[column]
      : HIDDEN_COMPARISON_TEXT;
  }
  for (const column of columns.metadataColumns) {
    record[column] = row[column];
  }
  // Coded columns: the annotation, its correction, and revealed comparisons.
  const codedColumns = [
    columns.annotationColumn,
    ...(columns.correctionColumn ? [columns.correctionColumn] : []),
    ...columns.comparisonColumns.filter((column) => columns.revealedComparisonColumns.has(column)),
  ];
  const valueNotes = Object.fromEntries(
    codedColumns
      .filter((column) => isInvalidAnnotationLabel(record[column], columns.classOptions ?? []))
      .map((column) => [column, NOT_A_CODE_EXPLANATION]),
  );
  return {
    record,
    textColumn: columns.textColumn,
    ...(Object.keys(valueNotes).length > 0 ? { valueNotes } : {}),
  };
}
