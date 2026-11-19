import type { AnnotationProcessingMode } from './annotationTabSettings';
import type { ColumnCodebookFit } from './codebookFit';

/**
 * What an AI Run would find in the annotation column it writes to (issue 499):
 * nothing, codes from the selected codebook, or values that are not codes,
 * which usually means the wrong column or codebook is selected.
 */
export type RunTargetCheck =
  | { kind: 'empty' }
  | { kind: 'codes'; column: string; filled: number; rows: number }
  | { kind: 'not_codes'; column: string; filled: number; notCodes: number; examples: string[] }
  | { kind: 'unknown'; column: string };

export function checkRunTarget(
  column: string,
  fit: ColumnCodebookFit | undefined,
  rows: number,
): RunTargetCheck {
  if (!fit) return { kind: 'unknown', column };
  if (fit.filled === 0) return { kind: 'empty' };
  if (fit.notCodes > 0) {
    return {
      kind: 'not_codes',
      column,
      filled: fit.filled,
      notCodes: fit.notCodes,
      examples: fit.examples,
    };
  }
  return { kind: 'codes', column, filled: fit.filled, rows: Math.max(rows, fit.filled) };
}

/**
 * Rows Run annotates: values that are not codes leave no choice but the whole
 * column, since filling only the blank rows would keep them.
 */
export const runProcessingMode = (
  check: RunTargetCheck,
  chosen: AnnotationProcessingMode,
): AnnotationProcessingMode => (check.kind === 'not_codes' ? 'reprocess_all' : chosen);

export interface RunTargetWording {
  /** Shown under the setup as soon as the column is chosen; null for an empty column. */
  line: string | null;
  /** The line asks the person to check the column and codebook. */
  warning: boolean;
  /** The confirmation before Run; null runs at once. */
  dialog: {
    title: string;
    body: string;
    /** null: Run would do nothing, so the dialog only informs. */
    confirm: string | null;
    destructive: boolean;
  } | null;
}

const number = (value: number) => value.toLocaleString('en-AU');
const rowsWord = (value: number) => (value === 1 ? 'row' : 'rows');
const quoted = (values: readonly string[]) => values.map((value) => `“${value}”`).join(', ');

export function runTargetWording(
  check: RunTargetCheck,
  mode: AnnotationProcessingMode,
  { advanced }: { advanced: boolean },
): RunTargetWording {
  const changeSetting = advanced
    ? 'change “Which rows to annotate” in Advanced settings'
    : 'turn on Advanced and change “Which rows to annotate”';
  if (check.kind === 'empty') return { line: null, warning: false, dialog: null };
  if (check.kind === 'unknown') {
    return {
      line: null,
      warning: false,
      dialog: {
        title: 'Run Annotation?',
        body: `Wordflow couldn't check whether ${check.column} already holds values. Run writes the AI's codes into ${check.column}.`,
        confirm: 'Run',
        destructive: false,
      },
    };
  }
  if (check.kind === 'not_codes') {
    const what =
      check.notCodes === check.filled
        ? `None of the ${number(check.filled)} values in ${check.column} are codes in the selected codebook`
        : `${number(check.notCodes)} of the ${number(check.filled)} values in ${check.column} are not codes in the selected codebook`;
    const examples = check.examples.length > 0 ? ` (for example ${quoted(check.examples)})` : '';
    return {
      line: `${what}${examples}. Check that the right column and codebook are selected: Run would overwrite the whole column.`,
      warning: true,
      dialog: {
        title: 'Overwrite the whole column?',
        body: `${what}${examples}. Run will annotate every row and overwrite all ${number(check.filled)} values in ${check.column}. Filling only the empty rows is not offered, because it would keep the values that are not codes.`,
        confirm: 'Overwrite the whole column',
        destructive: true,
      },
    };
  }
  const empty = check.rows - check.filled;
  const holds = `${check.column} already holds codes in ${number(check.filled)} of ${number(check.rows)} rows.`;
  if (mode === 'reprocess_all') {
    return {
      line: `${holds} Run will replace them all.`,
      warning: false,
      dialog: {
        title: 'Replace the existing codes?',
        body: `${holds} Run will annotate every row again and replace the ${number(check.filled)} existing codes. To keep them and annotate only the ${number(empty)} empty ${rowsWord(empty)}, ${changeSetting}.`,
        confirm: 'Replace the codes',
        destructive: true,
      },
    };
  }
  if (empty === 0) {
    const line = `Every row in ${check.column} already holds a code, so Run has nothing to fill. To annotate every row again, ${changeSetting}.`;
    return {
      line,
      warning: false,
      dialog: { title: 'Nothing to fill', body: line, confirm: null, destructive: false },
    };
  }
  return {
    line: `${holds} Run will fill only the ${number(empty)} empty ${rowsWord(empty)}.`,
    warning: false,
    dialog: {
      title: 'Fill the empty rows?',
      body: `${holds} Run will annotate only the ${number(empty)} empty ${rowsWord(empty)} and keep the existing codes. To replace them too, ${changeSetting}.`,
      confirm: 'Fill the empty rows',
      destructive: false,
    },
  };
}
