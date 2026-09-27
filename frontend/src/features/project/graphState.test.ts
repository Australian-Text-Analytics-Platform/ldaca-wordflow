import { beforeEach, expect, it } from 'vitest';
import { useGraphState } from './graphState';
import { useProjectPreview } from './previewState';
import { useProjectViewState } from './projectViewState';
import { useSelectionStore } from '@/stores/selectionStore';
import { targetKey } from './api';

beforeEach(() => {
  useGraphState.setState({
    mode: 'logical',
    selected: [],
    logical: { nodes: new Map() },
    dependencies: { nodes: new Map() },
  });
  useProjectPreview.setState({ active: null });
  useProjectViewState.setState({ nodes: new Map() });
  useSelectionStore.getState().replaceSelectedNodes(['same']);
});
it('keeps mode selection and geometry separate while sharing one schema-qualified preview', () => {
  const a = { schema: 'a', name: 'same' };
  const b = { schema: 'b', name: 'same' };
  const logical = {
    nodes: new Map([['same', { position: { x: 1, y: 2 } }]]),
    viewport: { x: 10, y: 20, zoom: 1 },
  };
  const dependencies = {
    nodes: new Map([[targetKey(a), { position: { x: 3, y: 4 } }]]),
    viewport: { x: 30, y: 40, zoom: 0.5 },
  };
  useGraphState.setState({ logical, dependencies, mode: 'dependencies', selected: [targetKey(a)] });
  useProjectPreview.getState().open(a);
  useGraphState.setState({ mode: 'logical' });
  useProjectPreview.getState().retain(new Set(['same']));
  expect(useProjectPreview.getState().active).toEqual(a);
  expect(useSelectionStore.getState().selectedNodeIds).toEqual(['same']);
  useProjectPreview.getState().toggle(b);
  expect(useProjectPreview.getState().active).toEqual(b);
  useGraphState.setState({ mode: 'dependencies' });
  expect(useGraphState.getState()).toMatchObject({
    logical,
    dependencies,
    selected: [targetKey(a)],
  });
  expect(targetKey({ schema: 'a.b', name: 'c' })).not.toBe(targetKey({ schema: 'a', name: 'b.c' }));
});
it('reconciles both canvases and shared table state without touching a same-named object', () => {
  const original = { schema: 'data', name: 'same' };
  const next = { ...original, name: 'renamed' };
  const other = { schema: 'other', name: 'same' };
  useGraphState.setState({
    selected: [targetKey(original), targetKey(other)],
    logical: { nodes: new Map([['same', { position: { x: 1, y: 2 } }]]) },
    dependencies: {
      nodes: new Map([
        [targetKey(original), { position: { x: 3, y: 4 } }],
        [targetKey(other), { position: { x: 5, y: 6 } }],
      ]),
    },
  });
  useProjectPreview.getState().open(original);
  useProjectViewState.getState().update(targetKey(original), { page: 3 });
  useProjectViewState.getState().update(targetKey(other), { page: 7 });
  useGraphState.getState().rename(original, next);
  useProjectPreview.getState().rename(original, next);
  useProjectViewState.getState().rename(targetKey(original), targetKey(next));
  expect(useGraphState.getState().logical.nodes.get('renamed')?.position).toEqual({ x: 1, y: 2 });
  expect(useGraphState.getState().dependencies.nodes.get(targetKey(next))?.position).toEqual({
    x: 3,
    y: 4,
  });
  expect(useGraphState.getState().selected).toEqual([targetKey(next), targetKey(other)]);
  expect(useProjectViewState.getState().nodes.get(targetKey(next))?.page).toBe(3);
  expect(useProjectViewState.getState().nodes.get(targetKey(other))?.page).toBe(7);
  useProjectPreview.getState().remove(other);
  expect(useProjectPreview.getState().active).toEqual(next);
  useProjectPreview.getState().retainObjects(new Set([targetKey(other)]));
  expect(useProjectPreview.getState().active).toBeNull();
});
