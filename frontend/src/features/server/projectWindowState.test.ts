import { afterEach, beforeEach, expect, it } from 'vite-plus/test';
import { useGraphState } from '@/features/project/graphState';
import { useProjectPreview } from '@/features/project/previewState';
import { useProjectViewState } from '@/features/project/projectViewState';
import { usePreprocessingInputs } from '@/features/tools/preprocessing/inputState';
import { usePinnedNodesStore } from '@/stores/pinnedNodesStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { captureProjectWindowState, restoreProjectWindowState } from './projectWindowState';

beforeEach(() => restoreProjectWindowState());
afterEach(() => restoreProjectWindowState());

it('keeps colliding table names independent and restores each project after switching', () => {
  useSelectionStore.getState().replaceSelectedNodes(['data.same']);
  usePinnedNodesStore.getState().togglePinnedNode('data.same');
  useProjectPreview.getState().open('same');
  useProjectViewState.getState().update('data.same', { page: 3 });
  usePreprocessingInputs.getState().set('filter', [{ node_id: 'same', column: 'text' }]);
  useGraphState.setState({
    mode: 'dependencies',
    dependencies: { nodes: new Map([['data.same', { position: { x: 12, y: 34 } }]]) },
  });
  const a = captureProjectWindowState();

  restoreProjectWindowState();
  expect(useSelectionStore.getState().selectedNodeIds).toEqual([]);
  expect(usePinnedNodesStore.getState().pinnedNodeIds).toEqual([]);
  expect(useProjectPreview.getState().active).toBeNull();
  expect(useProjectViewState.getState().nodes.size).toBe(0);
  expect(usePreprocessingInputs.getState().byTool).toEqual({});
  expect(useGraphState.getState().mode).toBe('logical');
  useProjectViewState.getState().update('data.same', { page: 7 });
  usePreprocessingInputs.getState().set('filter', [{ node_id: 'same', column: 'other' }]);
  const b = captureProjectWindowState();

  restoreProjectWindowState(a);
  expect(useSelectionStore.getState().selectedNodeIds).toEqual(['data.same']);
  expect(usePinnedNodesStore.getState().pinnedNodeIds).toEqual(['data.same']);
  expect(useProjectPreview.getState().active).toBe('same');
  expect(useProjectViewState.getState().nodes.get('data.same')?.page).toBe(3);
  expect(usePreprocessingInputs.getState().byTool.filter?.[0]?.column).toBe('text');
  expect(useGraphState.getState().dependencies.nodes.get('data.same')?.position).toEqual({
    x: 12,
    y: 34,
  });

  restoreProjectWindowState(b);
  expect(useProjectViewState.getState().nodes.get('data.same')?.page).toBe(7);
  expect(usePreprocessingInputs.getState().byTool.filter?.[0]?.column).toBe('other');
  expect(useProjectPreview.getState().active).toBeNull();
});
