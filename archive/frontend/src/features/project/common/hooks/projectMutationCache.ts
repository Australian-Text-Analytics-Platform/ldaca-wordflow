import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { invalidateNodeSchemaQuery } from '@/lib/nodeSchema';
import { queryKeys } from '@/lib/queryKeys';

export interface NodeCacheInvalidationOptions {
  includeData?: boolean;
  /** Invalidates the authoritative Arrow schema query. */
  includeSchema?: boolean;
}

/**
 * Identifies cached queries that belong to one project detail subtree.
 * Used by project selection changes because clearing or switching projects
 * should touch graph and node-detail queries without dropping the project list.
 */
export const isProjectDetailQueryKey = (
  queryKey: QueryKey,
  projectId: string | null | undefined,
) =>
  Boolean(
    projectId &&
      Array.isArray(queryKey) &&
      queryKey[0] === 'projects' &&
      queryKey[1] === projectId &&
      queryKey.length > 1,
  );

/**
 * Invalidates graph-shaped project queries without forcing callers to repeat
 * the current-project null guard.
 * Used by: project mutation hooks because graph mutations share the same
 * TanStack query key and only differ in which backend operation triggered the
 * refresh.
 */
export const invalidateProjectGraphQuery = (
  queryClient: QueryClient,
  projectId: string | null | undefined,
) => {
  if (!projectId) return;
  void queryClient.invalidateQueries({
    queryKey: queryKeys.projectGraph(projectId),
  });
};

/** Refreshes project summaries after a mutation changes metadata or node counts. */
export const invalidateProjectSummaries = (queryClient: QueryClient) => {
  void queryClient.invalidateQueries({ queryKey: queryKeys.projectList, exact: true });
};

const queryKeyDependsOnNode = (
  queryKey: QueryKey,
  projectId: string,
  nodeId: string,
): boolean => {
  if (
    queryKey[0] !== 'projects' ||
    queryKey[1] !== projectId ||
    (queryKey[2] !== 'sql' && queryKey[2] !== 'preprocessing-previews')
  ) {
    return false;
  }
  const dependency = queryKey[3];
  if (typeof dependency !== 'object' || dependency === null || !('nodeIds' in dependency)) {
    return false;
  }
  const nodeIds = (dependency as { nodeIds?: unknown }).nodeIds;
  return Array.isArray(nodeIds) && nodeIds.includes(nodeId);
};

/**
 * Invalidates node-level projections alongside the owning graph.
 * Used by: project mutation success handlers for operations that can rewrite
 * a node's table data or schema.
 * Flow: skip when no project/node id is available, then invalidate the graph,
 * optional schema, and every data projection that declares the node dependency.
 */
export const invalidateNodeProjectQueries = (
  queryClient: QueryClient,
  projectId: string | null | undefined,
  nodeId: string | null | undefined,
  options: NodeCacheInvalidationOptions = {},
) => {
  if (!projectId || !nodeId) return;
  if (options.includeSchema) {
    invalidateNodeSchemaQuery(queryClient, projectId, nodeId);
  }
  invalidateProjectGraphQuery(queryClient, projectId);
  if (options.includeData) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.nodeColumns(projectId, nodeId),
    });
    void queryClient.invalidateQueries({
      predicate: (query) => queryKeyDependsOnNode(query.queryKey, projectId, nodeId),
    });
  }
};
