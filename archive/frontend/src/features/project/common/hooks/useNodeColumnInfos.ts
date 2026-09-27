import { useQueries } from '@tanstack/react-query';
import {
  type ColumnInfo,
  mapArrowColumnsToInfo,
} from '@/features/project/data-view/utils/columnTypes';
import type { ProjectGraphNode, WorkspaceNodeInfo } from '@/api';
import type { ProjectNodeMetadata } from '../projectNodeMetadata';
import { nodeSchemaQueryOptions } from '@/lib/nodeSchema';

export interface UseNodeColumnInfosResult {
  columnInfoCache: Record<string, ColumnInfo[]>;
  /** Complete graph metadata keyed by Data Block id. */
  nodeInfoById: Record<string, WorkspaceNodeInfo>;
  /**
   * Returns cached column infos for the provided node.
   */
  getColumnInfos: (node: ProjectNodeMetadata | null | undefined) => ColumnInfo[];
  /** Returns the cached node-info response for consumers that need shape or tokenizer metadata. */
  getNodeInfo: (node: ProjectNodeMetadata | null | undefined) => WorkspaceNodeInfo | undefined;
  /** True while one or more schemas are being fetched. */
  isLoading: boolean;
}

/**
 * Pairs complete graph-node metadata with each node's authoritative Arrow
 * schema.
 * Used by: `useTabNodeInputs`, which already receives graph nodes from the
 * canonical Project graph query.
 */
export const useNodeColumnInfos = (params: {
  projectId?: string | null;
  nodes: ProjectGraphNode[];
  enabled?: boolean;
}): UseNodeColumnInfosResult => {
  const { projectId, nodes, enabled = true } = params;
  const nodeIds = nodes.map((node) => node.id);

  const queryEnabled = enabled && Boolean(projectId) && nodeIds.length > 0;
  const schemaQueries = useQueries({
    queries: nodeIds.map((nodeId) => ({
      ...nodeSchemaQueryOptions({ projectId: projectId ?? '', nodeId }),
      enabled: queryEnabled,
      staleTime: 60_000,
    })),
  });

  const nodeInfoById: Record<string, WorkspaceNodeInfo> = {};
  for (const node of nodes) {
    nodeInfoById[node.id] = node;
  }

  const columnInfoCache: Record<string, ColumnInfo[]> = {};
  nodeIds.forEach((nodeId, index) => {
    const schema = schemaQueries[index]?.data;
    if (schema) columnInfoCache[nodeId] = mapArrowColumnsToInfo(schema);
  });

  /** Returns typed cached columns when available. */
  /** Returned to: `useTabNodeInputs` for selector and request hydration. */
  const getColumnInfos = (node: ProjectNodeMetadata | null | undefined): ColumnInfo[] => {
    if (!node) return [];
    return columnInfoCache[node.id] ?? [];
  };

  /** Returns graph metadata for consumers that need the complete node shape. */
  /** Returned to: `useTabNodeInputs` for full metadata lookup. */
  const getNodeInfo = (
    node: ProjectNodeMetadata | null | undefined,
  ): WorkspaceNodeInfo | undefined => (node ? nodeInfoById[node.id] : undefined);

  const isLoading = schemaQueries.some((query) => query.isFetching);

  return { columnInfoCache, nodeInfoById, getColumnInfos, getNodeInfo, isLoading };
};
