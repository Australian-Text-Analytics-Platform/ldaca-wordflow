import type { NodeTypes, ReactFlowProps } from '@xyflow/react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { ObjectRef } from '@/features/project/objects';
import '@xyflow/react/dist/style.css';

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import { CircleOff, Loader2, BoxSelect, Network, Minus, Plus, Scan, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GraphControlButton as ProjectGraphControlButton } from '@/components/GraphControlButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ProjectGraphModel {
  nodes: NonNullable<ReactFlowProps['nodes']>;
  edges: NonNullable<ReactFlowProps['edges']>;
  nodeTypes: NodeTypes;
  isGraphLoading: boolean;
  showEmptyState: boolean;
  selectedCount: number;
  totalNodes: number;
  canClearSelection: boolean;
  clearSelection?: () => void;
  connectionLineType?: ReactFlowProps['connectionLineType'];
  defaultEdgeOptions?: ReactFlowProps['defaultEdgeOptions'];
  handleNodesChange?: ReactFlowProps['onNodesChange'];
  handleEdgesChange?: ReactFlowProps['onEdgesChange'];
  handleNodeClick?: ReactFlowProps['onNodeClick'];
  handleNodeDoubleClick?: ReactFlowProps['onNodeDoubleClick'];
  handlePaneClick?: ReactFlowProps['onPaneClick'];
  handleInit?: ReactFlowProps['onInit'];
  defaultViewport?: ReactFlowProps['defaultViewport'];
  handleMoveEnd?: ReactFlowProps['onMoveEnd'];
  handleEdgeClick?: ReactFlowProps['onEdgeClick'];
  handleReconnect?: ReactFlowProps['onReconnect'];
  handleReconnectStart?: ReactFlowProps['onReconnectStart'];
  handleReconnectEnd?: ReactFlowProps['onReconnectEnd'];
  isValidConnection?: ReactFlowProps['isValidConnection'];
  pickingConnection?: boolean;
  handleSelectionChange?: ReactFlowProps['onSelectionChange'];
}

/** Compact selection summary with the full count available on hover and focus. */
const GraphSelectionControl = ({ selected, total }: { selected: number; total: number }) => (
  <Tooltip delayDuration={0} disableHoverableContent>
    <TooltipTrigger asChild>
      <div
        role="status"
        tabIndex={0}
        aria-label={`${String(selected)} of ${String(total)} selected`}
        className="flex h-10 w-10 min-w-10 items-center justify-center overflow-hidden px-1 text-label-secondary font-semibold text-foreground tabular-nums"
      >
        <span className="truncate">
          {selected}/{total}
        </span>
      </div>
    </TooltipTrigger>
    <TooltipContent side="right">
      {selected} of {total} selected
    </TooltipContent>
  </Tooltip>
);

interface ProjectGraphControlsProps {
  selected: number;
  total: number;
  canClearSelection: boolean;
  boxSelection: boolean;
  onClearSelection: () => void;
  onToggleBoxSelection: () => void;
  deleteControl: ReactNode;
  dependencies?: boolean;
  onToggleDependencies?: () => void;
}

/**
 * Upper-left graph rail containing viewport, box selection, and destructive actions.
 * Calls React Flow's viewport APIs through fixed-size controls with hover and focus tooltips.
 */
function ProjectGraphControls({
  selected,
  total,
  canClearSelection,
  boxSelection,
  onClearSelection,
  onToggleBoxSelection,
  deleteControl,
  dependencies,
  onToggleDependencies,
}: ProjectGraphControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const minZoomReached = useStore((state) => state.transform[2] <= state.minZoom);
  const maxZoomReached = useStore((state) => state.transform[2] >= state.maxZoom);

  return (
    <Controls
      orientation="vertical"
      position="top-left"
      showZoom={false}
      showFitView={false}
      showInteractive={false}
      className="overflow-hidden rounded-md border border-surface-border bg-editor"
      style={{ zIndex: 20 }}
      aria-label="Project graph controls"
    >
      <GraphSelectionControl selected={selected} total={total} />
      <ProjectGraphControlButton
        accessibleLabel="Zoom in"
        label="Zoom in"
        disabled={maxZoomReached}
        onClick={() => {
          void zoomIn();
        }}
      >
        <Plus aria-hidden="true" />
      </ProjectGraphControlButton>
      <ProjectGraphControlButton
        accessibleLabel="Zoom out"
        label="Zoom out"
        disabled={minZoomReached}
        onClick={() => {
          void zoomOut();
        }}
      >
        <Minus aria-hidden="true" />
      </ProjectGraphControlButton>
      <ProjectGraphControlButton
        accessibleLabel="Fit view"
        label="Fit view"
        onClick={() => {
          void fitView({ padding: 0.2, includeHiddenNodes: false, minZoom: 0.35 });
        }}
      >
        <Scan aria-hidden="true" />
      </ProjectGraphControlButton>
      <ProjectGraphControlButton
        accessibleLabel={boxSelection ? 'Use pan mode' : 'Use box selection'}
        label="Box selection"
        active={boxSelection}
        onClick={onToggleBoxSelection}
      >
        <BoxSelect aria-hidden="true" />
      </ProjectGraphControlButton>
      {onToggleDependencies && (
        <ProjectGraphControlButton
          accessibleLabel="Show Dependencies"
          label="Show Dependencies"
          active={dependencies ?? false}
          onClick={onToggleDependencies}
        >
          <Network aria-hidden="true" />
        </ProjectGraphControlButton>
      )}
      <ProjectGraphControlButton
        accessibleLabel="Clear selection"
        label="Clear selection"
        disabled={!canClearSelection}
        onClick={onClearSelection}
      >
        <CircleOff aria-hidden="true" />
      </ProjectGraphControlButton>
      {deleteControl}
    </Controls>
  );
}

/**
 * Placeholder shown while the project graph query is loading.
 * Rendered within `ProjectGraph` because graph loading needs a canvas-shaped skeleton.
 * Flow: render graph-card skeleton blocks first, then show a spinner label so the loading state preserves the canvas footprint.
 */
const GraphLoadingState = () => (
  <div className="flex h-full items-center justify-center bg-panel/20">
    <div className="flex flex-col items-center gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 w-36 rounded-lg" />
        <Skeleton className="h-24 w-36 rounded-lg" />
        <Skeleton className="h-24 w-24 rounded-lg" />
        <Skeleton className="h-24 w-48 rounded-lg" />
      </div>
      <div className="flex items-center gap-2 text-body text-description">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading project graph…</span>
      </div>
    </div>
  </div>
);

/**
 * Empty state shown before a project graph is available.
 * Rendered within `ProjectGraph` because the graph feature needs an idle state before project data exists.
 * Flow: render a centered title and Data Loader prompt directly on the graph surface when no project graph can be displayed.
 */
const GraphEmptyState = () => (
  <div className="flex h-full items-center justify-center p-6 text-center">
    <div>
      <h3 className="text-body font-semibold text-foreground">No project loaded</h3>
      <p className="mt-1 text-label-secondary text-description">
        Open or create a project in Data Loader to see the graph.
      </p>
    </div>
  </div>
);

/**
 * Renders the interactive project graph and its React Flow controls.
 * Rendered by `ProjectGraph`, which supplies its React Flow model.
 * Flow: read the graph view model, branch to loading or empty fallback states, then wire nodes, edges, handlers, controls, and optional minimap into React Flow.
 */
export function ProjectGraphView({
  graph,
  fallback,
  nodes,
  selectedNodeIds,
  deleteNodes,
  dependencies,
  onToggleDependencies,
  loading,
  error,
  retry,
  children,
}: {
  children?: ReactNode;
  dependencies?: boolean;
  onToggleDependencies?: () => void;
  loading?: boolean;
  error?: Error | null;
  retry?: () => void;
  graph: ProjectGraphModel;
  fallback?: ReactNode;
  nodes: { id: string; name: string; target: ObjectRef }[];
  selectedNodeIds: string[];
  deleteNodes: (ids: ObjectRef[]) => void;
}) {
  const [boxSelection, setBoxSelection] = useState(false);
  const [moveModifier, setMoveModifier] = useState(false);
  useEffect(() => {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    const update = (event: KeyboardEvent) => {
      const modifier = mac ? 'Meta' : 'Control';
      setMoveModifier(
        event.key === modifier ? event.type === 'keydown' : mac ? event.metaKey : event.ctrlKey,
      );
    };
    const reset = () => setMoveModifier(false);
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', update);
      window.removeEventListener('blur', reset);
    };
  }, []);
  if (graph.isGraphLoading) {
    return <GraphLoadingState />;
  }

  if (graph.showEmptyState) {
    return <>{fallback ?? <GraphEmptyState />}</>;
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={graph.nodeTypes}
        onNodesChange={graph.handleNodesChange}
        onEdgesChange={graph.handleEdgesChange}
        onNodeClick={boxSelection && !graph.pickingConnection ? undefined : graph.handleNodeClick}
        onNodeDoubleClick={graph.handleNodeDoubleClick}
        onPaneClick={graph.handlePaneClick}
        connectionLineType={graph.connectionLineType}
        defaultEdgeOptions={graph.defaultEdgeOptions}
        onInit={graph.handleInit}
        onMoveEnd={graph.handleMoveEnd}
        attributionPosition="bottom-left"
        className="bg-editor text-editor-foreground"
        style={{ width: '100%', height: '100%' }}
        defaultViewport={graph.defaultViewport ?? { x: 0, y: 0, zoom: 1 }}
        minZoom={0.05}
        maxZoom={4}
        connectOnClick={false}
        nodesDraggable={!graph.pickingConnection && moveModifier}
        zoomOnDoubleClick={false}
        nodesConnectable={graph.pickingConnection}
        connectionDragThreshold={0}
        selectionOnDrag={boxSelection}
        panOnDrag={boxSelection ? [1, 2] : true}
        onSelectionChange={boxSelection ? graph.handleSelectionChange : undefined}
        elementsSelectable
        deleteKeyCode={null}
        onEdgeClick={graph.handleEdgeClick}
        onReconnect={graph.handleReconnect}
        onReconnectStart={graph.handleReconnectStart}
        onReconnectEnd={graph.handleReconnectEnd}
        isValidConnection={graph.isValidConnection}
      >
        {children}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--vscode-charts-lines)"
        />
        <ProjectGraphControls
          dependencies={dependencies}
          onToggleDependencies={onToggleDependencies}
          deleteControl={
            <ProjectGraphControlButton
              accessibleLabel={`Delete (${String(selectedNodeIds.length)})`}
              label="Delete selection"
              disabled={!selectedNodeIds.length}
              destructive
              onClick={() =>
                deleteNodes(
                  nodes
                    .filter((node) => selectedNodeIds.includes(node.id))
                    .map((node) => node.target),
                )
              }
            >
              <Trash2 aria-hidden="true" />
            </ProjectGraphControlButton>
          }
          selected={graph.selectedCount}
          total={graph.totalNodes}
          canClearSelection={graph.canClearSelection}
          boxSelection={boxSelection}
          onClearSelection={() => graph.clearSelection?.()}
          onToggleBoxSelection={() => {
            setBoxSelection((value) => !value);
          }}
        />
      </ReactFlow>
      {(loading === true || error != null) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            role="status"
            className="pointer-events-auto rounded-md border border-surface-border bg-editor p-4 text-body"
          >
            {loading ? (
              'Loading graph…'
            ) : (
              <>
                <p>{error?.message}</p>
                <Button variant="outline" onClick={retry}>
                  Retry graph
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
