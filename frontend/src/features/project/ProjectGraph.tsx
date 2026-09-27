import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ConnectionLineType,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type ReactFlowInstance,
  type NodeProps,
} from '@xyflow/react';
import type { NodeInputPointerPosition } from '@/stores/nodeInputRequestsStore';
import {
  CustomNodeView,
  type CustomNodeData,
} from '@/features/project/graph-view/components/CustomNodeView';
import { GraphConnectionPreview } from './GraphConnectionPreview';
import { ProjectGraphView } from '@/features/project/graph-view/components/ProjectGraphView';
import { computeDagreLayout } from '@/features/project/graph-view/services/graphLayout';
import { reportProjectError } from './projectErrors';
import { useGraphState, type GraphMode } from './graphState';
import * as api from './api';

function layoutTopology(topology: string) {
  const { nodes, edges } = JSON.parse(topology) as {
    nodes: { id: string }[];
    edges: { source: string; target: string }[];
  };
  return computeDagreLayout(nodes, edges, { rankdir: 'TB', ranksep: 140, nodesep: 100 });
}
type NativeNodeData = CustomNodeData & {
  base: string;
  target?: api.ObjectRef;
  diagnostic?: string;
};
function NativeNode(props: NodeProps<Node<NativeNodeData>>) {
  return (
    <CustomNodeView
      {...props}
      diagnostic={props.data.diagnostic}
      onExport={(format) => api.exportNode(props.data.base, props.data.target ?? props.id, format)}
      onError={reportProjectError}
    />
  );
}
const nodeTypes = { customNode: NativeNode };
type ConnectionPick =
  | { kind: 'parent' | 'child'; anchor: string }
  | { kind: 'replace'; anchor: string; source: string; gesture: 'click' | 'drag' };
export default function ProjectGraph({
  graph,
  mode = 'logical',
  onToggleDependencies,
  loading = false,
  error,
  retry,
  base,
  selected,
  onSelect,
  onPreview,
  previewed,
  onAddToSelection,
  onClear,
  onDelete,
  onDeleteMany,
  onRename,
  onClone,
  onUndo,
  onMaterialize,
  onEditSql,
  onEditTable,
  onLogicalLink,
  onReplaceSource,
}: {
  graph: api.Graph;
  mode?: GraphMode;
  onToggleDependencies?: () => void;
  loading?: boolean;
  error?: Error | null;
  retry?: () => void;
  base: string;
  selected: string[];
  onSelect: (id: string) => void;
  onPreview: (id: string) => void;
  previewed: string | null;
  onAddToSelection?: (id: string, pointer?: NodeInputPointerPosition) => void;
  onClear: () => void;
  onDelete: (id: string) => Promise<unknown>;
  onDeleteMany: (ids: string[]) => Promise<boolean>;
  onRename: (id: string, name: string) => void;
  onClone: (id: string) => void;
  onUndo: (id: string) => void;
  onMaterialize: (id: string) => void;
  onEditSql: (id: string) => void;
  onEditTable?: (id: string) => void;
  onLogicalLink?: (source: string, target: string) => void;
  onReplaceSource?: (
    child: api.ObjectRef,
    source: api.ObjectRef,
    replacement: api.ObjectRef,
  ) => void;
}) {
  const flow = useRef<ReactFlowInstance | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [connection, setConnection] = useState<ConnectionPick | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const anchor = graph.nodes.find((node) => node.table_name === connection?.anchor);
  const picking = anchor ? connection : null;
  if (connection && !anchor) setConnection(null);
  const object = (id: string) => {
    const node = graph.nodes.find((node) => node.table_name === id);
    return node ? api.objectRef(node.object ?? node.table_name) : null;
  };
  const cancelConnection = () => {
    setConnection(null);
    container.current?.focus();
  };
  useEffect(() => {
    if (!connection) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConnection(null);
        container.current?.focus();
      }
    };
    window.addEventListener('keydown', cancel);
    return () => {
      window.removeEventListener('keydown', cancel);
    };
  }, [connection]);
  const startConnection = (next: ConnectionPick) => {
    setConnection(next);
    container.current?.focus();
  };
  const chooseNode = (id: string) => {
    if (!picking || picking.anchor === id || !object(id)) return;
    if (picking.kind === 'replace') {
      const child = object(picking.anchor);
      const source = object(picking.source);
      const replacement = object(id);
      if (child && source && replacement && id !== picking.source)
        onReplaceSource?.(child, source, replacement);
    } else if (picking.kind === 'parent') {
      onLogicalLink?.(id, picking.anchor);
    } else {
      onLogicalLink?.(picking.anchor, id);
    }
    cancelConnection();
  };
  // React Flow retains the reconnect callback from pointer-down until pointer-up.
  // Read the latest picker so Escape and catalogue changes cancel that retained callback.
  const finishReconnect = useRef(chooseNode);
  useLayoutEffect(() => {
    finishReconnect.current = chooseNode;
  });
  const canvas = useGraphState((s) => s[mode]);
  const fitted = useRef(!!canvas.viewport);
  useEffect(() => {
    if (!graph.nodes.length || fitted.current || !flow.current) return;
    const frame = requestAnimationFrame(() => {
      void flow.current?.fitView({ padding: 0.2 });
      fitted.current = true;
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [graph.nodes.length]);
  const views = canvas.nodes;
  const topology = JSON.stringify({
    nodes: graph.nodes.map((n) => ({ id: n.table_name })),
    edges: graph.edges.map((e) => ({ source: e.source_name, target: e.target_name })),
  });
  // React Compiler caches this pure computation by topology, not selection or metadata.
  const layout = layoutTopology(topology);
  const nodes: Node<NativeNodeData>[] = graph.nodes.map((n) => ({
    id: n.table_name,
    type: 'customNode',
    targetPosition: Position.Top,
    sourcePosition: Position.Bottom,
    position: views.get(n.table_name)?.position ?? layout.get(n.table_name) ?? { x: 0, y: 0 },
    selected: selected.includes(n.table_name),
    connectable: false,
    measured: views.get(n.table_name)?.measured,
    data: {
      base,
      target: n.object,
      objectName: n.object?.name,
      databaseObject: mode === 'dependencies',
      detail: n.object
        ? `${n.object.schema} · ${n.registered ? (n.visible ? 'Data Block' : 'Hidden backing object') : 'Unregistered'}`
        : undefined,
      diagnostic: n.diagnostic?.message,
      node: {
        id: n.table_name,
        name: n.label ?? n.table_name,
        color: n.color,
        columnCount: n.column_count,
        kind: n.kind,
        canUndo: n.can_undo,
      },
      onAddLogicalParent:
        mode === 'logical' && onLogicalLink
          ? (id) => {
              startConnection({ kind: 'parent', anchor: id });
            }
          : undefined,
      onAddLogicalChild:
        mode === 'logical' && onLogicalLink
          ? (id) => {
              startConnection({ kind: 'child', anchor: id });
            }
          : undefined,
      onConnectionPick: picking ? chooseNode : undefined,
      connectionCandidate: !!picking && picking.anchor !== n.table_name,
      reconnectTarget:
        picking?.kind === 'replace' &&
        picking.gesture === 'drag' &&
        picking.anchor !== n.table_name,
      onDelete: (id) => {
        void onDelete(id);
      },
      onRename,
      onPreview,
      isPreviewed: previewed === n.table_name,
      onAddToSelection,
      onCopy: onClone,
      onUndo,
      onMaterialize: n.kind === 'view' ? onMaterialize : undefined,
      onEditSql: n.kind === 'view' ? onEditSql : undefined,
      onEditTable: n.kind === 'table' ? onEditTable : undefined,
    },
  }));
  const edges: Edge[] = graph.edges.map((e) => {
    const id = JSON.stringify([e.source_name, e.target_name]);
    const selected = selectedEdge === id;
    const stroke = selected
      ? 'var(--vscode-focusBorder)'
      : e.dependency
        ? 'var(--vscode-foreground)'
        : 'var(--vscode-descriptionForeground)';
    return {
      id,
      selected,
      reconnectable: e.dependency && onReplaceSource && selected ? 'source' : false,
      domAttributes:
        e.dependency && onReplaceSource
          ? {
              'aria-keyshortcuts': 'Enter',
              onFocus: () => {
                setSelectedEdge(id);
              },
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  startConnection({
                    kind: 'replace',
                    source: e.source_name,
                    anchor: e.target_name,
                    gesture: 'click',
                  });
                }
              },
            }
          : undefined,
      source: e.source_name,
      target: e.target_name,
      ariaLabel: e.dependency
        ? `${graph.nodes.find((n) => n.table_name === e.target_name)?.label ?? e.target_name} reads ${graph.nodes.find((n) => n.table_name === e.source_name)?.label ?? e.source_name}. SQL dependency.`
        : `Virtual link from ${e.source_name} to ${e.target_name}.`,
      markerEnd: {
        type: e.dependency ? MarkerType.ArrowClosed : MarkerType.Arrow,
        width: 18,
        height: 18,
        color: stroke,
      },
      style: {
        strokeDasharray: e.dependency ? undefined : '6 4',
        strokeWidth: selected ? 3 : e.dependency ? 2 : 1.5,
        stroke,
      },
    };
  });
  return (
    <div
      ref={container}
      tabIndex={-1}
      className="relative h-full min-h-0 data-[file-hover=true]:outline-2 data-[file-hover=true]:outline-focus data-[file-hover=true]:-outline-offset-2"
      data-project-file-drop="graph"
      aria-label="Data Block graph"
    >
      <ProjectGraphView
        nodes={graph.nodes.map((n) => ({ id: n.table_name, name: n.label ?? n.table_name }))}
        selectedNodeIds={selected}
        deleteNodes={onDeleteMany}
        dependencies={mode === 'dependencies'}
        onToggleDependencies={onToggleDependencies}
        loading={loading}
        error={error}
        retry={retry}
        graph={{
          nodes,
          edges,
          nodeTypes,
          isGraphLoading: false,
          showEmptyState: false,
          selectedCount: selected.length,
          totalNodes: nodes.length,
          canClearSelection: selected.length > 0,
          pickingConnection: !!picking,
          handlePaneClick: () => {
            cancelConnection();
            setSelectedEdge(null);
          },
          handleEdgeClick: (_event, edge) => {
            if (!picking) setSelectedEdge(edge.id);
          },
          handleReconnectStart: (_event, edge) => {
            startConnection({
              kind: 'replace',
              anchor: edge.target,
              source: edge.source,
              gesture: 'drag',
            });
          },
          handleReconnect: (_edge, next) => {
            if (next.source) finishReconnect.current(next.source);
          },
          handleReconnectEnd: () => {
            setConnection(null);
          },
          isValidConnection: (next) =>
            !!picking &&
            next.target === picking.anchor &&
            next.source !== picking.anchor &&
            !!graph.nodes.find((node) => node.table_name === next.source),
          handleNodeClick: (event, node) => {
            event.preventDefault();
            event.stopPropagation();
            if (picking) chooseNode(node.id);
            else {
              setSelectedEdge(null);
              onSelect(node.id);
            }
          },
          handleNodeDoubleClick: (event, node) => {
            event.preventDefault();
            event.stopPropagation();
            if (!picking) onAddToSelection?.(node.id, { x: event.clientX, y: event.clientY });
          },
          handleNodesChange: (changes) => {
            useGraphState.setState((state) => {
              if (
                !changes.some(
                  (change) => change.type === 'position' || change.type === 'dimensions',
                )
              )
                return state;
              const nodes = new Map(state[mode].nodes);
              for (const change of changes)
                if (change.type === 'position' && change.position) {
                  nodes.set(change.id, {
                    ...(nodes.get(change.id) ?? {}),
                    position: change.position,
                  });
                } else if (change.type === 'dimensions' && change.dimensions) {
                  nodes.set(change.id, {
                    ...(nodes.get(change.id) ?? {}),
                    measured: change.dimensions,
                  });
                }
              return { [mode]: { ...state[mode], nodes } };
            });
          },
          defaultViewport: canvas.viewport,
          handleMoveEnd: (_event, viewport) => {
            useGraphState.setState((state) => ({ [mode]: { ...state[mode], viewport } }));
          },
          handleInit: (instance) => {
            flow.current = instance;
            if (nodes.length && !fitted.current) {
              void instance.fitView({ padding: 0.2 });
              fitted.current = true;
            }
          },
          clearSelection: onClear,
          connectionLineType: ConnectionLineType.Bezier,
          defaultEdgeOptions: {
            type: 'default',
            animated: false,
          },
        }}
      >
        {picking && !(picking.kind === 'replace' && picking.gesture === 'drag') && (
          <GraphConnectionPreview anchor={picking.anchor} outgoing={picking.kind === 'child'} />
        )}
      </ProjectGraphView>
      {!picking && edges.some((edge) => edge.selected && edge.reconnectable) && (
        <p
          role="status"
          className="pointer-events-none absolute top-3 right-3 left-14 z-10 rounded-md border border-surface-border bg-editor px-3 py-2 text-body"
        >
          Drag the edge near its source onto another card, or press Enter to choose a replacement
          source.
        </p>
      )}
      {picking && (
        <div className="absolute top-3 right-3 left-14 z-10 flex items-center gap-2 rounded-md border border-surface-border bg-editor px-3 py-2 text-body">
          <span role="status">
            {picking.kind === 'replace'
              ? 'Choose a replacement source'
              : `Choose a ${picking.kind}`}{' '}
            for {anchor?.label ?? anchor?.table_name}. Escape cancels.
          </span>
          <button type="button" onClick={cancelConnection} className="text-link hover:underline">
            Cancel
          </button>
        </div>
      )}
      {!nodes.length && !loading && !error && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-body text-description">
          {mode === 'dependencies'
            ? 'No data Tables or Views in this project.'
            : 'Drop a data file here to add it to your project.'}
        </p>
      )}
    </div>
  );
}
