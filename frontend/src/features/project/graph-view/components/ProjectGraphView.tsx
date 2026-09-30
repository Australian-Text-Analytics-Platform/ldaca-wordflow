import type { NodeTypes, ReactFlowProps } from '@xyflow/react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import '@xyflow/react/dist/style.css';

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import { CircleOff, Loader2, Map, Network, Minus, Plus, Scan, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

/**
 * Batch-delete action and confirmation owned by the graph where selection is made.
 * Flow: resolve the selected Data Blocks, confirm their names, delegate deletion and selection cleanup to the host.
 */
function ProjectGraphDeleteControl({
  nodes,
  selectedNodeIds,
  deleteNodes,
}: {
  nodes: { id: string; name: string }[];
  selectedNodeIds: string[];
  deleteNodes: (ids: string[]) => Promise<boolean>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const selectedCount = selectedNodeIds.length;
  const canDelete = selectedCount > 0;

  const selectedForDelete = (() => {
    if (!canDelete) return [];
    const selectedIds = new Set(selectedNodeIds);
    return nodes
      .filter((node) => selectedIds.has(node.id))
      .map((node) => ({
        id: node.id,
        name: typeof node.name === 'string' && node.name.trim() ? node.name : node.id,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  })();

  const handleDelete = async () => {
    if (!canDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteNodes(selectedForDelete.map((item) => item.id));
      setConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <ProjectGraphControlButton
        accessibleLabel={`Delete (${String(selectedCount)})`}
        label={`Delete (${String(selectedCount)})`}
        disabled={!canDelete || isDeleting}
        destructive
        onClick={() => {
          setConfirmOpen(true);
        }}
      >
        <Trash2 aria-hidden="true" />
      </ProjectGraphControlButton>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedForDelete.length} data block
              {selectedForDelete.length === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The following data blocks will be removed:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-60 overflow-y-auto rounded-sm border bg-panel/40 p-2 text-body">
            {selectedForDelete.map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button asChild variant="destructive" disabled={isDeleting || !canDelete}>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void handleDelete();
                }}
                disabled={isDeleting || !canDelete}
              >
                {isDeleting ? 'Deleting…' : `Delete ${String(selectedForDelete.length)}`}
              </AlertDialogAction>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface ProjectGraphControlsProps {
  selected: number;
  total: number;
  canClearSelection: boolean;
  showOverview: boolean;
  onClearSelection: () => void;
  onToggleOverview: () => void;
  deleteControl: ReactNode;
  dependencies?: boolean;
  onToggleDependencies?: () => void;
}

/**
 * Upper-left graph rail containing viewport, overview, selection, and destructive actions.
 * Flow: call React Flow's viewport APIs through explicit expandable controls so every icon and label shares one layout.
 */
function ProjectGraphControls({
  selected,
  total,
  canClearSelection,
  showOverview,
  onClearSelection,
  onToggleOverview,
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
          void fitView({ padding: 0.2, includeHiddenNodes: false });
        }}
      >
        <Scan aria-hidden="true" />
      </ProjectGraphControlButton>
      <ProjectGraphControlButton
        accessibleLabel={showOverview ? 'Hide overview' : 'Show overview'}
        label="Overview"
        active={showOverview}
        onClick={onToggleOverview}
      >
        <Map aria-hidden="true" />
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
  nodes: { id: string; name: string }[];
  selectedNodeIds: string[];
  deleteNodes: (ids: string[]) => Promise<boolean>;
}) {
  const [showOverview, setShowOverview] = useState(false);
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
        onNodeClick={graph.handleNodeClick}
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
        nodesDraggable={!graph.pickingConnection}
        nodesConnectable={graph.pickingConnection}
        connectionDragThreshold={0}
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
            <ProjectGraphDeleteControl
              nodes={nodes}
              selectedNodeIds={selectedNodeIds}
              deleteNodes={deleteNodes}
            />
          }
          selected={graph.selectedCount}
          total={graph.totalNodes}
          canClearSelection={graph.canClearSelection}
          showOverview={showOverview}
          onClearSelection={() => graph.clearSelection?.()}
          onToggleOverview={() => {
            setShowOverview((value) => !value);
          }}
        />
        {showOverview && (
          <MiniMap
            position="bottom-right"
            nodeColor="var(--vscode-list-activeSelectionBackground)"
            maskColor="color-mix(in srgb, var(--vscode-editor-background) 80%, transparent)"
          />
        )}
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
