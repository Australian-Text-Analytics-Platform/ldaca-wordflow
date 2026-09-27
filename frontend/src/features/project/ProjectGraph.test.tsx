import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProjectGraph from './ProjectGraph';
import type { ProjectGraphView } from './graph-view/components/ProjectGraphView';
import type { CustomNodeData } from './graph-view/components/CustomNodeView';
import type { Graph } from './api';
import { useProjectFileDrop } from './useProjectFileDrop';

const native = vi.hoisted(() => ({
  listen: vi.fn(),
  stop: vi.fn(),
  size: vi.fn(),
  scaleFactor: vi.fn(),
  macOS: false,
  hit: vi.fn(),
  graph: vi.fn(),
}));
vi.mock('@/lib/isTauri', () => ({ isTauri: () => true }));
vi.mock('@/lib/isMacOSDesktop', () => ({ isMacOSDesktop: () => native.macOS }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ scaleFactor: native.scaleFactor }),
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: native.listen, size: native.size }),
}));
vi.mock('@/features/project/graph-view/components/ProjectGraphView', () => ({
  ProjectGraphView: (props: unknown) => {
    native.graph(props);
    return null;
  },
}));
vi.mock('@xyflow/react', () => ({
  ConnectionLineType: { Bezier: 'bezier' },
  MarkerType: { ArrowClosed: 'arrowclosed', Arrow: 'arrow' },
  ReactFlow: () => null,
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
  useStore: vi.fn(),
}));
const originalElementFromPoint = document.elementFromPoint;
beforeEach(() => {
  vi.clearAllMocks();
  native.listen.mockResolvedValue(native.stop);
  native.scaleFactor.mockResolvedValue(2);
  native.size.mockResolvedValue({ width: 2800, height: 1800 });
  native.macOS = false;
  native.hit.mockImplementation((x: number, y: number) =>
    x >= 900 && x <= 1400 && y >= 100 && y <= 500
      ? screen.queryByLabelText('Data Block graph')
      : null,
  );
  document.elementFromPoint = native.hit;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(900, 100, 500, 400),
  );
  vi.stubGlobal('innerWidth', 1400);
  vi.stubGlobal('innerHeight', 900);
  vi.stubGlobal('devicePixelRatio', 2);
});
afterEach(() => {
  document.elementFromPoint = originalElementFromPoint;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function DropGraph({
  onDrop,
  onAdd,
  graph = { nodes: [], edges: [] },
}: {
  onDrop: (paths: string[]) => void;
  onAdd: (id: string, point?: { x: number; y: number }) => void;
  graph?: Graph;
}) {
  useProjectFileDrop(onDrop);
  return (
    <ProjectGraph
      graph={graph}
      base="http://example.test"
      onDeleteMany={vi.fn()}
      onClear={vi.fn()}
      onDelete={vi.fn()}
      onRename={vi.fn()}
      onClone={vi.fn()}
      onUndo={vi.fn()}
      onMaterialize={vi.fn()}
      onEditSql={vi.fn()}
      selected={[]}
      onSelect={vi.fn()}
      onPreview={vi.fn()}
      previewed={null}
      onAddToSelection={onAdd}
    />
  );
}
function renderGraph(onDrop = vi.fn(), onAdd = vi.fn()) {
  return render(<DropGraph onDrop={onDrop} onAdd={onAdd} />);
}
it('routes double-click to the same input action with its pointer position', () => {
  const add = vi.fn();
  renderGraph(vi.fn(), add);
  const { graph } = native.graph.mock.calls.at(-1)?.[0] as {
    graph: { handleNodeDoubleClick: (event: MouseEvent, node: { id: string }) => void };
  };
  const event = new MouseEvent('dblclick', { clientX: 120, clientY: 180, cancelable: true });
  graph.handleNodeDoubleClick(event, { id: 'my table' });
  expect(add).toHaveBeenCalledExactlyOnceWith('my table', { x: 120, y: 180 });
  expect(event.defaultPrevented).toBe(true);
});
async function drop(x: number, y: number, paths = ['/data.csv']) {
  const receive = native.listen.mock.calls[0][0] as (event: {
    payload: { type: string; position: { x: number; y: number }; paths: string[] };
  }) => void;
  await act(async () => {
    receive({ payload: { type: 'drop', position: { x, y }, paths } });
  });
}
it.each([
  { platform: 'macOS Retina', macOS: true, zoom: 1, x: 1100, y: 200 },
  { platform: 'macOS Retina with webview zoom', macOS: true, zoom: 1.25, x: 1375, y: 250 },
  { platform: 'Windows HiDPI', macOS: false, zoom: 1, x: 2200, y: 400 },
  { platform: 'Windows HiDPI with webview zoom', macOS: false, zoom: 1.25, x: 2750, y: 500 },
])('accepts a graph drop on $platform', async ({ macOS, zoom, x, y }) => {
  native.macOS = macOS;
  vi.stubGlobal('innerWidth', 1400 / zoom);
  vi.stubGlobal('innerHeight', 900 / zoom);
  const onDrop = vi.fn();
  const view = renderGraph(onDrop);
  await waitFor(() => expect(native.listen).toHaveBeenCalledOnce());
  await drop(x, y, ['/data.csv', '/other.parquet']);
  expect(onDrop).toHaveBeenCalledExactlyOnceWith(['/data.csv', '/other.parquet']);
  view.unmount();
  expect(native.stop).toHaveBeenCalledOnce();
});
it('ignores native drops outside the import surfaces', async () => {
  native.macOS = true;
  const onDrop = vi.fn();
  renderGraph(onDrop);
  await waitFor(() => expect(native.listen).toHaveBeenCalledOnce());
  await drop(700, 200);
  await drop(1100, 600);
  expect(onDrop).not.toHaveBeenCalled();
});
it('ignores a drop on content overlaying the graph', async () => {
  native.hit.mockReturnValue(document.body);
  const onDrop = vi.fn();
  renderGraph(onDrop);
  await waitFor(() => expect(native.listen).toHaveBeenCalledOnce());
  await drop(2200, 400);
  expect(onDrop).not.toHaveBeenCalled();
});
it('ignores a drop if its graph unmounts while native size is being read', async () => {
  let resolveSize!: (size: { width: number; height: number }) => void;
  native.size.mockReturnValue(
    new Promise((resolve) => {
      resolveSize = resolve;
    }),
  );
  const onDrop = vi.fn();
  const view = renderGraph(onDrop);
  await waitFor(() => expect(native.listen).toHaveBeenCalledOnce());
  await drop(2200, 400);
  view.unmount();
  await act(async () => {
    resolveSize({ width: 2800, height: 1800 });
  });
  expect(onDrop).not.toHaveBeenCalled();
});
it('removes a native listener that finishes registering after unmount', async () => {
  let resolveListener!: (stop: () => void) => void;
  native.listen.mockReturnValue(
    new Promise((resolve) => {
      resolveListener = resolve;
    }),
  );
  const view = renderGraph();
  view.unmount();
  await act(async () => {
    resolveListener(native.stop);
  });
  expect(native.stop).toHaveBeenCalledOnce();
});

it('distinguishes directed SQL dependencies from virtual relationships without colour alone', () => {
  const graph: Graph = {
    nodes: [],
    edges: [
      { source_name: 'source', target_name: 'view', dependency: true },
      { source_name: 'source', target_name: 'snapshot', dependency: false },
    ],
  };
  render(<DropGraph graph={graph} onDrop={vi.fn()} onAdd={vi.fn()} />);
  const { graph: model } = native.graph.mock.calls.at(-1)?.[0] as {
    graph: {
      edges: {
        source: string;
        target: string;
        ariaLabel: string;
        markerEnd: { type: string };
        style: { strokeDasharray?: string };
      }[];
    };
  };
  expect(model.edges[0]).toMatchObject({
    source: 'source',
    target: 'view',
    ariaLabel: 'view reads source. SQL dependency.',
    markerEnd: { type: 'arrowclosed' },
  });
  expect(model.edges[0].style.strokeDasharray).toBeUndefined();
  expect(model.edges[1]).toMatchObject({
    ariaLabel: 'Virtual link from source to snapshot.',
    markerEnd: { type: 'arrow' },
    style: { strokeDasharray: '6 4' },
  });
});

function connectionGraph(overrides: Partial<React.ComponentProps<typeof ProjectGraph>> = {}) {
  const callbacks = {
    onSelect: vi.fn(),
    onPreview: vi.fn(),
    onAddToSelection: vi.fn(),
    onLogicalLink: vi.fn(),
    onReplaceSource: vi.fn(),
  };
  const graph: Graph = {
    nodes: ['source', 'view', 'other'].map((table_name) => ({
      table_name,
      visible: true,
      color: null,
      document_column: null,
      kind: table_name === 'view' ? 'view' : 'table',
      column_count: 1,
      can_undo: false,
    })),
    edges: [{ source_name: 'source', target_name: 'view', dependency: true }],
  };
  const props = {
    base: '',
    graph,
    selected: [],
    previewed: null,
    onClear: vi.fn(),
    onDelete: vi.fn(),
    onDeleteMany: vi.fn(),
    onRename: vi.fn(),
    onClone: vi.fn(),
    onUndo: vi.fn(),
    onMaterialize: vi.fn(),
    onEditSql: vi.fn(),
    ...callbacks,
    ...overrides,
  };
  const view = render(<ProjectGraph {...props} />);
  return { ...callbacks, ...view, props };
}
type GraphModel = React.ComponentProps<typeof ProjectGraphView>['graph'];
const model = () => (native.graph.mock.calls.at(-1)?.[0] as { graph: GraphModel }).graph;
const nodeData = (id: string) =>
  model().nodes.find((node) => node.id === id)!.data as CustomNodeData;

it.each(['parent', 'child'] as const)(
  'adds a logical %s without selecting or previewing either endpoint',
  (direction) => {
    const callbacks = connectionGraph();
    act(() => {
      if (direction === 'parent') nodeData('view').onAddLogicalParent!('view');
      else nodeData('view').onAddLogicalChild!('view');
    });
    expect(screen.getByRole('status')).toHaveTextContent(`Choose a ${direction} for view`);
    expect(nodeData('view').connectionCandidate).toBe(false);
    expect(nodeData('other').connectionCandidate).toBe(true);
    act(() => nodeData('view').onConnectionPick!('view'));
    expect(callbacks.onLogicalLink).not.toHaveBeenCalled();
    act(() => nodeData('other').onConnectionPick!('other'));
    expect(callbacks.onLogicalLink).toHaveBeenCalledExactlyOnceWith(
      ...(direction === 'parent' ? ['other', 'view'] : ['view', 'other']),
    );
    expect(callbacks.onSelect).not.toHaveBeenCalled();
    expect(callbacks.onPreview).not.toHaveBeenCalled();
    expect(callbacks.onAddToSelection).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  },
);

it('cancels picking on Escape and when the anchor disappears', () => {
  const view = connectionGraph();
  act(() => nodeData('source').onAddLogicalChild!('source'));
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(nodeData('other').onConnectionPick).toBeUndefined();
  act(() => nodeData('source').onAddLogicalChild!('source'));
  view.rerender(
    <ProjectGraph
      {...view.props}
      graph={{
        nodes: view.props.graph.nodes.filter((node) => node.table_name !== 'source'),
        edges: [],
      }}
    />,
  );
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(view.onLogicalLink).not.toHaveBeenCalled();
});

it('reconnects only the selected source and honours cancellation of a retained drag callback', () => {
  const callbacks = connectionGraph();
  const edge = model().edges[0];
  expect(edge.reconnectable).toBe(false);
  act(() => model().handleEdgeClick!({} as React.MouseEvent, edge));
  expect(model().edges[0].reconnectable).toBe('source');
  expect(model().edges[0].style).toMatchObject({
    stroke: 'var(--vscode-focusBorder)',
    strokeWidth: 3,
  });
  expect(screen.getByRole('status')).toHaveTextContent('Drag the edge near its source');
  const reconnect = model().handleReconnect!;
  act(() => model().handleReconnectStart!(new MouseEvent('mousedown'), edge, 'target'));
  expect(nodeData('other').reconnectTarget).toBe(true);
  expect(nodeData('view').reconnectTarget).toBe(false);
  act(() =>
    reconnect(edge, {
      source: 'other',
      target: 'view',
      sourceHandle: 'reconnect-source',
      targetHandle: null,
    }),
  );
  expect(callbacks.onReplaceSource).toHaveBeenCalledExactlyOnceWith(
    { schema: 'data', name: 'view' },
    { schema: 'data', name: 'source' },
    { schema: 'data', name: 'other' },
  );
  // Server owns the graph: submitting a reconnect never changes it optimistically.
  expect(model().edges[0].source).toBe('source');
  act(() => model().handleReconnectStart!(new MouseEvent('mousedown'), edge, 'target'));
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  act(() =>
    reconnect(edge, { source: 'other', target: 'view', sourceHandle: null, targetHandle: null }),
  );
  expect(callbacks.onReplaceSource).toHaveBeenCalledTimes(1);
});

it('offers source replacement but no logical controls for unregistered dependency objects', () => {
  const view = connectionGraph({
    mode: 'dependencies',
    graph: {
      nodes: ['source', 'view', 'other'].map((name) => ({
        table_name: name,
        object: { schema: name === 'other' ? 'second' : 'first', name },
        visible: false,
        registered: false,
        color: null,
        document_column: null,
        kind: name === 'view' ? 'view' : 'table',
        column_count: 1,
        can_undo: false,
      })),
      edges: [{ source_name: 'source', target_name: 'view', dependency: true }],
    },
  });
  expect(nodeData('source').onAddLogicalChild).toBeUndefined();
  act(() =>
    model().edges[0].domAttributes!.onKeyDown!({
      key: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent<SVGGElement>),
  );
  act(() => nodeData('other').onConnectionPick!('other'));
  expect(view.onReplaceSource).toHaveBeenCalledExactlyOnceWith(
    { schema: 'first', name: 'view' },
    { schema: 'first', name: 'source' },
    { schema: 'second', name: 'other' },
  );
});
