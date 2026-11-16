import type { AnnotationClassDescriptionRow } from '@/api';

/**
 * The codebook's reserved rows. They live in the codebook Data Block itself,
 * so they travel with the codes through edits, export and import, and are
 * never codes.
 *
 * - Task context (issue 408): what the texts are and what the codes are for.
 *   One row with this code and the text in the description column, written
 *   only when the Task context is filled in.
 * - Scale (Chao, 16 Nov 2026): the codes are levels of an ordered scale, from
 *   the lowest (first row) to the highest (last row). The row's presence is
 *   the setting; its description only explains it to people reading the
 *   Data Block.
 */
const TASK_CONTEXT_CODE = '__task_context__';
/** The codebook's description limit. */
export const TASK_CONTEXT_MAX_CHARS = 2000;
const SCALE_CODE = '__scale__';
const SCALE_ROW_DESCRIPTION =
  'Ordered scale: the codes are levels, from the lowest (first row) to the highest (last row). Delete this row to make them categories again.';

const normalized = (code: string): string => code.trim().toLowerCase();

const isTaskContextCode = (code: string): boolean => normalized(code) === TASK_CONTEXT_CODE;
const isScaleCode = (code: string): boolean => normalized(code) === SCALE_CODE;
export const isReservedCodebookCode = (code: string): boolean =>
  isTaskContextCode(code) || isScaleCode(code);

/** The codes without the reserved rows, the Task context ('' when none), and whether it is a scale. */
export function splitCodebookRows(rows: AnnotationClassDescriptionRow[]): {
  codes: AnnotationClassDescriptionRow[];
  taskContext: string;
  scale: boolean;
} {
  const contextRow = rows.find((row) => isTaskContextCode(row.class));
  return {
    codes: rows.filter((row) => !isReservedCodebookCode(row.class)),
    taskContext: contextRow?.description ?? '',
    scale: rows.some((row) => isScaleCode(row.class)),
  };
}

/** The rows to save: the codes, then the scale row when on, then the Task context row when there is text. */
export function withCodebookRows(
  codes: AnnotationClassDescriptionRow[],
  { taskContext, scale }: { taskContext: string; scale: boolean },
): AnnotationClassDescriptionRow[] {
  const text = taskContext.trim();
  return [
    ...codes,
    ...(scale ? [{ class: SCALE_CODE, description: SCALE_ROW_DESCRIPTION }] : []),
    ...(text ? [{ class: TASK_CONTEXT_CODE, description: text }] : []),
  ];
}
