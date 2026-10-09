import { identifier, relation } from '@/features/project/objects';
import {
  isArrowStringListField,
  isArrowFloatField,
  isArrowStringField,
  isArrowDictionaryField,
  type ArrowField,
} from '@/lib/arrow/decodeArrowTable';
import { DataType } from 'apache-arrow';
import { isTopicCoverageField } from '@/lib/arrow/semanticTypes';
import type { SliceRequestPayload } from './slice/hooks/sliceFormModel';
import type { FilterRequest, JoinType } from './types';

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
export function emptyPredicate(column: string, field?: ArrowField): string {
  const source = identifier(column);
  return `${source} IS NULL${field && isArrowFloatField(field) ? ` OR isnan(${source})` : ''}${field && (isArrowStringField(field) || isArrowDictionaryField(field)) ? ` OR regexp_full_match(CAST(${source} AS VARCHAR), '[\\p{Z}\\s]*')` : ''}`;
}
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
      else if (condition.operator === 'is_empty')
        predicate = emptyPredicate(condition.column, condition.field);
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
        predicate = `(list_extract(${column}, CAST(${scalar(value.topic_id)} AS INTEGER) + 2)).coverage ${comparison} ${scalar(value.threshold)}`;
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
          value.end != null && value.end !== '' ? upperBound(value.end) : '',
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
        predicate =
          condition.operator === 'lte'
            ? upperBound(value)
            : `${column} ${comparison} ${scalar(value)}`;
      }
      return condition.negate ? `NOT (${predicate})` : `(${predicate})`;
      function upperBound(input: unknown) {
        return condition.field &&
          DataType.isTimestamp(condition.field.type) &&
          typeof input === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(input)
          ? `${column} < (CAST(${literal(input)} AS DATE) + INTERVAL 1 DAY)`
          : `${column} <= ${scalar(input)}`;
      }
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
  leftColumns?: readonly string[],
  rightColumns?: readonly string[],
): string {
  let projection = '*';
  if (leftColumns && rightColumns) {
    const fold = (value: string) => value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
    const reserved = new Set(leftColumns.map(fold));
    const merged = kind !== 'cross' && leftKey === rightKey;
    const selections = leftColumns.map((column) => {
      if (merged && column === leftKey && (kind === 'right' || kind === 'full'))
        return `${kind === 'right' ? `b.${identifier(column)}` : `coalesce(a.${identifier(column)}, b.${identifier(column)})`} AS ${identifier(column)}`;
      return `a.${identifier(column)}`;
    });
    if (kind !== 'semi' && kind !== 'anti')
      for (const column of rightColumns) {
        if (merged && column === rightKey) continue;
        const stem = reserved.has(fold(column)) ? `${column}_${right}` : column;
        let name = stem;
        let suffix = 2;
        while (reserved.has(fold(name))) name = `${stem}_${String(suffix++)}`;
        reserved.add(fold(name));
        selections.push(`b.${identifier(column)} AS ${identifier(name)}`);
      }
    projection = selections.join(', ');
  }
  const prefix = `SELECT ${projection} FROM ${table(left)} AS a ${kind.toUpperCase()} JOIN ${table(right)} AS b`;
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

/** DuckDB identifiers fold ASCII case, including quoted identifiers. */
export const resolveColumnName = (name: string, existing: readonly string[]) => {
  const fold = (value: string) => value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return existing.find((column) => fold(column) === fold(name)) ?? name;
};
export const columnSelect = (column: string, expression: string, existing: readonly string[]) =>
  existing.includes(column)
    ? `SELECT * REPLACE (${expression} AS ${identifier(column)}) FROM ${CURRENT}`
    : `SELECT *, ${expression} AS ${identifier(column)} FROM ${CURRENT}`;
