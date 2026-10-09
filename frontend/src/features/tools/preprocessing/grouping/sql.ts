import { identifier } from '@/features/project/objects';
import { uniqueColumnName } from '@/features/project/data-editor/expressions';
import {
  isArrowFloatField,
  isArrowIntegerField,
  isArrowStringField,
  isArrowDictionaryField,
  isArrowTemporalField,
  type ArrowField,
} from '@/lib/arrow/decodeArrowTable';
import { emptyPredicate, literal, table } from '../sql';
import type { Transformation } from '../projectPreprocessing';

export type Grouping =
  | { kind: 'values' }
  | { kind: 'dates'; period: 'year' | 'month' | 'day' }
  | { kind: 'ranges'; start: string; width: string };
function numericSql(value: string): string {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))
    throw new Error('Enter a numeric value.');
  return value.trim();
}
export function groupExpression(column: string, grouping: Grouping, field: ArrowField): string {
  const source = identifier(column);
  let value = source;
  if (grouping.kind === 'dates') {
    if (!isArrowTemporalField(field)) throw new Error('Choose a date or datetime column.');
    value = `date_trunc(${literal(grouping.period)}, ${source})`;
  } else if (grouping.kind === 'ranges') {
    if (!isArrowIntegerField(field) && !isArrowFloatField(field))
      throw new Error('Choose a numeric column.');
    const width = numericSql(grouping.width);
    if (!(Number(width) > 0)) throw new Error('Range width must be positive.');
    value = `floor((${source} - ${numericSql(grouping.start)}) / ${width})`;
  }
  return `CASE WHEN ${emptyPredicate(column, field)} THEN NULL ELSE ${value} END`;
}
export function groupCountSql(source: string, expression: string, grouping?: Grouping): string {
  const label =
    grouping?.kind === 'ranges'
      ? `CAST(value * ${numericSql(grouping.width)} + ${numericSql(grouping.start)} AS VARCHAR) || ' ≤ value < ' || CAST((value + 1) * ${numericSql(grouping.width)} + ${numericSql(grouping.start)} AS VARCHAR)`
      : 'CAST(value AS VARCHAR)';
  return `SELECT CAST(value AS VARCHAR) AS value, ${label} AS label, CAST(count(*) AS VARCHAR) AS rows FROM (SELECT ${expression} AS value FROM ${table(source)}) GROUP BY value ORDER BY count(*) DESC, value NULLS LAST LIMIT 51`;
}
export function groupSelect(source: string, expression: string, value: string | null): string {
  return `SELECT * FROM ${table(source)} WHERE CAST((${expression}) AS VARCHAR) IS NOT DISTINCT FROM ${literal(value)}`;
}

export const SUMMARIES = {
  leave: 'Leave out',
  join_text: 'Join text',
  distinct_values: 'Distinct values',
  count_distinct: 'Count distinct (excludes missing)',
  first: 'First',
  last: 'Last',
  sum: 'Sum',
  mean: 'Mean',
  min: 'Minimum',
  max: 'Maximum',
  earliest: 'Earliest',
  latest: 'Latest',
  earliest_latest: 'Earliest and latest',
} as const;
export type Summary = keyof typeof SUMMARIES;
export function summaryOptions(field: ArrowField): Summary[] {
  const common: Summary[] = ['count_distinct', 'first', 'last'];
  return [
    'leave',
    ...(isArrowStringField(field) || isArrowDictionaryField(field)
      ? (['join_text', 'distinct_values'] as const)
      : isArrowTemporalField(field)
        ? (['earliest_latest', 'earliest', 'latest'] as const)
        : isArrowIntegerField(field) || isArrowFloatField(field)
          ? (['sum', 'mean', 'min', 'max'] as const)
          : []),
    ...common,
  ];
}
export function aggregateOperation(
  source: string,
  columns: readonly { name: string; field: ArrowField }[],
  keys: string[],
  choices: Record<string, Summary>,
  separator: string,
  sort?: { column: string; descending: boolean },
): Transformation {
  if (!keys.length || keys.some((key) => !columns.some((column) => column.name === key)))
    throw new Error('Choose grouping columns.');
  if (sort && !columns.some((column) => column.name === sort.column))
    throw new Error('Choose a valid sort column.');
  const reserved = [...keys];
  const named = (expression: string, stem: string) => {
    const name = uniqueColumnName(stem, reserved);
    reserved.push(name);
    return `${expression} AS ${identifier(name)}`;
  };
  const order = sort
    ? ` ORDER BY ${identifier(sort.column)} ${sort.descending ? 'DESC' : 'ASC'}`
    : '';
  const selections = [...keys.map(identifier), named('count(*)', 'row count')];
  for (const column of columns) {
    if (keys.includes(column.name)) continue;
    const summary = choices[column.name] ?? 'leave';
    if (summary === 'leave') continue;
    if (!summaryOptions(column.field).includes(summary))
      throw new Error(`Summary is unavailable for ${column.name}.`);
    const value = identifier(column.name);
    const output = (expression: string, suffix = summary.replaceAll('_', ' ')) =>
      selections.push(named(expression, `${column.name} ${suffix}`));
    if (summary === 'earliest_latest') {
      output(`min(${value})`, 'earliest');
      output(`max(${value})`, 'latest');
    } else if (summary === 'join_text')
      output(`string_agg(CAST(${value} AS VARCHAR), ${literal(separator)}${order})`);
    else if (summary === 'distinct_values')
      output(
        `string_agg(DISTINCT CAST(${value} AS VARCHAR), ${literal(separator)} ORDER BY CAST(${value} AS VARCHAR))`,
      );
    else if (summary === 'count_distinct') output(`count(DISTINCT ${value})`);
    else
      output(
        `${({ mean: 'avg', earliest: 'min', latest: 'max', first: 'first', last: 'last', sum: 'sum', min: 'min', max: 'max' } as const)[summary]}(${value}${summary === 'first' || summary === 'last' ? order : ''})`,
      );
  }
  return {
    select: `SELECT ${selections.join(', ')} FROM ${table(source)} GROUP BY ${keys.map(identifier).join(', ')}`,
    mappings: keys.map((column) => ({ source, column, output: column })),
    computedColumns: reserved.filter((name) => !keys.includes(name)),
  };
}

export interface Normalisation {
  urls: boolean;
  punctuation: boolean;
  symbols: boolean;
  whitespace: boolean;
  ignoreCase: boolean;
}
export function deduplicateOperations(
  source: string,
  columns: readonly { name: string; field: ArrowField }[],
  keys: string[],
  normalisation: Normalisation,
): { kept: Transformation; duplicates: Transformation; keptColumn: string } {
  if (!keys.length || keys.some((key) => !columns.some((column) => column.name === key)))
    throw new Error('Choose columns to compare.');
  const names = columns.map((column) => column.name);
  const order = uniqueColumnName('__wf_order', names);
  const rank = uniqueColumnName('__wf_rank', [...names, order]);
  const size = uniqueColumnName('__wf_size', [...names, order, rank]);
  const keptColumn = uniqueColumnName('kept', names);
  const expressions = keys.map((key) => {
    let value = identifier(key);
    const field = columns.find((column) => column.name === key)!.field;
    if (!isArrowStringField(field) && !isArrowDictionaryField(field)) return value;
    value = `CAST(${value} AS VARCHAR)`;
    if (normalisation.ignoreCase) value = `lower(${value})`;
    if (normalisation.urls)
      value = `regexp_replace(${value}, '(https?://|www\\.)[^\\s]+', '', 'gi')`;
    if (normalisation.punctuation) value = `regexp_replace(${value}, '\\p{P}', '', 'g')`;
    if (normalisation.symbols) value = `regexp_replace(${value}, '\\p{S}', '', 'g')`;
    if (normalisation.whitespace) value = `regexp_replace(${value}, '[\\p{Z}\\s]', '', 'g')`;
    return value;
  });
  const partition = expressions.join(', ');
  const prefix = `WITH incoming AS (SELECT *, row_number() OVER () AS ${identifier(order)} FROM ${table(source)}), ranked AS (SELECT *, row_number() OVER (PARTITION BY ${partition} ORDER BY ${identifier(order)}) AS ${identifier(rank)}, count(*) OVER (PARTITION BY ${partition}) AS ${identifier(size)} FROM incoming)`;
  const exclude = `${identifier(order)}, ${identifier(rank)}, ${identifier(size)}`;
  const mappings = names.map((column) => ({ source, column, output: column }));
  return {
    kept: {
      select: `${prefix} SELECT * EXCLUDE (${exclude}) FROM ranked WHERE ${identifier(rank)}=1 ORDER BY ${identifier(order)}`,
      mappings,
    },
    duplicates: {
      select: `${prefix} SELECT * EXCLUDE (${exclude}), ${identifier(rank)}=1 AS ${identifier(keptColumn)} FROM ranked WHERE ${identifier(size)}>1 ORDER BY ${identifier(order)}`,
      mappings,
      computedColumns: [keptColumn],
    },
    keptColumn,
  };
}
