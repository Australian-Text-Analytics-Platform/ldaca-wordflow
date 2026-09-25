/**
 * Pure helpers for Split by group (issue 149): the SQL that counts each group,
 * and the Filter conditions that make one Data Block per ticked group.
 */
import type { FilterConditionInput } from '@/api';
import { sqlIdentifier, sqlTable } from '@/api';
import type { ColumnKind } from '../builder/builderTypes';

/** At most this many Data Blocks per run. */
export const MAX_GROUPS = 50;

export type DateGrouping = 'year' | 'year_month' | 'date';

export type Grouping =
  | { kind: 'values' }
  | { kind: 'dates'; by: DateGrouping }
  | { kind: 'interval'; start: number; size: number }
  | { kind: 'bins'; count: number; low: number; high: number };

export interface Group {
  key: string;
  label: string;
  rows: number;
  conditions: FilterConditionInput[];
}

const DATE_FORMATS: Record<DateGrouping, string> = {
  year: '%Y',
  year_month: '%Y-%m',
  date: '%Y-%m-%d',
};

export function defaultGrouping(kind: ColumnKind): Grouping {
  if (kind === 'date') return { kind: 'dates', by: 'year' };
  if (kind === 'number') return { kind: 'interval', start: 0, size: 10 };
  return { kind: 'values' };
}

/** Counts rows per group, most frequent first for values; one extra row signals "too many". */
export function groupCountSql(nodeId: string, column: string, grouping: Grouping): string | null {
  const col = sqlIdentifier(column);
  const table = sqlTable(nodeId);
  const limit = MAX_GROUPS + 1;
  if (grouping.kind === 'values') {
    return `SELECT CAST(${col} AS VARCHAR) AS value, COUNT(*) AS n FROM ${table} GROUP BY value ORDER BY n DESC, value ASC NULLS LAST LIMIT ${String(limit)}`;
  }
  if (grouping.kind === 'dates') {
    return `SELECT STRFTIME(${col}, '${DATE_FORMATS[grouping.by]}') AS value, COUNT(*) AS n FROM ${table} GROUP BY value ORDER BY value ASC NULLS LAST LIMIT ${String(limit)}`;
  }
  const start = grouping.kind === 'interval' ? grouping.start : grouping.low;
  const size = grouping.kind === 'interval' ? grouping.size : binWidth(grouping);
  if (!Number.isFinite(start) || !Number.isFinite(size) || size <= 0) return null;
  return `SELECT FLOOR((${col} - ${String(start)}) / ${String(size)}) AS value, COUNT(*) AS n FROM ${table} GROUP BY value ORDER BY value ASC NULLS LAST LIMIT ${String(limit + 1)}`;
}

/** The low and high values of a number column, for equal-width bins. */
export function rangeSql(nodeId: string, column: string): string {
  const col = sqlIdentifier(column);
  return `SELECT MIN(${col}) AS low, MAX(${col}) AS high FROM ${sqlTable(nodeId)}`;
}

function binWidth(grouping: { count: number; low: number; high: number }): number {
  const span = grouping.high - grouping.low;
  return span > 0 ? span / grouping.count : 1;
}

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));

const pad = (value: number): string => String(value).padStart(2, '0');

/** Period bounds as the UTC ISO strings Filter parses, matching naive and UTC columns. */
function dateRange(by: DateGrouping, value: string): { start: string; end: string } | null {
  const parts = value.split('-').map(Number);
  const [year, month = 1, day = 1] = parts;
  if (year === undefined || parts.some((part) => !Number.isFinite(part))) return null;
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(start);
  if (by === 'year') end.setUTCFullYear(year + 1);
  else if (by === 'year_month') end.setUTCMonth(month);
  else end.setUTCDate(day + 1);
  const iso = (date: Date) =>
    `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T00:00:00Z`;
  return { start: iso(start), end: iso(end) };
}

const asText = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
      ? String(value)
      : JSON.stringify(value);

/** Turns the counted rows into groups, each with the Filter that selects it. */
export function toGroups(
  column: string,
  grouping: Grouping,
  rows: readonly Record<string, unknown>[],
): Group[] {
  const groups: Group[] = [];
  const bins = grouping.kind === 'bins' ? grouping : null;
  const size = grouping.kind === 'interval' ? grouping.size : bins ? binWidth(bins) : 0;
  const start = grouping.kind === 'interval' ? grouping.start : bins ? bins.low : 0;
  for (const row of rows) {
    const count = Number(row.n ?? 0);
    const value = row.value;
    if (value === null || value === undefined) {
      groups.push({
        key: '__null__',
        label: '(empty)',
        rows: count,
        conditions: [{ column, operator: 'is_null' }],
      });
      continue;
    }
    const text = asText(value);
    if (grouping.kind === 'values') {
      groups.push({
        key: `v:${text}`,
        label: text,
        rows: count,
        conditions: [{ column, operator: 'eq', value: text }],
      });
      continue;
    }
    if (grouping.kind === 'dates') {
      const range = dateRange(grouping.by, text);
      if (!range) continue;
      groups.push({
        key: `d:${text}`,
        label: text,
        rows: count,
        conditions: [
          { column, operator: 'gte', value: range.start },
          { column, operator: 'lt', value: range.end },
        ],
      });
      continue;
    }
    // With equal-width bins, the highest value closes the last bin.
    const index = bins ? Math.min(Number(value), bins.count - 1) : Number(value);
    const key = `n:${String(index)}`;
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.rows += count;
      continue;
    }
    const low = start + index * size;
    const closesRange = bins !== null && index === bins.count - 1;
    const high = closesRange ? bins.high : low + size;
    groups.push({
      key,
      label: `${formatNumber(low)} to ${closesRange ? '' : 'under '}${formatNumber(high)}`,
      rows: count,
      conditions: [
        { column, operator: 'gte', value: low },
        { column, operator: closesRange ? 'lte' : 'lt', value: high },
      ],
    });
  }
  return groups;
}

/** "speeches · Labor", made safe for Data Block names. */
export function groupBlockName(prefix: string, label: string): string {
  const printable = Array.from(label, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
  const safe = printable
    .replaceAll('/', '-')
    .replaceAll('\\', '-')
    .replace(/\.{2,}/g, '.')
    .trim()
    .slice(0, 120);
  return `${prefix} · ${safe || '(blank)'}`;
}
