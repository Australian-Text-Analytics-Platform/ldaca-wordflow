import { queryWorkspaceSqlTable, sqlIdentifier, sqlTable } from '@/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Trends draws one series per group. Far more freezes the page, and a saved
 * result reopens with it, so runs with more groups are refused and such a
 * result is not drawn (issue 326). The backend uses the same limit.
 */
export const MAX_TRENDS_GROUPS = 1_000;

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
