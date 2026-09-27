import { beforeEach, expect, it } from 'vitest';
import { defaultNodeView, useProjectViewState } from './projectViewState';

beforeEach(() => useProjectViewState.setState({ nodes: new Map() }));

it('moves pagination and sorting together on a canonical rename', () => {
  const state = useProjectViewState.getState();
  state.update('source', {
    page: 3,
    size: 50,
    sorting: [{ id: 'value', desc: true }],
  });
  const previous = useProjectViewState.getState().nodes.get('source');
  state.rename('source', 'Source Renamed');
  expect(useProjectViewState.getState().nodes.get('Source Renamed')).toBe(previous);
  expect(useProjectViewState.getState().nodes.has('source')).toBe(false);
  state.retain(new Set(['Source Renamed']));
  expect(useProjectViewState.getState().nodes.get('Source Renamed')).toBe(previous);
  state.retain(new Set());
  expect(useProjectViewState.getState().nodes.size).toBe(0);
});

it('accepts SQL table names that also name JavaScript object properties', () => {
  const state = useProjectViewState.getState();
  state.update('constructor', { page: 2 });
  expect(useProjectViewState.getState().nodes.get('constructor')).toEqual({
    ...defaultNodeView,
    page: 2,
  });
  state.rename('constructor', '__proto__');
  expect(useProjectViewState.getState().nodes.get('__proto__')?.page).toBe(2);
});

it('retains column preferences through node rename and removes deleted columns only from their owner', () => {
  const state = useProjectViewState.getState();
  const columns = {
    widths: { text: 420, old: 100 },
    expanded: { text: true },
    pinning: { start: ['text'], end: ['old'] },
  };
  state.update('a', { page: 4, sorting: [{ id: 'old', desc: true }], columns });
  state.update('b', { page: 7, columns });
  state.changeColumn('a', 'text', 'renamed');
  state.rename('a', 'new');
  expect(useProjectViewState.getState().nodes.get('new')?.columns).toEqual({
    widths: { renamed: 420, old: 100 },
    expanded: { renamed: true },
    pinning: { start: ['renamed'], end: ['old'] },
  });
  state.reconcileColumns('new', new Set(['renamed']));
  expect(useProjectViewState.getState().nodes.get('new')).toMatchObject({
    page: 1,
    sorting: [],
    columns: {
      widths: { renamed: 420 },
      expanded: { renamed: true },
      pinning: { start: ['renamed'], end: [] },
    },
  });
  expect(useProjectViewState.getState().nodes.get('b')).toMatchObject({ page: 7, columns });
});
