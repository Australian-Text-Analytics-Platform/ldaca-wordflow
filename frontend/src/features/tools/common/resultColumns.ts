import type { components } from '@/api/generated/native';
export type ResultColumn = components['schemas']['ResultColumn'];
export const resultColumnKey = (column: ResultColumn) =>
  JSON.stringify([Boolean(column.metadata), column.column]);
export function orderedResultColumns(columns: ResultColumn[], order: string[]): ResultColumn[] {
  const byKey = new Map(columns.map((column) => [resultColumnKey(column), column]));
  return [...new Set([...order, ...byKey.keys()])]
    .map((key) => byKey.get(key))
    .filter((column): column is ResultColumn => Boolean(column));
}
export function readColumnOrder(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [];
}
