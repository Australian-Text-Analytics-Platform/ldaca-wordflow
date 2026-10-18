import type { AnnotationClassDescriptionRow } from '@/api';

/**
 * The codebook's optional Task context (issue 408): what the texts are and
 * what the codes are for. It is kept in the codebook Data Block as one row
 * with this reserved code and the text in the description column, written
 * only when the Task context is filled in. It is never a code.
 */
export const TASK_CONTEXT_CODE = '__task_context__';
/** The codebook's description limit. */
export const TASK_CONTEXT_MAX_CHARS = 2000;

export const isTaskContextCode = (code: string): boolean =>
  code.trim().toLowerCase() === TASK_CONTEXT_CODE;

/** The codes without the Task context row, and the Task context ('' when none). */
export function splitTaskContext(rows: AnnotationClassDescriptionRow[]): {
  codes: AnnotationClassDescriptionRow[];
  taskContext: string;
} {
  const contextRow = rows.find((row) => isTaskContextCode(row.class));
  return {
    codes: rows.filter((row) => !isTaskContextCode(row.class)),
    taskContext: contextRow?.description ?? '',
  };
}

/** The rows to save: the codes, then the Task context row when there is text. */
export function withTaskContext(
  codes: AnnotationClassDescriptionRow[],
  taskContext: string,
): AnnotationClassDescriptionRow[] {
  const text = taskContext.trim();
  return text ? [...codes, { class: TASK_CONTEXT_CODE, description: text }] : codes;
}
