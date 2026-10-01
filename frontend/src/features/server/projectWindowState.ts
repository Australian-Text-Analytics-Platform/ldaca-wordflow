import { useGraphState } from '@/features/project/graphState';
import { useProjectPreview } from '@/features/project/previewState';
import { useProjectViewState } from '@/features/project/projectViewState';
import { usePreprocessingInputs } from '@/features/tools/preprocessing/inputState';
import { usePinnedNodesStore } from '@/stores/pinnedNodesStore';
import { useSelectionStore } from '@/stores/selectionStore';

/** Snapshot only window-owned interaction state; each project keeps its own query client. */
export function captureProjectWindowState() {
  const { mode, selected, logical, dependencies } = useGraphState.getState();
  const { activeTool, byTool, join } = usePreprocessingInputs.getState();
  return {
    graph: { mode, selected, logical, dependencies },
    preprocessing: { activeTool, byTool, join },
    preview: { active: useProjectPreview.getState().active },
    views: { nodes: useProjectViewState.getState().nodes },
    pins: { pinnedNodeIds: usePinnedNodesStore.getState().pinnedNodeIds },
    selection: { selectedNodeIds: useSelectionStore.getState().selectedNodeIds },
  };
}

export function restoreProjectWindowState(state?: ReturnType<typeof captureProjectWindowState>) {
  const { mode, selected, logical, dependencies } = useGraphState.getInitialState();
  const { activeTool, byTool, join } = usePreprocessingInputs.getInitialState();
  useGraphState.setState(state?.graph ?? { mode, selected, logical, dependencies });
  usePreprocessingInputs.setState(state?.preprocessing ?? { activeTool, byTool, join });
  useProjectPreview.setState(state?.preview ?? { active: null });
  useProjectViewState.setState(state?.views ?? { nodes: new Map() });
  usePinnedNodesStore.setState(state?.pins ?? { pinnedNodeIds: [] });
  useSelectionStore.setState(state?.selection ?? { selectedNodeIds: [] });
}
