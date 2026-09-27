import { identifier, relation } from '@/features/project/api';
import { isArrowStringListField } from '@/lib/arrow/decodeArrowTable';
import { isTopicCoverageField } from '@/lib/arrow/semanticTypes';
import type { FilterRequest, JoinType } from './types';
import type { SliceRequestPayload } from './slice/hooks/sliceFormModel';
import type { ReplaceRequest } from './replace/hooks/replaceRequestModel';

export const literal = (value: string | number | boolean | null): string => {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Expected a finite numeric value');
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
};
export const table = (name: string) => relation({ table_name: name });
const CURRENT = '__wf_current';
export const selectText = (sql: string) => sql.trim().replace(/;\s*$/, '');
export const bindInput = (sql: string, name: string) =>
  `WITH ${CURRENT} AS (SELECT * FROM ${table(name)}) SELECT * FROM (${selectText(sql)})`;

/** Builders produce ordinary SQL, shared by Preview and Apply. No expression DSL crosses HTTP. */
function filterPredicate(request: FilterRequest): string {
  if (!request.conditions.length) throw new Error('Add at least one filter condition');
  return request.conditions
    .map((condition) => {
      const column = identifier(condition.column);
      const value = condition.value;
      const scalar = (input: unknown): string => {
        if (
          typeof input === 'string' ||
          typeof input === 'boolean' ||
          typeof input === 'number' ||
          input === null
        )
          return literal(input);
        throw new Error('Expected a scalar filter value');
      };
      let predicate: string;
      if (condition.operator === 'is_null') predicate = `${column} IS NULL`;
      else if (isTopicCoverageField(condition.field)) {
        if (
          !value ||
          typeof value !== 'object' ||
          !('topic_id' in value) ||
          !('threshold' in value)
        )
          throw new Error('Choose a topic and coverage threshold');
        const comparison = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=' }[
          condition.operator as 'gt'
        ];
        if (!comparison) throw new Error('Unsupported coverage comparison');
        predicate = `list_extract(${column}, CAST(${scalar(value.topic_id)} AS INTEGER) + 2) ${comparison} ${scalar(value.threshold)}`;
      } else if (condition.operator === 'in') {
        if (!Array.isArray(value)) throw new Error('Select filter values');
        const nonNull = value.filter((item) => item !== null);
        const match =
          nonNull.length === 0
            ? 'FALSE'
            : condition.field && isArrowStringListField(condition.field)
              ? `list_has_any(${column}, [${nonNull.map(scalar).join(', ')}])`
              : `${column} IN (${nonNull.map(scalar).join(', ')})`;
        predicate = value.includes(null) ? `${column} IS NULL OR (${match})` : match;
      } else if (condition.operator === 'between') {
        if (!value || typeof value !== 'object' || !('start' in value) || !('end' in value))
          throw new Error('Enter a range');
        const bounds = [
          value.start != null && value.start !== '' ? `${column} >= ${scalar(value.start)}` : '',
          value.end != null && value.end !== '' ? `${column} <= ${scalar(value.end)}` : '',
        ].filter(Boolean);
        if (!bounds.length) throw new Error('Enter a range bound');
        predicate = bounds.join(' AND ');
      } else if (['contains', 'starts_with', 'ends_with'].includes(condition.operator)) {
        if (condition.regex)
          predicate = `regexp_matches(${column}, ${scalar(value)}, ${literal(condition.case_sensitive ? 'c' : 'i')})`;
        else {
          const lhs = condition.case_sensitive ? column : `lower(${column})`;
          const rhs = condition.case_sensitive ? scalar(value) : `lower(${scalar(value)})`;
          predicate = `${condition.operator}(${lhs}, ${rhs})`;
        }
      } else {
        const comparison = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[
          condition.operator as 'eq'
        ];
        if (!comparison) throw new Error('Unsupported filter operator');
        predicate = `${column} ${comparison} ${scalar(value)}`;
      }
      return condition.negate ? `NOT (${predicate})` : `(${predicate})`;
    })
    .join(request.logic === 'or' ? ' OR ' : ' AND ');
}
export const filterSelect = (request: FilterRequest) =>
  `SELECT * FROM ${CURRENT} WHERE ${filterPredicate(request)}`;

export function sampleSelect(request: SliceRequestPayload): string {
  const integer = (n: number) => {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Expected a non-negative integer');
    return String(n);
  };
  if (!request.mode || request.mode === 'slice')
    return `SELECT * FROM ${CURRENT}${request.length === undefined ? '' : ` LIMIT ${integer(request.length)}`} OFFSET ${integer(request.offset ?? 0)}`;
  const size =
    request.mode === 'shuffle'
      ? '100 PERCENT'
      : request.sample_size !== undefined && request.sample_size > 0 && request.sample_size < 1
        ? `${String(request.sample_size * 100)} PERCENT`
        : `${integer(request.sample_size ?? 0)} ROWS`;
  return `SELECT * FROM ${CURRENT} USING SAMPLE reservoir(${size})${request.random_seed === undefined ? '' : ` REPEATABLE (${integer(request.random_seed)})`}`;
}

export function joinSelect(
  left: string,
  right: string,
  kind: JoinType,
  leftKey?: string,
  rightKey?: string,
): string {
  const prefix = `SELECT * FROM ${table(left)} AS a ${kind.toUpperCase()} JOIN ${table(right)} AS b`;
  if (kind === 'cross') return prefix;
  if (!leftKey || !rightKey) throw new Error('Choose both join keys');
  return leftKey === rightKey
    ? `${prefix} USING (${identifier(leftKey)})`
    : `${prefix} ON a.${identifier(leftKey)} = b.${identifier(rightKey)}`;
}
export function stackSelect(names: string[], distinct: boolean): string {
  if (names.length < 2) throw new Error('Select at least two Data Blocks');
  return names
    .map((name) => `SELECT * FROM ${table(name)}`)
    .join(distinct ? ' UNION BY NAME ' : ' UNION ALL BY NAME ');
}

function findExpression(request: ReplaceRequest): string {
  const source = identifier(request.source_column);
  const pattern = literal(request.pattern);
  if (request.mode !== 'extract')
    return `regexp_replace(${source}, ${pattern}, ${literal(request.replacement ?? '')}${request.count === 'first' ? '' : ", 'g'"})`;
  let matches = `regexp_extract_all(${source}, ${pattern})`;
  if (request.count === 'first') {
    if (!Number.isSafeInteger(request.match_limit) || (request.match_limit ?? 0) < 1)
      throw new Error('Match count must be a positive integer');
    matches = `list_slice(${matches}, 1, ${String(request.match_limit)})`;
  }
  return `array_to_string(${matches}, ${literal(request.connector ?? ' ')})`;
}
/** DuckDB identifiers fold ASCII case, including quoted identifiers. */
export const resolveColumnName = (name: string, existing: readonly string[]) => {
  const fold = (value: string) => value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return existing.find((column) => fold(column) === fold(name)) ?? name;
};
export const columnSelect = (column: string, expression: string, existing: readonly string[]) =>
  existing.includes(column)
    ? `SELECT * REPLACE (${expression} AS ${identifier(column)}) FROM ${CURRENT}`
    : `SELECT *, ${expression} AS ${identifier(column)} FROM ${CURRENT}`;

export function findColumn(request: ReplaceRequest, existing: readonly string[]) {
  const output = request.output_column?.trim();
  const column = resolveColumnName(output?.length ? output : request.source_column, existing);
  const expression = findExpression(request);
  return { column, expression, select: columnSelect(column, expression, existing) };
}
