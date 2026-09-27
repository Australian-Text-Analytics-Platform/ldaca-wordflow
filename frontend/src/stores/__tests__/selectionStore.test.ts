import { beforeEach, expect, it } from 'vitest';
import { useSelectionStore } from '../selectionStore';
import { useProjectPreview } from '@/features/project/previewState';

beforeEach(() => {
  useSelectionStore.getState().clearSelection();
  useProjectPreview.setState({ active: null });
});
it('keeps ordered unique membership without a second active-tab state', () => {
  const store = useSelectionStore.getState();
  store.replaceSelectedNodes(['a', 'b', 'a', '', 'c']);
  store.toggleNode('b');
  store.toggleNode('b');
  expect(useSelectionStore.getState().selectedNodeIds).toEqual(['a', 'c', 'b']);
  store.removeNode('c');
  store.removeNode('absent');
  expect(useSelectionStore.getState().selectedNodeIds).toEqual(['a', 'b']);
  expect(useSelectionStore.getState()).not.toHaveProperty('activeNodeId');
});
it('selection removal and clearing leave the displayed preview untouched', () => {
  useProjectPreview.getState().open('b');
  useSelectionStore.getState().replaceSelectedNodes(['a', 'b']);
  useSelectionStore.getState().removeNode('b');
  useSelectionStore.getState().clearSelection();
  expect(useProjectPreview.getState()).toMatchObject({ active: 'b' });
});
