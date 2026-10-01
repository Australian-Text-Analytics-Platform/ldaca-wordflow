import { reconcileAnalysisDrafts } from '@/features/tools/common/reconcileAnalysisDrafts';
import type { Rename } from '@/features/tools/common/renameReferences';
import { usePreprocessingInputs } from '@/features/tools/preprocessing/inputState';
import { usePinnedNodesStore } from '@/stores/pinnedNodesStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useEffect } from 'react';
import { useGraphState } from './graphState';
import { targetKey } from './objects';
import { useProjectPreview } from './previewState';
import { useProjectViewState } from './projectViewState';
const receipts = new Map<string, Set<string>>();
let workspaceBase: string | null = null;
/** Only the mounted workspace owns unscoped selection and panel state. */
export function useRenameWorkspace(base: string) {
  useEffect(() => {
    workspaceBase = base;
    return () => {
      if (workspaceBase === base) workspaceBase = null;
    };
  }, [base]);
}
/** Both delivery paths enter here. Commit receipts ignore delayed copies, including after a rename cycle. */
export function reconcileProjectRenames(base: string, renames: Rename[], changeId?: string | null) {
  if (changeId) {
    const seen = receipts.get(base) ?? new Set<string>();
    if (seen.has(changeId)) return;
    seen.add(changeId);
    receipts.set(base, seen);
  }
  reconcileAnalysisDrafts(base, renames);
  if (workspaceBase !== base) return;
  for (const rename of renames) {
    if (rename.type !== 'table') continue;
    const source = rename.source,
      next = { ...source, name: rename.name };
    if (source.schema === 'data') {
      const selection = useSelectionStore.getState();
      selection.replaceSelectedNodes(
        selection.selectedNodeIds.map((id) => (id === source.name ? next.name : id)),
      );
      usePinnedNodesStore.setState((state) => ({
        pinnedNodeIds: state.pinnedNodeIds.map((id) => (id === source.name ? next.name : id)),
      }));
      usePreprocessingInputs.getState().rename(source.name, next.name);
    }
    useProjectPreview.getState().rename(source, next);
    useProjectViewState.getState().rename(targetKey(source), targetKey(next));
    useGraphState.getState().rename(source, next);
  }
}
