import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSelectionStore } from '@/stores/selectionStore';
import { useFreshNodesStore } from '@/stores/freshNodesStore';

const useProjectDataMock = vi.hoisted(() => vi.fn());
const useProjectSelectionMock = vi.hoisted(() => vi.fn());
const useProjectStatusMock = vi.hoisted(() => vi.fn());
const useProjectActionsMock = vi.hoisted(() => vi.fn());
const requestNodeInputAddMock = vi.hoisted(() => vi.fn());
const undoNode = vi.fn();
const redoNode = vi.fn();

vi.mock('@/features/project/common/hooks/useProjectData', () => ({
  useProjectData: useProjectDataMock,
}));
vi.mock('@/features/project/common/hooks/useProjectSelection', () => ({
  useProjectSelection: useProjectSelectionMock,
}));
vi.mock('@/features/project/common/hooks/useProjectStatus', () => ({
  useProjectStatus: useProjectStatusMock,
}));
vi.mock('@/features/project/common/hooks/useProjectActions', () => ({
  useProjectActions: useProjectActionsMock,
}));
vi.mock('@/stores/nodeInputRequestsStore', () => ({
  useNodeInputRequestsStore: (
    selector: (state: { requestAdd: typeof requestNodeInputAddMock }) => unknown,
  ) => selector({ requestAdd: requestNodeInputAddMock }),
}));
vi.mock('../../services/graphLayout', () => ({
  computeDagreLayout: (nodes: { id: string }[]) =>
    new Map(
      nodes.map((node, index) => [node.id, { x: 0, y: (nodes.length - index - 1) * 100 + 50 }]),
    ),
}));

import { useProjectGraph } from '../useProjectGraph';

const makeGraph = (
  color: string,
  edgeLabel: string,
  shape: [number | null, number | null] = [10, 3],
) => ({
  nodes: [
    {
      id: 'node-1',
      name: 'Node one',
      color,
      shape,
      document: 'text',
      can_undo: false,
      can_redo: true,
    },
  ],
  edges: [{ source: 'node-1', target: 'node-1', label: edgeLabel }],
});

const makeIndependentGraph = (nodeIds: string[]) => ({
  nodes: nodeIds.map((id) => ({
    id,
    name: id,
    color: null,
    document: 'text',
    can_undo: false,
    can_redo: false,
  })),
  edges: [],
});

interface TestNodeData {
  node: {
    color: string | null;
    shape: [number | null, number | null];
    canUndo: boolean;
    canRedo: boolean;
  };
  isFresh: boolean;
  onUndo: (nodeId: string) => void;
  onRedo: (nodeId: string) => void;
  onAddToSelection: (nodeId: string, pointer?: { x: number; y: number }) => void;
}

describe('useProjectGraph', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    requestNodeInputAddMock.mockReset();
    undoNode.mockReset();
    redoNode.mockReset();
    useFreshNodesStore.getState().reset();
    useSelectionStore.setState({ currentProjectId: 'project-a' });
    useProjectDataMock.mockReturnValue({
      currentProjectId: 'project-a',
      projectGraph: makeGraph('#ff0000', 'first label'),
    });
    useProjectSelectionMock.mockReturnValue({ selectedNodeIds: [] });
    useProjectStatusMock.mockReturnValue({ isLoading: { graph: false } });
    useProjectActionsMock.mockReturnValue({
      deleteNode: vi.fn(),
      copyNode: vi.fn(),
      renameNode: vi.fn(),
      undoNode,
      redoNode,
      toggleNode: vi.fn(),
      toggleNodeSelection: vi.fn(),
      clearSelection: vi.fn(),
    });
  });

  it('resynchronizes node colour and edge label when topology is unchanged', () => {
    const { result, rerender } = renderHook(() => useProjectGraph());

    expect((result.current.nodes[0]?.data as unknown as TestNodeData).node.color).toBe('#ff0000');
    expect(result.current.edges[0]?.label).toBe('first label');

    useProjectDataMock.mockReturnValue({
      currentProjectId: 'project-a',
      projectGraph: makeGraph('#0000ff', 'second label'),
    });
    rerender();

    expect((result.current.nodes[0]?.data as unknown as TestNodeData).node.color).toBe('#0000ff');
    expect(result.current.edges[0]?.label).toBe('second label');
  });

  it('shows no new marker for loaded nodes and shows one only after explicit creation', () => {
    const { result, rerender } = renderHook(() => useProjectGraph());

    expect((result.current.nodes[0]?.data as unknown as TestNodeData).isFresh).toBe(false);

    act(() => {
      useFreshNodesStore.getState().markCreated('project-a', ['node-1']);
    });
    rerender();

    expect((result.current.nodes[0]?.data as unknown as TestNodeData).isFresh).toBe(true);
  });

  it('projects history flags and routes graph history commands', () => {
    const { result } = renderHook(() => useProjectGraph());
    const data = result.current.nodes[0]?.data as unknown as TestNodeData;

    expect(data.node.canUndo).toBe(false);
    expect(data.node.canRedo).toBe(true);
    act(() => {
      data.onUndo('node-1');
      data.onRedo('node-1');
    });
    expect(undoNode).toHaveBeenCalledWith('node-1');
    expect(redoNode).toHaveBeenCalledWith('node-1');
  });

  it('preserves a dragged position while refreshing node and edge presentation', () => {
    const { result, rerender } = renderHook(() => useProjectGraph());
    const draggedPosition = { x: 420, y: 315 };

    act(() => {
      result.current.handleNodesChange([
        {
          id: 'node-1',
          type: 'position',
          position: draggedPosition,
          dragging: true,
        },
      ]);
    });
    expect(result.current.nodes[0]?.position).toEqual(draggedPosition);

    useProjectDataMock.mockReturnValue({
      currentProjectId: 'project-a',
      projectGraph: makeGraph('#0000ff', 'second label', [20, 4]),
    });
    rerender();

    expect(result.current.nodes[0]?.position).toEqual(draggedPosition);
    expect(result.current.nodes[0]?.dragging).toBe(true);
    const refreshedNode = (result.current.nodes[0]?.data as unknown as TestNodeData).node;
    expect(refreshedNode.color).toBe('#0000ff');
    expect(refreshedNode.shape).toEqual([20, 4]);
    expect(result.current.edges[0]?.label).toBe('second label');
  });

  it('re-applies the complete layout when a Data Block is added', () => {
    useProjectDataMock.mockReturnValue({
      currentProjectId: 'project-a',
      projectGraph: makeIndependentGraph(['node-1']),
    });
    const { result, rerender } = renderHook(() => useProjectGraph());

    expect(result.current.nodes[0]?.position).toEqual({ x: 0, y: 50 });

    useProjectDataMock.mockReturnValue({
      currentProjectId: 'project-a',
      projectGraph: makeIndependentGraph(['node-1', 'node-2']),
    });
    rerender();

    expect(result.current.nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 150 },
      { x: 0, y: 50 },
    ]);
  });

  it('re-applies the complete layout when Data Block lineage changes', () => {
    useProjectDataMock.mockReturnValue({
      currentProjectId: 'project-a',
      projectGraph: makeIndependentGraph(['node-1', 'node-2']),
    });
    const { result, rerender } = renderHook(() => useProjectGraph());

    act(() => {
      result.current.handleNodesChange([
        {
          id: 'node-1',
          type: 'position',
          position: { x: 420, y: 315 },
          dragging: true,
        },
      ]);
    });

    useProjectDataMock.mockReturnValue({
      currentProjectId: 'project-a',
      projectGraph: {
        ...makeIndependentGraph(['node-1', 'node-2']),
        edges: [{ source: 'node-1', target: 'node-2', label: 'derived' }],
      },
    });
    rerender();

    expect(result.current.nodes[0]?.position).toEqual({ x: 0, y: 150 });
    expect(result.current.nodes[0]?.dragging).toBeUndefined();
  });

  it('resets React Flow-owned state when a new project reuses the same node id', () => {
    const { result, rerender } = renderHook(() => useProjectGraph());

    act(() => {
      result.current.handleNodesChange([
        {
          id: 'node-1',
          type: 'position',
          position: { x: 420, y: 315 },
          dragging: true,
        },
      ]);
    });

    useSelectionStore.setState({ currentProjectId: 'project-b' });
    useProjectDataMock.mockReturnValue({
      currentProjectId: 'project-b',
      projectGraph: makeGraph('#ff0000', 'project B label'),
    });
    rerender();

    expect(result.current.nodes[0]?.position).toEqual({ x: 0, y: 50 });
    expect(result.current.nodes[0]?.dragging).toBeUndefined();
    expect(result.current.nodes[0]?.selected).toBe(false);
    expect((result.current.nodes[0]?.data as unknown as TestNodeData).node.color).toBe('#ff0000');
    expect(result.current.edges[0]?.label).toBe('project B label');
  });

  it('reads the project at invocation time for cached graph commands', () => {
    const { result, rerender } = renderHook(() => useProjectGraph());
    const cachedAddCommand = (result.current.nodes[0]?.data as unknown as TestNodeData)
      .onAddToSelection;

    useSelectionStore.setState({ currentProjectId: 'project-b' });
    useProjectDataMock.mockReturnValue({
      currentProjectId: 'project-b',
      projectGraph: makeGraph('#ff0000', 'first label'),
    });
    rerender();

    act(() => {
      cachedAddCommand('node-1');
    });

    expect(requestNodeInputAddMock).toHaveBeenCalledWith(
      'project-b',
      expect.any(String),
      'node-1',
      undefined,
    );
  });

  it('adds a Data Block to the active tool on double-click, mirroring the + button', () => {
    const { result } = renderHook(() => useProjectGraph());
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 320,
      clientY: 180,
    };

    act(() => {
      result.current.handleNodeDoubleClick(
        event as unknown as Parameters<typeof result.current.handleNodeDoubleClick>[0],
        { id: 'node-1' } as unknown as Parameters<typeof result.current.handleNodeDoubleClick>[1],
      );
    });

    // Same add path as the node's "+" button (add-to-selection intent), not a
    // selection toggle — works whether or not the block is selected.
    expect(requestNodeInputAddMock).toHaveBeenCalledWith(
      'project-a',
      expect.any(String),
      'node-1',
      { x: 320, y: 180 },
    );
  });
});
