import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';

import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import {
  CircleOff,
  Hand,
  Loader2,
  Minus,
  Plus,
  Scan,
  SquareDashedMousePointer,
  Trash2,
} from 'lucide-react';

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
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import { useWorkspaceData } from '@/features/workspace/common/hooks/useWorkspaceData';
import { useWorkspaceSelection } from '@/features/workspace/common/hooks/useWorkspaceSelection';
import { CHART_ZOOM_KEY } from '@/lib/chartZoom';
import { cn } from '@/lib/utils';

import { useWorkspaceGraph, type WorkspaceGraphViewModel } from '../hooks/useWorkspaceGraph';
import { COMPACT_NODE_ZOOM_THRESHOLD } from '../services/graphLayout';
import { anchoredGraphViewport, fitGraphViewport } from '../services/graphViewport';

export interface WorkspaceGraphFeatureProps {
  fallback?: ReactNode;
}

/** What dragging the empty canvas does (issue 194). */
type GraphDragMode = 'pan' | 'select';

interface WorkspaceGraphControlButtonProps {
  accessibleLabel: string;
  label: string;
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
  destructive?: boolean;
  onClick: () => void;
}

// Names appear only after a deliberate hover, so moving across the rail on
// the way to a node changes nothing on screen (issue 195).
const RAIL_TOOLTIP_DELAY_MS = 500;

/**
 * Icon-only action in the Project Graph control rail.
 * Flow: the rail never widens; the label shows in a tooltip beside the button
 * after a short hover, including for disabled buttons, whose wrapper catches
 * the pointer.
 */
function WorkspaceGraphControlButton({
  accessibleLabel,
  label,
  children,
  disabled,
  active,
  destructive,
  onClick,
}: WorkspaceGraphControlButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block">
          <ControlButton
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={accessibleLabel}
            className={cn(
              '!h-10 !w-10 !justify-center !p-0',
              'disabled:!pointer-events-none disabled:!bg-editor disabled:!text-[var(--vscode-icon-foreground)] disabled:!opacity-40',
              active && '!bg-list-active !text-[var(--vscode-list-activeSelectionForeground)]',
              destructive && !disabled && '!text-error hover:!bg-error/10',
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:!size-4 [&_svg]:!max-h-none [&_svg]:!max-w-none [&_svg]:!fill-none">
              {children}
            </span>
          </ControlButton>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Selection summary at the start of the graph control rail.
 * Flow: show the compact selected/total value; the full wording is in its
 * accessible label and hover tooltip.
 */
const GraphSelectionControl = ({ selected, total }: { selected: number; total: number }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <div
        role="status"
        aria-label={`${String(selected)} of ${String(total)} selected`}
        className="flex h-10 w-10 items-center justify-center text-label-secondary font-semibold text-foreground tabular-nums"
      >
        {selected}/{total}
      </div>
    </TooltipTrigger>
    <TooltipContent side="right">
      {selected} of {total} Data Blocks selected
    </TooltipContent>
  </Tooltip>
);

/**
 * Batch-delete action and confirmation owned by the graph where selection is made.
 * Flow: resolve the selected Data Blocks, confirm their names, settle every deletion, then clear graph selection.
 */
function WorkspaceGraphDeleteControl() {
  const { workspaceGraph } = useWorkspaceData();
  const { deleteNode, clearSelection } = useWorkspaceActions();
  const { selectedNodeIds } = useWorkspaceSelection();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Blocks unticked in the confirmation keep their selection (issue 204).
  const [keptIds, setKeptIds] = useState<ReadonlySet<string>>(() => new Set());
  const selectedCount = selectedNodeIds.length;
  const canDelete = selectedCount > 0;

  const selectedForDelete = (() => {
    if (!workspaceGraph || !canDelete) return [];
    const selectedIds = new Set(selectedNodeIds);
    return workspaceGraph.nodes
      .filter((node) => selectedIds.has(node.id))
      .map((node) => ({
        id: node.id,
        name: typeof node.name === 'string' && node.name.trim() ? node.name : node.id,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  })();
  const toDelete = selectedForDelete.filter((item) => !keptIds.has(item.id));

  const handleDelete = async () => {
    if (toDelete.length === 0 || isDeleting) return;
    setIsDeleting(true);
    try {
      await Promise.allSettled(toDelete.map((item) => deleteNode(item.id)));
      // Deleted blocks leave the selection as they go; blocks the user
      // unticked stay selected.
      if (keptIds.size === 0) clearSelection();
      setConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <WorkspaceGraphControlButton
        accessibleLabel={`Delete (${String(selectedCount)})`}
        label={`Delete (${String(selectedCount)})`}
        disabled={!canDelete || isDeleting}
        destructive
        onClick={() => {
          setKeptIds(new Set());
          setConfirmOpen(true);
        }}
      >
        <Trash2 aria-hidden="true" />
      </WorkspaceGraphControlButton>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {toDelete.length} Data Block
              {toDelete.length === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The ticked Data Blocks will be removed, and analysis tabs that
              use them close with their results. Untick any you want to keep; they stay selected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul
            aria-label="Data Blocks to delete"
            className="max-h-60 space-y-1 overflow-y-auto rounded-sm border bg-panel/40 p-2 text-body"
          >
            {selectedForDelete.map((item) => {
              const checkboxId = `delete-data-block-${item.id}`;
              return (
                <li key={item.id}>
                  <label htmlFor={checkboxId} className="flex items-center gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={!keptIds.has(item.id)}
                      disabled={isDeleting}
                      onCheckedChange={(value) => {
                        setKeptIds((current) => {
                          const next = new Set(current);
                          if (value === true) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      }}
                    />
                    <span
                      className={cn(
                        'min-w-0 break-all',
                        keptIds.has(item.id) && 'text-description',
                      )}
                    >
                      {item.name}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button asChild variant="destructive" disabled={isDeleting || toDelete.length === 0}>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void handleDelete();
                }}
                disabled={isDeleting || toDelete.length === 0}
              >
                {isDeleting ? 'Deleting…' : `Delete ${String(toDelete.length)}`}
              </AlertDialogAction>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface WorkspaceGraphControlsProps {
  layouts: WorkspaceGraphViewModel['layouts'];
  compactLayout: boolean;
  onCompactLayoutChange: (compact: boolean) => void;
  layoutKey: string | null;
  selected: number;
  total: number;
  canClearSelection: boolean;
  dragMode: GraphDragMode;
  onClearSelection: () => void;
  onToggleDragMode: () => void;
}

/**
 * Upper-left graph rail containing viewport, drag-mode, selection, and destructive actions.
 * Flow: call React Flow's viewport APIs through explicit expandable controls so every icon and label shares one layout.
 */
/**
 * Keeps the graph readable when zoomed out (issue 345): below the compact-card
 * zoom the nodes use the compact layout, with the Data Block nearest the
 * centre held in place across the switch, and Fit view (also the first view
 * of a Project) picks the layout and never zooms out past FIT_MIN_ZOOM.
 */
function useGraphViewport({
  layouts,
  compactLayout,
  onCompactLayoutChange,
  layoutKey,
}: Pick<
  WorkspaceGraphControlsProps,
  'layouts' | 'compactLayout' | 'onCompactLayoutChange' | 'layoutKey'
>) {
  const { setViewport, getViewport } = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);
  const paneWidth = useStore((state) => state.width);
  const paneHeight = useStore((state) => state.height);
  const domNode = useStore((state) => state.domNode);
  const wantsCompact = zoom < COMPACT_NODE_ZOOM_THRESHOLD;
  // Set when Fit view itself moves across the threshold: its viewport is
  // already computed for the new layout, so it must not be re-anchored.
  const fitSwitchRef = useRef(false);

  const pane = useCallback(
    () => ({
      // The store size can stay 0 where ResizeObserver lags (issue 337).
      width: paneWidth > 0 ? paneWidth : (domNode?.clientWidth ?? 0),
      height: paneHeight > 0 ? paneHeight : (domNode?.clientHeight ?? 0),
    }),
    [domNode, paneHeight, paneWidth],
  );

  const fitGraph = useCallback(() => {
    if (!layouts) return;
    const fit = fitGraphViewport(layouts, pane());
    if (!fit) return;
    fitSwitchRef.current = fit.compact !== wantsCompact;
    void setViewport(fit.viewport);
    onCompactLayoutChange(fit.compact);
  }, [layouts, onCompactLayoutChange, pane, setViewport, wantsCompact]);

  useEffect(() => {
    if (wantsCompact === compactLayout) return;
    if (fitSwitchRef.current) {
      fitSwitchRef.current = false;
    } else if (layouts) {
      const [from, to] = wantsCompact
        ? [layouts.full, layouts.compact]
        : [layouts.compact, layouts.full];
      void setViewport(anchoredGraphViewport(getViewport(), pane(), from, to));
    }
    onCompactLayoutChange(wantsCompact);
  }, [compactLayout, getViewport, layouts, onCompactLayoutChange, pane, setViewport, wantsCompact]);

  const fittedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!layoutKey || !layouts || fittedKeyRef.current === layoutKey) return;
    if (pane().width <= 0) return;
    fittedKeyRef.current = layoutKey;
    fitGraph();
  }, [fitGraph, layoutKey, layouts, pane]);

  return fitGraph;
}

function WorkspaceGraphControls({
  layouts,
  compactLayout,
  onCompactLayoutChange,
  layoutKey,
  selected,
  total,
  canClearSelection,
  dragMode,
  onClearSelection,
  onToggleDragMode,
}: WorkspaceGraphControlsProps) {
  const { zoomIn, zoomOut } = useReactFlow();
  const fitGraph = useGraphViewport({ layouts, compactLayout, onCompactLayoutChange, layoutKey });
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
      <TooltipProvider
        delayDuration={RAIL_TOOLTIP_DELAY_MS}
        skipDelayDuration={300}
        disableHoverableContent
      >
        <GraphSelectionControl selected={selected} total={total} />
        <WorkspaceGraphControlButton
          accessibleLabel="Zoom in"
          label="Zoom in"
          disabled={maxZoomReached}
          onClick={() => {
            void zoomIn();
          }}
        >
          <Plus aria-hidden="true" />
        </WorkspaceGraphControlButton>
        <WorkspaceGraphControlButton
          accessibleLabel="Zoom out"
          label="Zoom out"
          disabled={minZoomReached}
          onClick={() => {
            void zoomOut();
          }}
        >
          <Minus aria-hidden="true" />
        </WorkspaceGraphControlButton>
        <WorkspaceGraphControlButton accessibleLabel="Fit view" label="Fit view" onClick={fitGraph}>
          <Scan aria-hidden="true" />
        </WorkspaceGraphControlButton>
        <WorkspaceGraphControlButton
          accessibleLabel={
            dragMode === 'pan'
              ? 'Drag to pan. Switch to drag to select'
              : 'Drag to select. Switch to drag to pan'
          }
          label={dragMode === 'pan' ? 'Drag to pan' : 'Drag to select'}
          active={dragMode === 'select'}
          onClick={onToggleDragMode}
        >
          {dragMode === 'pan' ? (
            <Hand aria-hidden="true" />
          ) : (
            <SquareDashedMousePointer aria-hidden="true" />
          )}
        </WorkspaceGraphControlButton>
        <WorkspaceGraphControlButton
          accessibleLabel="Clear selection"
          label="Clear selection"
          disabled={!canClearSelection}
          onClick={onClearSelection}
        >
          <CircleOff aria-hidden="true" />
        </WorkspaceGraphControlButton>
        <WorkspaceGraphDeleteControl />
      </TooltipProvider>
    </Controls>
  );
}

/**
 * Placeholder shown while the workspace graph query is loading.
 * Rendered within `WorkspaceGraphFeature` because graph loading needs a canvas-shaped skeleton.
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
        <span>Loading Project graph…</span>
      </div>
    </div>
  </div>
);

/**
 * Empty state shown before a workspace graph is available.
 * Rendered within `WorkspaceGraphFeature` because the graph feature needs an idle state before workspace data exists.
 * Flow: render a centered title and Data Loader prompt directly on the graph surface when no workspace graph can be displayed.
 */
const GraphEmptyState = () => (
  <div className="flex h-full items-center justify-center p-6 text-center">
    <div>
      <h3 className="text-body font-semibold text-foreground">No Project open</h3>
      <p className="mt-1 text-label-secondary text-description">
        Open or create a Project in Data Loader to see the graph.
      </p>
    </div>
  </div>
);

/**
 * Renders the interactive workspace graph and its React Flow controls.
 * Rendered by `WorkspaceView`; `useWorkspaceGraph` supplies its React Flow model.
 * Flow: read the graph view model, branch to loading or empty fallback states, then wire nodes, edges, handlers, controls, and optional minimap into React Flow.
 */
export function WorkspaceGraphFeature({ fallback }: WorkspaceGraphFeatureProps) {
  const [dragMode, setDragMode] = useState<GraphDragMode>('pan');
  const graph = useWorkspaceGraph();

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
        onSelectionStart={graph.handleSelectionStart}
        onSelectionEnd={graph.handleSelectionEnd}
        // A right-button drag pans in Select mode; keep the browser menu away.
        onPaneContextMenu={
          dragMode === 'select'
            ? (event) => {
                event.preventDefault();
              }
            : undefined
        }
        connectionLineType={graph.connectionLineType}
        defaultEdgeOptions={graph.defaultEdgeOptions}
        attributionPosition="bottom-left"
        // Blocks join the app selection when the box is released, so React
        // Flow's group-drag rectangle would only block clicks on them.
        className="bg-editor text-editor-foreground [&_.react-flow\_\_nodesselection]:hidden"
        style={{ width: '100%', height: '100%' }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.05}
        maxZoom={4}
        // Pan mode drags the view (Shift + drag draws a box); Select mode
        // draws a box and pans with the right or middle button. Scrolling pans
        // in both, and pinch or Ctrl/Cmd + scroll zooms (issue 194).
        panOnDrag={dragMode === 'pan' ? true : [1, 2]}
        selectionOnDrag={dragMode === 'select'}
        selectionMode={SelectionMode.Partial}
        panOnScroll
        zoomActivationKeyCode={CHART_ZOOM_KEY}
        connectOnClick={false}
        // Data Blocks stay where the layout puts them: a block dragged far
        // away shrank the whole graph on Fit view and was hard to bring back,
        // and its edges grew long (Monika, via Chao, 2026-10-09).
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onConnect={graph.handleConnect}
        onConnectStart={graph.handleConnectStart}
        onConnectEnd={graph.handleConnectEnd}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--vscode-charts-lines)"
        />
        <WorkspaceGraphControls
          layouts={graph.layouts}
          compactLayout={graph.compactLayout}
          onCompactLayoutChange={graph.setCompactLayout}
          layoutKey={graph.layoutKey}
          selected={graph.selectedCount}
          total={graph.totalNodes}
          canClearSelection={graph.canClearSelection}
          dragMode={dragMode}
          onClearSelection={() => graph.clearSelection?.()}
          onToggleDragMode={() => {
            setDragMode((mode) => (mode === 'pan' ? 'select' : 'pan'));
          }}
        />
      </ReactFlow>
    </div>
  );
}
