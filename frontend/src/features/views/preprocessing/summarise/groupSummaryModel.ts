import type { BuilderInput, ColumnKind, DerivationBody } from '../builder/builderTypes';

export type Summary =
  | 'leave'
  | 'join_text'
  | 'count_distinct'
  | 'distinct_values'
  | 'first'
  | 'last'
  | 'sum'
  | 'mean'
  | 'min'
  | 'max'
  | 'earliest'
  | 'latest'
  | 'earliest_latest';

/** Summaries that make sense for each column type. */
export const SUMMARIES_BY_KIND: Record<ColumnKind, Summary[]> = {
  text: ['leave', 'join_text', 'count_distinct', 'distinct_values', 'first', 'last'],
  number: ['leave', 'sum', 'mean', 'min', 'max', 'count_distinct', 'first', 'last'],
  date: ['leave', 'earliest_latest', 'earliest', 'latest', 'count_distinct', 'first', 'last'],
  boolean: ['leave', 'count_distinct', 'first', 'last'],
  other: ['leave', 'count_distinct', 'first', 'last'],
};

/**
 * Cautious defaults (issue 150): the text column is joined, dates keep their
 * range, and everything else is left out until chosen.
 */
export function defaultSummary(column: { name: string; kind: ColumnKind }, textColumn: string) {
  if (column.name === textColumn && column.kind === 'text') return 'join_text';
  if (column.kind === 'date') return 'earliest_latest';
  return 'leave';
}

export function buildGroupSummaryBody(
  input: BuilderInput,
  form: {
    groupBy: string[];
    choices: Record<string, Summary>;
    separator: string;
    name: string;
  },
): DerivationBody | null {
  const groupBy = form.groupBy.filter((column) =>
    input.columns.some((item) => item.name === column),
  );
  if (groupBy.length === 0) return null;
  const summaries = input.columns
    .filter((column) => !groupBy.includes(column.name))
    .map((column) => ({
      column: column.name,
      summary: form.choices[column.name] ?? defaultSummary(column, input.column),
    }))
    .filter(
      (item): item is { column: string; summary: Exclude<Summary, 'leave'> } =>
        item.summary !== 'leave',
    )
    .map((item) =>
      item.summary === 'join_text' || item.summary === 'distinct_values'
        ? { ...item, separator: form.separator }
        : item,
    );
  return {
    kind: 'group_summary',
    source_node_id: input.id,
    group_by: groupBy,
    summaries,
    name: form.name.trim() || undefined,
  };
}
