import { useShallow } from 'zustand/react/shallow';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useSelectionStore } from '@/stores/selectionStore';

/**
 * Reads the selection store fields the project feature owns.
 * Called only by useProjectCore so query and mutation composition shares one
 * shallow selection subscription.
 */
const useSelectionSlice = () =>
  useSelectionStore(
    useShallow((state) => ({
      activeNodeId: state.activeNodeId,
      selectedNodeIds: state.selectedNodeIds,
      activateNode: state.activateNode,
      reorderSelectedNodes: state.reorderSelectedNodes,
      removeNode: state.removeNode,
      replaceSelectedNodes: state.replaceSelectedNodes,
      toggleNode: state.toggleNode,
      clearSelection: state.clearSelection,
    })),
  );

/**
 * Core project wiring for auth and semantic node selection. Data-view request state is intentionally
 * absent: `useProjectDataTable` owns its per-node pagination/sort/filter
 * lifecycle and server query.
 * Used by: `useProjectInternal`, which supplies these client-state inputs to
 * query and mutation hooks before building provider slices.
 * Flow: read authenticated readiness plus selection and operation state, clear
 * selection at project boundaries, and expose the query gate, semantic
 * selection actions, and operation helpers to the project orchestrator.
 */
export const useProjectCore = () => {
  const { isAuthenticated, user } = useAuth();
  const {
    activeNodeId,
    selectedNodeIds,
    activateNode,
    reorderSelectedNodes,
    removeNode,
    replaceSelectedNodes,
    toggleNode,
    clearSelection,
  } = useSelectionSlice();

  return {
    isAuthenticated,
    userId: user?.id ?? '__anonymous__',
    activeNodeId,
    selectedNodeIds,
    activateNode,
    reorderSelectedNodes,
    removeNode,
    replaceSelectedNodes,
    toggleNode,
    clearSelection,
  } as const;
};
