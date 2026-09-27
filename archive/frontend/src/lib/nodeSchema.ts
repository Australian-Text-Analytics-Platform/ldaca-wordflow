import type { QueryClient } from '@tanstack/react-query';

import { getNodeSchemaTable } from '@/api/tableApi';
import type { ArrowColumn } from '@/lib/arrow/decodeArrowTable';
import { queryKeys } from '@/lib/queryKeys';

interface NodeSchemaQueryArgs {
  projectId: string;
  nodeId: string;
}

export const nodeSchemaQueryOptions = ({ projectId, nodeId }: NodeSchemaQueryArgs) => ({
  queryKey: queryKeys.nodeSchema(projectId, nodeId),
  staleTime: 60_000,
  queryFn: async (): Promise<ArrowColumn[]> => {
    const table = await getNodeSchemaTable({
      path: { workspace_id: projectId, node_id: nodeId },
    });
    return table.schema;
  },
});

export const fetchNodeSchema = async ({
  queryClient,
  projectId,
  nodeId,
  force = false,
}: NodeSchemaQueryArgs & { queryClient: QueryClient; force?: boolean }): Promise<ArrowColumn[]> => {
  if (force) {
    queryClient.removeQueries({ queryKey: queryKeys.nodeSchema(projectId, nodeId) });
  }
  return queryClient.query(nodeSchemaQueryOptions({ projectId, nodeId }));
};

export const invalidateNodeSchemaQuery = (
  queryClient: QueryClient,
  projectId: string,
  nodeId?: string,
): void => {
  void queryClient.invalidateQueries({
    queryKey: nodeId
      ? queryKeys.nodeSchema(projectId, nodeId)
      : queryKeys.projectNodes(projectId),
  });
};
