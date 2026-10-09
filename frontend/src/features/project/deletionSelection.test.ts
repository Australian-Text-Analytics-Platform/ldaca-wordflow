import { expect, it } from 'vite-plus/test';
import { dependentSelection } from './deletionSelection';
import type { DependencyGraph } from './api';
const object = (name: string) => ({ schema: 'data', name });
it('includes SQL dependents transitively and keeps sources when a dependent is unticked', () => {
  const graph: DependencyGraph = {
    nodes: ['root', 'child', 'grandchild', 'independent'].map((name) => ({
      object: object(name),
      kind: 'view',
      column_count: 1,
      registered: true,
      visible: true,
      color: null,
      can_undo: false,
    })),
    edges: [
      { source: object('root'), target: object('child') },
      { source: object('child'), target: object('grandchild') },
    ],
  };
  expect(dependentSelection(graph, [object('root')]).map((item) => item.name)).toEqual([
    'root',
    'child',
    'grandchild',
  ]);
  expect(dependentSelection(graph, [object('child')], true).map((item) => item.name)).toEqual([
    'root',
    'child',
  ]);
  expect(dependentSelection(graph, [object('independent')])).toEqual([object('independent')]);
});
