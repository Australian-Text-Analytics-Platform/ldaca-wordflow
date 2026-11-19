import type { AnnotationClassDescriptionRow } from '@/api';

/**
 * The codebook's reserved rows. They live in the codebook Data Block itself,
 * so they travel with the codes through edits, export and import, and are
 * never codes.
 *
 * - Task context (issue 408): what the texts are and what the codes are for.
 *   One row with this code and the text in the description column, written
 *   only when the Task context is filled in.
 * - Scale (Chao, 16 Nov 2026): the codes above this row are levels of an
 *   ordered scale, from the lowest (first row) to the highest; codes below it
 *   are outside the scale, such as Not applicable. The row's presence is the
 *   setting; its description only explains it to people reading the Data
 *   Block.
 */
const TASK_CONTEXT_CODE = '__task_context__';
/** The codebook's description limit. */
export const TASK_CONTEXT_MAX_CHARS = 2000;
const SCALE_CODE = '__scale__';
const SCALE_ROW_DESCRIPTION =
  'Ordered scale: the codes above this row are levels, from the lowest (first row) to the highest. Codes below it, such as Not applicable, are outside the scale. Delete this row to make them all categories again.';

/** A code in the Edit codebook window; on a scale, ``outsideScale`` marks a code that is not a level. */
export interface CodebookRow extends AnnotationClassDescriptionRow {
  outsideScale?: boolean;
  /**
   * The row's identity while it is edited, so a dragged row keeps its place
   * on screen as the order changes. Never saved.
   */
  id?: string;
}

let lastRowId = 0;
/** A fresh identity for a code added or drafted in the Edit codebook window. */
export const newCodebookRowId = (): string => {
  lastRowId += 1;
  return `new-${String(lastRowId)}`;
};

const normalized = (code: string): string => code.trim().toLowerCase();

const isTaskContextCode = (code: string): boolean => normalized(code) === TASK_CONTEXT_CODE;
const isScaleCode = (code: string): boolean => normalized(code) === SCALE_CODE;
export const isReservedCodebookCode = (code: string): boolean =>
  isTaskContextCode(code) || isScaleCode(code);

/**
 * The codes without the reserved rows, the Task context ('' when none),
 * whether it is a scale, and the codes outside the scale (below its row).
 */
export function splitCodebookRows(rows: AnnotationClassDescriptionRow[]): {
  codes: AnnotationClassDescriptionRow[];
  taskContext: string;
  scale: boolean;
  outsideScale: string[];
} {
  const contextRow = rows.find((row) => isTaskContextCode(row.class));
  const scaleIndex = rows.findIndex((row) => isScaleCode(row.class));
  return {
    codes: rows.filter((row) => !isReservedCodebookCode(row.class)),
    taskContext: contextRow?.description ?? '',
    scale: scaleIndex >= 0,
    outsideScale:
      scaleIndex < 0
        ? []
        : rows
            .slice(scaleIndex + 1)
            .filter((row) => !isReservedCodebookCode(row.class))
            .map((row) => row.class.trim()),
  };
}

/**
 * The rows to save. On a scale: the levels, the scale row, then the codes
 * outside the scale; otherwise the codes. Then the Task context row when
 * there is text.
 */
export function withCodebookRows(
  codes: CodebookRow[],
  { taskContext, scale }: { taskContext: string; scale: boolean },
): AnnotationClassDescriptionRow[] {
  const plain = (rows: CodebookRow[]) =>
    rows.map((row) => ({ class: row.class, description: row.description }));
  const text = taskContext.trim();
  return [
    ...(scale
      ? [
          ...plain(codes.filter((row) => !row.outsideScale)),
          { class: SCALE_CODE, description: SCALE_ROW_DESCRIPTION },
          ...plain(codes.filter((row) => row.outsideScale)),
        ]
      : plain(codes)),
    ...(text ? [{ class: TASK_CONTEXT_CODE, description: text }] : []),
  ];
}

/**
 * Moves one code from ``from`` to ``to`` (Chao, 16 Nov 2026: codes can be
 * dragged into order). On a scale the moved code joins the group it lands in:
 * dropped among the codes outside the scale it leaves the scale, and dropped
 * among the levels it becomes one, so the levels always come first.
 */
export function moveCodebookRow(
  rows: CodebookRow[],
  from: number,
  to: number,
  scale: boolean,
): CodebookRow[] {
  const target = rows[to];
  if (from === to || !rows[from] || !target) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  if (!moved) return rows;
  const { outsideScale: _outside, ...code } = moved;
  next.splice(to, 0, scale && target.outsideScale ? { ...code, outsideScale: true } : code);
  return next;
}
