import { useMemo } from 'react';
import { type QueryClient } from '@tanstack/react-query';
import { refreshProjectNodeSchema } from './projectSchemaRefresh';
import { useProjectAnalysisMutations } from './useProjectAnalysisMutations';
import { useProjectGraphMutations } from './useProjectGraphMutations';
import { useProjectManagementMutations } from './useProjectManagementMutations';
import { useProjectTransformMutations } from './useProjectTransformMutations';

interface ProjectNodeMutationsParams {
  currentProjectId: string | null;
  removeNode: (nodeId: string) => void;
  replaceSelectedNodes: (nodeIds: string[], activeNodeId?: string | null) => void;
  clearSelection: () => void;
  queryClient: QueryClient;
}

/**
 * Builds the project action surface from generated API mutations. The
 * provider exposes these methods to data-loader, graph, data-view, and analysis
 * features.
 * Used by: `useProjectInternal`, which composes generated-API mutations with
 * semantic selection actions for the provider action slice.
 * Flow: the provider supplies project, selection, cache, and operation-lifecycle inputs; generated SDK mutations run, then lifecycle handlers update operation state, selection, and caches.
 */
export const useProjectNodeMutations = ({
  currentProjectId,
  removeNode,
  replaceSelectedNodes,
  clearSelection,
  queryClient,
}: ProjectNodeMutationsParams) => {
  const { actions: managementActions } = useProjectManagementMutations({
    currentProjectId,
    queryClient,
  });

  const { actions: graphActions } = useProjectGraphMutations({
    currentProjectId,
    removeNode,
    replaceSelectedNodes,
    clearSelection,
    queryClient,
  });

  const { actions: transformActions } = useProjectTransformMutations({
    currentProjectId,
    queryClient,
  });

  const { actions: analysisActions } = useProjectAnalysisMutations({
    currentProjectId,
    queryClient,
  });

  // Memoize the action surface so consumers (the ServerProjectProvider context
  // value, every component that destructures useProjectActions, every
  // mutation-fn closure that captures a specific action) keep a stable
  // identity across renders. Without this, the four-slice ServerProjectProvider
  // value churns every parent render and cascades through ~30 consumers.
  //
  // Deps explanation: TanStack's `*.mutateAsync` is referentially stable
  // across the parent's lifetime, so capturing each mutation by closure is
  // safe even though the mutation object itself is recreated. The values
  // that DO change between renders are `currentProjectId`, `queryClient`,
  // and composed sub-action objects; those are listed below.
  // Listing every mutation ref would needlessly invalidate the memo each
  // render without a behaviour difference.
  const actions = useMemo(
    () => ({
      ...managementActions,
      ...graphActions,
      ...transformActions,
      ...analysisActions,
      /**
       * Gives table and graph consumers a guarded schema refresh action.
       * Used by useProjectDataTable and the retained server analysis
       * flows after a schema-changing mutation.
       * Flow: verify the node still exists, then fetch its authoritative Arrow schema.
       */
      refreshNodeSchema: (nodeId: string) =>
        refreshProjectNodeSchema({
          queryClient,
          projectId: currentProjectId,
          nodeId,
        }),
    }),
    [
      analysisActions,
      currentProjectId,
      graphActions,
      managementActions,
      queryClient,
      transformActions,
    ],
  );

  return { actions } as const;
};
