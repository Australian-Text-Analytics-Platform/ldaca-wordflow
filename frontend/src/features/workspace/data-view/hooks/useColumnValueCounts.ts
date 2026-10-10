/** A column's most common values with counts, for Map values (issue 368). */
import { useQuery } from '@tanstack/react-query';
import { getColumnValueCounts } from '@/api';
import { useWorkspaceData } from '@/features/workspace/common/hooks/useWorkspaceData';
import { presentError } from '@/lib/errorPresentation';

export function useColumnValueCounts(nodeId: string | null, column: string, enabled: boolean) {
  const { currentWorkspaceId } = useWorkspaceData();
  const query = useQuery({
    queryKey: [
      'workspaces',
      currentWorkspaceId ?? '',
      'nodes',
      nodeId ?? '',
      'value-counts',
      column,
    ],
    queryFn: async ({ signal }) => {
      const { data } = await getColumnValueCounts({
        path: { workspace_id: currentWorkspaceId ?? '', node_id: nodeId ?? '' },
        query: { column },
        signal,
        throwOnError: true,
      });
      return data;
    },
    enabled: enabled && Boolean(currentWorkspaceId && nodeId && column),
  });
  // Another column's list must never stand in while this one loads.
  const counts = query.data?.column === column ? query.data : undefined;
  return {
    counts,
    loading: query.isFetching && !counts,
    error: query.error
      ? presentError(query.error, "Couldn't read the column's values.").message
      : null,
  };
}
