import { sqlIdentifier } from '@/api';
import {
  annotationCellText,
  annotationLabelSql,
  annotationTextSql,
  classifyAnnotationLabel,
  normalizeAnnotationClassOptions,
} from './annotationLabelModel';

/**
 * How well one column's values match the selected codebook: how many cells
 * hold a value, how many of those are not codes (shown grey italic and left
 * out of every score), and up to three of the most frequent such values.
 */
export interface ColumnCodebookFit {
  filled: number;
  notCodes: number;
  examples: string[];
}

export type CodebookFitByColumn = ReadonlyMap<string, ColumnCodebookFit>;

const MAX_EXAMPLES = 3;
const MAX_LISTED_CODES = 5;
const COLUMN_ALIAS = '__fit_column';
const VALUE_ALIAS = '__fit_value';
const FILLED_ALIAS = '__fit_filled';
const NOT_CODES_ALIAS = '__fit_not_codes';

const count = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  return 0;
};

/**
 * One Polars SQL query for every column at once: per column, a totals row
 * (no value) with the filled and not-code counts, then up to three rows
 * naming the most frequent values that are not codes. Only for a codebook
 * with codes; without codes every value counts.
 */
export function codebookFitSql(
  sql: string,
  columns: readonly string[],
  classOptions: readonly string[],
): string {
  const classes = normalizeAnnotationClassOptions(classOptions);
  const column = sqlIdentifier(COLUMN_ALIAS);
  const value = sqlIdentifier(VALUE_ALIAS);
  const filled = sqlIdentifier(FILLED_ALIAS);
  const notCodes = sqlIdentifier(NOT_CODES_ALIAS);
  return columns
    .flatMap((name, index) => {
      const text = annotationTextSql(name);
      const notCode = `(${text} <> '' AND ${annotationLabelSql(name, classes)} IS NULL)`;
      const source = `(${sql}) AS ${sqlIdentifier(`__fit_source_${String(index)}`)}`;
      return [
        `SELECT CAST(${String(index)} AS BIGINT) AS ${column}, CAST(NULL AS STRING) AS ${value}, CAST(SUM(CASE WHEN ${text} <> '' THEN 1 ELSE 0 END) AS BIGINT) AS ${filled}, CAST(SUM(CASE WHEN ${notCode} THEN 1 ELSE 0 END) AS BIGINT) AS ${notCodes} FROM ${source}`,
        `SELECT * FROM (SELECT CAST(${String(index)} AS BIGINT) AS ${column}, ${value}, CAST(COUNT(*) AS BIGINT) AS ${filled}, CAST(0 AS BIGINT) AS ${notCodes} FROM (SELECT ${text} AS ${value}, (CASE WHEN ${notCode} THEN 1 ELSE 0 END) AS ${sqlIdentifier('__fit_flag')} FROM ${source}) AS ${sqlIdentifier(`__fit_values_${String(index)}`)} WHERE ${sqlIdentifier('__fit_flag')} = 1 GROUP BY ${value} ORDER BY ${filled} DESC, ${value} ASC LIMIT ${String(MAX_EXAMPLES)}) AS ${sqlIdentifier(`__fit_examples_${String(index)}`)}`,
      ];
    })
    .join(' UNION ALL ');
}

/** Reads the rows of codebookFitSql back into one entry per column. */
export function parseCodebookFitRows(
  rows: readonly Record<string, unknown>[],
  columns: readonly string[],
): Map<string, ColumnCodebookFit> {
  const fits = new Map<string, ColumnCodebookFit>(
    columns.map((name) => [name, { filled: 0, notCodes: 0, examples: [] }]),
  );
  for (const row of rows) {
    const name = columns[count(row[COLUMN_ALIAS])];
    const fit = name === undefined ? undefined : fits.get(name);
    if (!fit) continue;
    const exampleValue = row[VALUE_ALIAS];
    if (exampleValue == null) {
      fit.filled = count(row[FILLED_ALIAS]);
      fit.notCodes = count(row[NOT_CODES_ALIAS]);
    } else if (fit.examples.length < MAX_EXAMPLES) {
      fit.examples.push(annotationCellText(exampleValue));
    }
  }
  return fits;
}

/** The same counts from values already on screen, for Preview's page-local scores. */
export function codebookFitFromValues(
  values: readonly unknown[],
  classOptions: readonly string[],
): ColumnCodebookFit {
  let filled = 0;
  const notCodes = new Map<string, number>();
  for (const value of values) {
    const label = classifyAnnotationLabel(value, classOptions);
    if (label.raw.trim() === '') continue;
    filled += 1;
    if (label.invalid) {
      const text = label.raw.trim();
      notCodes.set(text, (notCodes.get(text) ?? 0) + 1);
    }
  }
  const examples = [...notCodes.entries()]
    .sort(([left, leftCount], [right, rightCount]) =>
      rightCount === leftCount ? left.localeCompare(right) : rightCount - leftCount,
    )
    .slice(0, MAX_EXAMPLES)
    .map(([text]) => text);
  return {
    filled,
    notCodes: [...notCodes.values()].reduce((total, next) => total + next, 0),
    examples,
  };
}

const quoted = (values: readonly string[]) => values.map((value) => `“${value}”`).join(', ');

/** True when a column holds values and none of them is a code. */
export const hasNoCodes = (fit: ColumnCodebookFit | undefined): boolean =>
  fit !== undefined && fit.filled > 0 && fit.notCodes === fit.filled;

export interface CodebookFitNote {
  column: string;
  text: string;
  /** None of the column's values are codes, so the score leaves the column out. */
  leftOut: boolean;
}

/**
 * What a score's tooltip says about the columns it compares: for each column
 * whose values are not all codes, either that it is left out entirely or how
 * many of its values were left out. The annotation column (`everyScore`) is
 * compared by every score, so its note says so.
 */
export function codebookFitNotes(
  columns: readonly {
    column: string;
    fit: ColumnCodebookFit | undefined;
    everyScore?: boolean;
  }[],
  options: { pageOnly?: boolean } = {},
): CodebookFitNote[] {
  const where = options.pageOnly ? ' on this page' : '';
  return columns.flatMap<CodebookFitNote>(({ column, fit, everyScore = false }) => {
    if (!fit || fit.notCodes === 0) return [];
    if (hasNoCodes(fit)) {
      const examples = fit.examples.length > 0 ? ` (for example ${quoted(fit.examples)})` : '';
      const scope = everyScore ? 'every score, since all of them compare against it' : 'this score';
      return [
        {
          column,
          leftOut: true,
          text: `None of the values in ${column}${where} are codes in the selected codebook${examples}, so ${column} is left out of ${scope}. Check the codebook.`,
        },
      ];
    }
    const text =
      fit.notCodes === 1
        ? `1 value in ${column}${where} is not a code in the selected codebook and was left out.`
        : `${String(fit.notCodes)} values in ${column}${where} are not codes in the selected codebook and were left out.`;
    return [{ column, leftOut: false, text }];
  });
}

/**
 * The line above a table when most or all values in its annotation column
 * are not codes, which usually means the wrong codebook is selected.
 */
export function annotationColumnCodebookHint(
  column: string,
  fit: ColumnCodebookFit | undefined,
  classOptions: readonly string[],
): string | null {
  const codes = normalizeAnnotationClassOptions(classOptions);
  if (!fit || codes.length === 0 || fit.filled === 0 || fit.notCodes * 2 <= fit.filled) {
    return null;
  }
  const listed =
    codes.length > MAX_LISTED_CODES
      ? `${codes.slice(0, MAX_LISTED_CODES).join(', ')}, …`
      : codes.join(', ');
  const amount = fit.notCodes === fit.filled ? 'None of the values' : 'Most values';
  const verb = fit.notCodes === fit.filled ? 'are codes' : 'are not codes';
  return `${amount} in ${column} ${verb} in the selected codebook (${listed}), so the scores leave them out. Is the right codebook selected?`;
}

/** Visible words at a Compare to header whose column holds no codes at all. */
export const NO_CODES_HEADER_HINT = 'No codes from this codebook';
