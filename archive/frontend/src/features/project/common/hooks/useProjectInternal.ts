import { useEffect, useMemo, useRef } from 'react';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { useProjectCore } from './useProjectCore';
import { useProjectQueries } from './useProjectQueries';
import { useProjectNodeMutations } from './useProjectNodeMutations';
import { usePreprocessingInputsStore } from '@/stores/preprocessingInputsStore';
import { usePinnedNodesStore } from '@/stores/pinnedNodesStore';
import { useNodeInputRequestsStore } from '@/stores/nodeInputRequestsStore';
import { useAnalysisTabsPresentationStore } from '@/features/views/common/tabs/analysisTabsPresentationStore';

/**
 * Orchestrates core state, queries, and mutations into the single internal
 * project model fanned out by `ServerProjectProvider`.
 * Used by: `ServerProjectProvider`, which fans the composed project model into
 * data, selection, status, and action contexts.
 * Flow: core, query, mutation, and UI-sync hooks combine backend data with local selection before provider contexts expose the slices.
 */
export const useProjectInternal = () => {
  const core = useProjectCore();
  const queryClient = useQueryClient();
  const loadingOperationCount = useIsMutating({ mutationKey: ['project'] });

  const {
    isAuthenticated,
    userId,
    activeNodeId,
    selectedNodeIds,
    activateNode,
    reorderSelectedNodes,
    removeNode,
    replaceSelectedNodes,
    toggleNode,
    clearSelection,
  } = core;

  const {
    projectCatalogue,
    projects,
    currentProject,
    projectGraph,
    nodes,
    selectedNode,
    selectedNodes,
    queryLoadingState,
    currentProjectId,
    projectsHydrated,
    nodesHydrated,
  } = useProjectQueries({
    isAuthenticated,
    activeNodeId,
    selectedNodeIds,
  });

  const previousProjectIdRef = useRef<string | null>(currentProjectId);
  useEffect(() => {
    if (previousProjectIdRef.current === currentProjectId) return;
    clearSelection();
    previousProjectIdRef.current = currentProjectId;
  }, [clearSelection, currentProjectId]);

  useEffect(() => {
    if (!projectsHydrated) return;
    const projectIds = projects.map((project) => project.id);
    usePreprocessingInputsStore.getState().pruneProjects(userId, projectIds);
    useAnalysisTabsPresentationStore.getState().pruneProjects(userId, projectIds);
  }, [userId, projects, projectsHydrated]);

  useEffect(() => {
    if (!currentProjectId || !nodesHydrated) return;
    const nodeIds = nodes.map((node) => node.id);
    const valid = new Set(nodeIds);
    const validSelectedIds = selectedNodeIds.filter((nodeId) => valid.has(nodeId));
    const validActiveNodeId = activeNodeId && valid.has(activeNodeId) ? activeNodeId : null;
    if (validSelectedIds.length !== selectedNodeIds.length || validActiveNodeId !== activeNodeId) {
      replaceSelectedNodes(validSelectedIds, validActiveNodeId);
    }
    usePreprocessingInputsStore.getState().pruneNodes(userId, currentProjectId, nodeIds);
    usePinnedNodesStore.getState().prune(nodeIds);
    useNodeInputRequestsStore.getState().prune(currentProjectId, nodeIds);
  }, [
    activeNodeId,
    currentProjectId,
    nodes,
    nodesHydrated,
    replaceSelectedNodes,
    selectedNodeIds,
    userId,
  ]);

  const { actions: nodeActions } = useProjectNodeMutations({
    currentProjectId,
    removeNode,
    replaceSelectedNodes,
    clearSelection,
    queryClient,
  });

  const selectionActions = useMemo(
    () => ({
      activateNode,
      reorderSelectedNodes,
      removeNode,
      replaceSelectedNodes,
      toggleNode,
      clearSelection,
    }),
    [
      activateNode,
      reorderSelectedNodes,
      removeNode,
      replaceSelectedNodes,
      toggleNode,
      clearSelection,
    ],
  );

  const actions = useMemo(
    () => ({
      ...selectionActions,
      ...nodeActions,
    }),
    [selectionActions, nodeActions],
  );

  const operationsLoading = loadingOperationCount > 0;
  const isLoading = useMemo(
    () => ({
      ...queryLoadingState,
      operations: operationsLoading,
    }),
    [queryLoadingState, operationsLoading],
  );

  return {
    projectCatalogue,
    projects,
    currentProject,
    currentProjectId,
    nodes,
    selectedNode,
    selectedNodes,
    activeNodeId,
    selectedNodeIds,
    projectGraph,
    isLoading,
    actions,
  };
};
