import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProjectGraph from './ProjectGraph';
import type { ProjectNode } from './api';

const state = vi.hoisted(() => ({ zoom: 1, count: vi.fn() }));
vi.mock('@/lib/isTauri', () => ({ isTauri: () => false }));
vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  ConnectionLineType: { Bezier: 'bezier' },
  MarkerType: { ArrowClosed: 'arrowclosed', Arrow: 'arrow' },
  Handle: () => null,
  NodeToolbar: ({ children, isVisible }: { children: ReactNode; isVisible: boolean }) =>
    isVisible ? children : null,
  useStore: (select: (s: { transform: number[] }) => number) =>
    select({ transform: [0, 0, state.zoom] }),
}));
vi.mock('./graph-view/components/ProjectGraphView', () => ({
  ProjectGraphView: ({
    graph,
  }: {
    graph: {
      nodes: { id: string; data: Record<string, unknown> }[];
      nodeTypes: { customNode: ComponentType<{ id: string; data: Record<string, unknown> }> };
    };
  }) => {
    const Card = graph.nodeTypes.customNode;
    return graph.nodes.map((node) => <Card key={node.id} id={node.id} data={node.data} />);
  },
}));
beforeEach(() => {
  state.zoom = 1;
  state.count.mockReset();
  vi.stubGlobal('fetch', state.count);
});
afterEach(() => vi.unstubAllGlobals());
function mount(node: Partial<ProjectNode> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    graph: {
      nodes: [
        {
          table_name: 'documents',
          kind: 'table' as const,
          column_count: 2,
          color: null,
          visible: true,
          document_column: null,
          can_undo: false,
          ...node,
        },
      ],
      edges: [],
    },
    base: 'http://project',
    selected: [],
    onSelect: vi.fn(),
    onPreview: vi.fn(),
    previewed: null,
    onClear: vi.fn(),
    onDelete: vi.fn(),
    onDeleteMany: vi.fn(),
    onRename: vi.fn(),
    onClone: vi.fn(),
    onUndo: vi.fn(),
    onMaterialize: vi.fn(),
    onEditSql: vi.fn(),
    onDropFiles: vi.fn(),
  };
  const ui = (
    <QueryClientProvider client={client}>
      <ProjectGraph {...props} />
    </QueryClientProvider>
  );
  return { ...render(ui), client, ui, props };
}
it('shows only columns and never queries data on expanded hover, focus, or Preview', () => {
  const { props } = mount();
  const card = screen.getByTestId('custom-node-card');
  expect(card).toHaveTextContent('Columns: 2');
  expect(card).not.toHaveTextContent('Shape');
  fireEvent.mouseEnter(card);
  fireEvent.mouseLeave(card);
  fireEvent.mouseEnter(card);
  fireEvent.focus(card);
  fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));
  expect(props.onPreview).toHaveBeenCalledWith('documents');
  expect(fetch).not.toHaveBeenCalled();
});
it('does not query data on compact hover and retains keyboard Preview access', () => {
  state.zoom = 0.4;
  const { props } = mount();
  const card = screen.getByTestId('custom-node-compact-card');
  fireEvent.mouseEnter(card);
  fireEvent.focus(card);
  fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));
  expect(props.onPreview).toHaveBeenCalledWith('documents');
  expect(fetch).not.toHaveBeenCalled();
});
it('retains unavailable objects and their diagnostic without inventing a count', () => {
  mount({
    kind: 'missing',
    column_count: null,
    diagnostic: { code: 'missing_object', message: 'Registered object is missing' },
  });
  expect(screen.getByTestId('custom-node-card')).toHaveTextContent('Columns: Unavailable');
  expect(screen.getByText('Registered object is missing')).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});
