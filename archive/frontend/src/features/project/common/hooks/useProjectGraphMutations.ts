import { useMemo } from 'react';
import { type QueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createNode,
  deleteNode,
  reorderWorkspaceNodesById,
  previewNodeCreationTable,
  updateNode,
} from '@/api';
import type {
  JoinNodeCreateRequest,
  ProjectGraphResponse,
  WorkspaceNodeInfo as NodeInfoResponse,
} from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useFreshNodesStore } from '@/stores/freshNodesStore';
import {
  invalidateNodeProjectQueries,
  invalidateProjectGraphQuery,
  invalidateProjectSummaries,
} from './projectMutationCache';

interface ProjectGraphMutationsParams {
  currentProjectId: string | null;
  removeNode: (nodeId: string) => void;
  replaceSelectedNodes: (nodeIds: string[], activeNodeId?: string | null) => void;
  clearSelection: () => void;
  queryClient: QueryClient;
}

/** Complete identity and transport context for a cancellable stack preview. */
interface ProjectConcatPreviewRequest {
  projectId: string;
  nodeIds: string[];
  page: number;
  pageSize: number;
  deduplicate: boolean;
  signal: AbortSignal;
}

/**
 * Owns node and graph mutations exposed through ServerProjectProvider actions.
 * Used by: useProjectNodeMutations because graph operations share selection
 * updates, project-graph invalidation, summary refreshes, and created-node
 * inference that should not be mixed with project CRUD or table transforms.
 * Flow: build generated-SDK mutations, update operation state, refresh graph
 * caches, select newly-created join/concat nodes, and return stable actions
 * for graph, data loader, and node-history consumers.
 */
export const useProjectGraphMutations = ({
  currentProjectId,
  removeNode,
  replaceSelectedNodes,
  clearSelection,
  queryClient,
}: ProjectGraphMutationsParams) => {
  const ensureProjectSelected = () => {
    if (!currentProjectId) {
      throw new Error('No project selected');
    }
    return currentProjectId;
  };
  const markCreatedNode = (node: NodeInfoResponse) => {
    if (currentProjectId) {
      useFreshNodesStore.getState().markCreated(currentProjectId, [node.id]);
    }
  };
  const renameNodeMutation = useMutation({
    mutationKey: ['project', 'rename-node'],
    mutationFn: ({ nodeId, newName }: { nodeId: string; newName: string }) =>
      updateNode({
        body: { name: newName },
        path: { workspace_id: ensureProjectSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => {
        return data;
      }),
    onSuccess: () => {
      invalidateProjectGraphQuery(queryClient, currentProjectId);
    },
  });

  const copyNodeMutation = useMutation({
    mutationKey: ['project', 'copy-node'],
    mutationFn: ({ nodeId }: { nodeId: string }) =>
      createNode({
        body: { kind: 'clone', source_node_id: nodeId },
        path: { workspace_id: ensureProjectSelected() },
        throwOnError: true,
      }).then(({ data }) => {
        return data;
      }),
    onSuccess: (createdNode: NodeInfoResponse) => {
      markCreatedNode(createdNode);
      invalidateProjectGraphQuery(queryClient, currentProjectId);
      invalidateProjectSummaries(queryClient);
    },
  });

  const setNodeColorMutation = useMutation({
    mutationKey: ['project', 'set-node-color'],
    mutationFn: ({ nodeId, color }: { nodeId: string; color: string }) =>
      updateNode({
        body: { color },
        path: { workspace_id: ensureProjectSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => {
        return data;
      }),
    onSuccess: (_data, { nodeId }) => {
      invalidateNodeProjectQueries(queryClient, currentProjectId, nodeId);
    },
  });

  const deleteNodeMutation = useMutation({
    mutationKey: ['project', 'delete-node'],
    mutationFn: ({ nodeId }: { nodeId: string }) =>
      deleteNode({
        path: { workspace_id: ensureProjectSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => {
        if (data !== undefined) throw new Error('Node deletion returned a body');
        return undefined;
      }),
    onSuccess: (_, { nodeId }) => {
      removeNode(nodeId);
      invalidateNodeProjectQueries(queryClient, currentProjectId, nodeId, {
        includeData: true,
      });
      invalidateProjectSummaries(queryClient);
    },
  });

  const createNodeMutation = useMutation({
    mutationKey: ['project', 'create-node'],
    mutationFn: ({ filename, sheetName }: { filename: string; sheetName?: string }) =>
      createNode({
        path: { workspace_id: ensureProjectSelected() },
        body: { kind: 'file', file_path: filename, sheet_name: sheetName },
        throwOnError: true,
      }).then(({ data }) => {
        return data;
      }),
    onSuccess: (response: NodeInfoResponse) => {
      markCreatedNode(response);
      invalidateProjectGraphQuery(queryClient, currentProjectId);
      invalidateProjectSummaries(queryClient);
      const changes = response.dtype_normalization;
      if (changes && changes.length > 0) {
        const lines = changes.map(
          (c) => `${c.column}: ${c.from_dtype} → ${c.to_dtype} (${c.reason})`,
        );
        const heading =
          changes.length === 1
            ? '1 column was normalized to the standard dtype'
            : `${String(changes.length)} columns were normalized to standard dtypes`;
        void toast.info(heading, {
          description: lines.join('\n'),
          duration: 10000,
        });
      }
    },
  });

  const joinNodesMutation = useMutation({
    mutationKey: ['project', 'join-nodes'],
    mutationFn: ({
      leftNodeId,
      rightNodeId,
      joinType,
      leftColumns,
      rightColumns,
      newNodeName,
    }: {
      leftNodeId: string;
      rightNodeId: string;
      joinType: JoinNodeCreateRequest['how'];
      leftColumns: string[];
      rightColumns: string[];
      newNodeName?: string;
    }) =>
      createNode({
        path: { workspace_id: ensureProjectSelected() },
        body: {
          kind: 'join',
          left_node_id: leftNodeId,
          right_node_id: rightNodeId,
          left_on: leftColumns[0] ?? '',
          right_on: rightColumns[0] ?? '',
          how: joinType,
          name: newNodeName,
        },
        throwOnError: true,
      }).then(({ data }) => {
        return data;
      }),
    onMutate: () => {
      clearSelection();
    },
    onSuccess: (createdNode: NodeInfoResponse) => {
      markCreatedNode(createdNode);
      replaceSelectedNodes([createdNode.id], createdNode.id);
      invalidateProjectGraphQuery(queryClient, currentProjectId);
    },
  });

  const concatNodesMutation = useMutation({
    mutationKey: ['project', 'concat-nodes'],
    mutationFn: ({
      nodeIds,
      newNodeName,
      deduplicate,
    }: {
      nodeIds: string[];
      newNodeName?: string;
      deduplicate?: boolean;
    }) =>
      createNode({
        body: { kind: 'concat', source_node_ids: nodeIds, name: newNodeName, deduplicate },
        path: { workspace_id: ensureProjectSelected() },
        throwOnError: true,
      }).then(({ data }) => {
        return data;
      }),
    onMutate: () => {
      clearSelection();
    },
    onSuccess: (createdNode: NodeInfoResponse) => {
      markCreatedNode(createdNode);
      replaceSelectedNodes([createdNode.id], createdNode.id);
      invalidateProjectGraphQuery(queryClient, currentProjectId);
    },
  });

  const reorderNodesMutation = useMutation<
    undefined,
    Error,
    { orderedIds: string[] },
    { previousGraph: ProjectGraphResponse | undefined }
  >({
    mutationKey: ['project', 'reorder-nodes'],
    mutationFn: ({ orderedIds }: { orderedIds: string[] }) => {
      if (!currentProjectId) {
        throw new Error('No project selected');
      }
      return reorderWorkspaceNodesById({
        body: { ordered_ids: orderedIds },
        path: { workspace_id: currentProjectId },
        throwOnError: true,
      }).then(() => undefined);
    },
    onMutate: async ({ orderedIds }) => {
      if (!currentProjectId) {
        return { previousGraph: undefined };
      }
      const graphKey = queryKeys.projectGraph(currentProjectId);
      await queryClient.cancelQueries({ queryKey: graphKey });
      const previousGraph = queryClient.getQueryData<ProjectGraphResponse>(graphKey);
      if (previousGraph?.nodes) {
        const rankById = new Map(orderedIds.map((id, index) => [id, index]));
        const reordered = [...previousGraph.nodes].sort((a, b) => {
          const aRank = rankById.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const bRank = rankById.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          return aRank - bRank;
        });
        queryClient.setQueryData<ProjectGraphResponse>(graphKey, {
          ...previousGraph,
          nodes: reordered,
        });
      }
      return { previousGraph };
    },
    onSuccess: () => {
      invalidateProjectGraphQuery(queryClient, currentProjectId);
    },
    onError: (_error, _vars, context) => {
      if (currentProjectId && context?.previousGraph) {
        queryClient.setQueryData(
          queryKeys.projectGraph(currentProjectId),
          context.previousGraph,
        );
      }
    },
  });

  const actions = useMemo(
    () => ({
      renameNode: (nodeId: string, newName: string) =>
        renameNodeMutation.mutateAsync({ nodeId, newName }),
      copyNode: (nodeId: string) => copyNodeMutation.mutateAsync({ nodeId }),
      setNodeColor: (nodeId: string, color: string) =>
        setNodeColorMutation.mutateAsync({ nodeId, color }),
      deleteNode: (nodeId: string) => deleteNodeMutation.mutateAsync({ nodeId }),
      reorderNodes: (orderedIds: string[]) => reorderNodesMutation.mutateAsync({ orderedIds }),
      createNodeFromFile: (filename: string, sheetName?: string) =>
        createNodeMutation.mutateAsync({
          filename,
          sheetName,
        }),
      joinNodes: (
        leftNodeId: string,
        rightNodeId: string,
        joinType: JoinNodeCreateRequest['how'],
        leftColumns: string[],
        rightColumns: string[],
        newNodeName?: string,
      ) =>
        joinNodesMutation.mutateAsync({
          leftNodeId,
          rightNodeId,
          joinType,
          leftColumns,
          rightColumns,
          newNodeName,
        }),
      concatNodes: (nodeIds: string[], newNodeName?: string, deduplicate?: boolean) =>
        concatNodesMutation.mutateAsync({ nodeIds, newNodeName, deduplicate }),
      concatPreview: ({
        projectId,
        nodeIds,
        page,
        pageSize,
        deduplicate,
        signal,
      }: ProjectConcatPreviewRequest) =>
        previewNodeCreationTable({
          body: { kind: 'concat', source_node_ids: nodeIds, deduplicate },
          path: { workspace_id: projectId },
          query: { page, page_size: pageSize },
          signal,
        }).then((data) => {
          return {
            data: data.rows,
            columns: data.columns,
            pagination: {
              page,
              page_size: pageSize,
              has_next: data.hasNext,
            },
          };
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation refs intentionally omitted; mutateAsync identities are stable
    [currentProjectId, queryClient],
  );

  return { actions } as const;
};
