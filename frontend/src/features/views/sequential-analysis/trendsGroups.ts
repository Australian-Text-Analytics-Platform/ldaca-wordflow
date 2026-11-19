import { getDistinctValueColumns, queryWorkspaceSqlTable, sqlIdentifier, sqlTable } from '@/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Trends draws one series per group. Far more freezes the page, and a saved
 * result reopens with it, so runs with more groups are refused and such a
 * result is not drawn (issue 326). The backend uses the same limit.
 */
export const MAX_TRENDS_GROUPS = 1_000;

/**
 * A group column has at most this many different values: each becomes a
 * line or bar series, and more cannot be told apart in the chart and its
 * legend. Add group offers only such columns (Chao, 19 Nov 2026).
 */
export const MAX_TRENDS_GROUP_VALUES = 16;

/** Shown when no column qualifies, so the reason is never a mystery. */
export const NO_GROUP_COLUMN_REASON = `No column in this Data Block has ${String(MAX_TRENDS_GROUP_VALUES)} or fewer different values, so there is nothing to group by.`;

/**
 * The columns Add group offers, with each one's number of different values.
 * The backend applies the rule Topic Modelling's Colour by uses: distinct
 * values without the empty ones, in the Data Block's column order.
 */
export const groupColumnsQuery = (workspaceId: string, nodeId: string) => ({
  queryKey: queryKeys.distinctValueColumns(workspaceId, nodeId, MAX_TRENDS_GROUP_VALUES),
  queryFn: async () => {
    const { data } = await getDistinctValueColumns({
      path: { workspace_id: workspaceId, node_id: nodeId },
      query: { max_distinct: MAX_TRENDS_GROUP_VALUES },
      throwOnError: true,
    });
    return Object.fromEntries(data.columns.map((column) => [column.name, column.distinct_values]));
  },
  enabled: Boolean(workspaceId && nodeId),
});

/** The number of groups in a Trends result's rows (one group_index each). */
export function countResultGroups(rows: readonly Record<string, unknown>[]): number {
  const groups = new Set<unknown>();
  for (const row of rows) groups.add(row.group_index);
  return groups.size;
}

/** How many different values a column has, for the group column hint. */
export const uniqueValueCountQuery = (workspaceId: string, nodeId: string, columnName: string) => ({
  queryKey: queryKeys.columnUniqueValues(workspaceId, nodeId, columnName),
  queryFn: async () => {
    const column = sqlIdentifier(columnName);
    const response = await queryWorkspaceSqlTable({
      path: { workspace_id: workspaceId },
      body: {
        mode: 'query',
        node_ids: [nodeId],
        sql: `SELECT COUNT(DISTINCT ${column}) AS unique_count, COUNT(*) > COUNT(${column}) AS has_null FROM ${sqlTable(nodeId)}`,
        page: 1,
        page_size: 1,
      },
    });
    const row = response.rows[0];
    return {
      unique_count: Number(row?.unique_count ?? 0),
      has_null: row?.has_null === true,
    };
  },
  enabled: Boolean(workspaceId && nodeId && columnName),
});
