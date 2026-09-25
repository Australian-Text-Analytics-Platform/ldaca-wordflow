import { useQuery } from '@tanstack/react-query';
import { queryWorkspaceSqlTable } from '@/api';
import { queryKeys } from '@/lib/queryKeys';

const PAGE_SIZE = 500;

/**
 * One page of a read-only SQL query over a Data Block, for the Data Builder
 * tools that need counts (row totals, value counts per group).
 */
export function useBuilderSql(
  workspaceId: string | null,
  nodeId: string | null,
  sql: string | null,
) {
  return useQuery({
    queryKey: queryKeys.workspaceSql(
      workspaceId ?? '',
      nodeId ? [nodeId] : [],
      sql ?? '',
      1,
      PAGE_SIZE,
    ),
    enabled: Boolean(workspaceId && nodeId && sql),
    retry: false,
    queryFn: async ({ signal }) => {
      if (!workspaceId || !nodeId || !sql) throw new Error('Missing query identity');
      return queryWorkspaceSqlTable({
        path: { workspace_id: workspaceId },
        body: { mode: 'query', node_ids: [nodeId], sql, page: 1, page_size: PAGE_SIZE },
        signal,
      });
    },
  });
}
