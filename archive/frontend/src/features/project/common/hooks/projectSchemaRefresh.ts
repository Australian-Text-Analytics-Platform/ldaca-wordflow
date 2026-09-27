import type { QueryClient } from '@tanstack/react-query';
import type { WorkspaceNodeInfo } from '@/api';
import type { ArrowColumn } from '@/lib/arrow/decodeArrowTable';
import { fetchNodeSchema } from '@/lib/nodeSchema';
import { queryKeys } from '@/lib/queryKeys';

interface RefreshProjectNodeSchemaParams {
  queryClient: QueryClient;
  projectId: string | null;
  nodeId: string;
}

/**
 * Refreshes schema metadata for a node that still exists in the current graph.
 * Used by: useProjectNodeMutations action facade for table and graph
 * consumers that need a manual schema refresh after column-level operations.
 * Flow: skip missing project/node graph entries, then force-fetch Arrow schema.
 */
export const refreshProjectNodeSchema = async ({
  queryClient,
  projectId,
  nodeId,
}: RefreshProjectNodeSchemaParams): Promise<ArrowColumn[] | null> => {
  if (!projectId) return null;
  const graphData = queryClient.getQueryData<{ nodes: WorkspaceNodeInfo[] }>(
    queryKeys.projectGraph(projectId),
  );
  const nodeExists = (graphData?.nodes ?? []).some((node) => node.id === nodeId);
  if (!nodeExists) return null;

  return fetchNodeSchema({ queryClient, projectId, nodeId, force: true });
};
