import { beforeEach, expect, it } from 'vitest';
import { useProjectPreview } from './previewState';
import { useSelectionStore } from '@/stores/selectionStore';

beforeEach(() => {
  useProjectPreview.setState({ active: null });
  useSelectionStore.getState().replaceSelectedNodes(['selected']);
});

it('toggles one preview and switches directly without changing selection', () => {
  const preview = useProjectPreview.getState();
  preview.toggle('first');
  expect(useProjectPreview.getState().active).toBe('first');
  preview.toggle('second');
  expect(useProjectPreview.getState().active).toBe('second');
  preview.toggle('second');
  expect(useProjectPreview.getState().active).toBeNull();
  expect(useSelectionStore.getState().selectedNodeIds).toEqual(['selected']);
});

it('sidebar opening is idempotent and selection changes do not close the preview', () => {
  const preview = useProjectPreview.getState();
  preview.open('first');
  preview.open('first');
  useSelectionStore.getState().clearSelection();
  expect(useProjectPreview.getState().active).toBe('first');
  preview.close();
  expect(useProjectPreview.getState().active).toBeNull();
});

it('reconciles rename and deletion without reopening an earlier preview', () => {
  const preview = useProjectPreview.getState();
  preview.open('first');
  preview.open('second');
  preview.rename('second', 'renamed');
  preview.remove('first');
  preview.retain(new Set(['renamed', 'new']));
  expect(useProjectPreview.getState().active).toBe('renamed');
  preview.remove('renamed');
  expect(useProjectPreview.getState().active).toBeNull();
  preview.open('new');
  preview.retain(new Set(['first']));
  expect(useProjectPreview.getState().active).toBeNull();
});
