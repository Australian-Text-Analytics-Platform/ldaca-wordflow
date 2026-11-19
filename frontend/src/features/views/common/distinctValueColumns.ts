import { getDistinctValueColumns } from '@/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * A Data Block's columns with at most `maxDistinct` different values, each
 * mapped to that number. The backend applies the rule Topic Modelling's Colour
 * by uses: distinct values without the empty ones, in the Data Block's column
 * order.
 *
 * Used by: the tools that make one series or one Data Block per value of a
 * column, so they offer only columns with few enough values (Trends Add
 * group, Data Builder Group).
 */
export const distinctValueColumnsQuery = (
  workspaceId: string,
  nodeId: string,
  maxDistinct: number,
) => ({
  queryKey: queryKeys.distinctValueColumns(workspaceId, nodeId, maxDistinct),
  queryFn: async (): Promise<Record<string, number>> => {
    const { data } = await getDistinctValueColumns({
      path: { workspace_id: workspaceId, node_id: nodeId },
      query: { max_distinct: maxDistinct },
      throwOnError: true,
    });
    return Object.fromEntries(data.columns.map((column) => [column.name, column.distinct_values]));
  },
  enabled: Boolean(workspaceId && nodeId),
});
