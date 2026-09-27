import type { DataBlockExportFormat } from '@/features/project/common/exportFormats';
import { useEffect, useReducer, useRef } from 'react';
import {
  type NodeProps,
  Handle,
  NodeToolbar,
  Position,
  useStore,
  type Node as ReactFlowNode,
} from '@xyflow/react';
import { Copy, Check, Eye, Plus } from 'lucide-react';
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
import type { ProjectGraphNodeCard } from '../graphNodeModel';
import { cn } from '@/lib/utils';
import { normalizeNodeColor, toNodeSurfaceColor } from '@/lib/nodeColor';
import { GREY } from '@/features/tools/common/vizPalette';
import { DataBlockName } from '@/components/DataBlockName';
import type { NodeInputPointerPosition } from '@/stores/nodeInputRequestsStore';
import { CUSTOM_NODE_TOOLBAR_BUTTON_CLASS, CustomNodeActionMenu } from './CustomNodeActionMenu';
import { DataBlockExportDialog } from '@/features/project/common/components/DataBlockExportDialog';
import { DataBlockRenameDialog } from '@/features/project/common/components/DataBlockRenameDialog';
import {
  releaseToolbarOwner,
  setActiveToolbarOwner,
  useCustomNodeToolbarOwner,
} from './customNodeToolbarOwner';

export interface CustomNodeData extends Record<string, unknown> {
  node: ProjectGraphNodeCard;
  databaseObject?: boolean;
  detail?: string;
  objectName?: string;
  onDelete: (nodeId: string) => void;
  onRename: (nodeId: string, newName: string) => void;
  onCopy: (nodeId: string) => void;
  onUndo: (nodeId: string) => void;
  onMaterialize?: (nodeId: string) => void;
  onEditSql?: (nodeId: string) => void;
  onEditTable?: (nodeId: string) => void;
  onAddLogicalParent?: (nodeId: string) => void;
  onAddLogicalChild?: (nodeId: string) => void;
  onConnectionPick?: (nodeId: string) => void;
  connectionCandidate?: boolean;
  reconnectTarget?: boolean;
  onPreview?: (nodeId: string) => void;
  isPreviewed?: boolean;
  /** Requests that this node is added to the active view's node inputs. */
  onAddToSelection?: (nodeId: string, pointer?: NodeInputPointerPosition) => void;
}

const COMPACT_NODE_ZOOM_THRESHOLD = 0.6;

interface CustomNodeUiState {
  showMenu: boolean;
  dialog: { kind: 'rename'; draft: string } | { kind: 'delete' | 'export' } | null;
  copied: boolean;
  isHovered: boolean;
  isFocused: boolean;
  isToolbarHovered: boolean;
}

type CustomNodeUiAction =
  | { type: 'set-menu'; showMenu: boolean }
  | { type: 'open-rename'; name: string }
  | { type: 'set-rename-value'; value: string }
  | { type: 'set-rename-open'; open: boolean }
  | { type: 'copy-id' }
  | { type: 'copy-id-reset' }
  | { type: 'set-focused'; focused: boolean }
  | { type: 'show-toolbar' }
  | { type: 'set-toolbar-hovered'; isToolbarHovered: boolean }
  | { type: 'hide-toolbar' }
  | { type: 'open-delete-confirm' }
  | { type: 'set-delete-confirm'; showDeleteConfirm: boolean }
  | { type: 'open-export-dialog' }
  | { type: 'set-export-dialog'; showExportDialog: boolean };

const initialCustomNodeUiState: CustomNodeUiState = {
  showMenu: false,
  dialog: null,
  copied: false,
  isHovered: false,
  isFocused: false,
  isToolbarHovered: false,
};

/**
 * Keeps CustomNode's transient interaction modes in one reducer.
 * Used by: CustomNode because menu, rename, copy feedback, hover toolbar, and
 * delete confirmation are mutually related UI modes for the same graph card.
 * Flow: menu actions can enter rename/delete, rename owns the draft name until
 * submit/cancel, hover actions reveal or hide the floating toolbar, and copy id
 * toggles short-lived feedback without affecting graph selection.
 */
function customNodeUiReducer(
  state: CustomNodeUiState,
  action: CustomNodeUiAction,
): CustomNodeUiState {
  switch (action.type) {
    case 'set-menu':
      return {
        ...state,
        showMenu: action.showMenu,
      };
    case 'open-rename':
      return {
        ...state,
        showMenu: false,
        dialog: { kind: 'rename', draft: action.name },
      };
    case 'set-rename-value':
      return state.dialog?.kind === 'rename'
        ? { ...state, dialog: { kind: 'rename', draft: action.value } }
        : state;
    case 'set-rename-open':
      return {
        ...state,
        dialog: action.open ? state.dialog : null,
      };
    case 'copy-id':
      return { ...state, copied: true };
    case 'copy-id-reset':
      return { ...state, copied: false };
    case 'set-focused':
      return { ...state, isFocused: action.focused };
    case 'show-toolbar':
      return { ...state, isHovered: true };
    case 'set-toolbar-hovered':
      return { ...state, isToolbarHovered: action.isToolbarHovered };
    case 'hide-toolbar':
      return { ...state, isHovered: false, isToolbarHovered: false };
    case 'open-delete-confirm':
      return { ...state, showMenu: false, dialog: { kind: 'delete' } };
    case 'set-delete-confirm':
      return { ...state, dialog: action.showDeleteConfirm ? { kind: 'delete' } : null };
    case 'open-export-dialog':
      return { ...state, showMenu: false, dialog: { kind: 'export' } };
    case 'set-export-dialog':
      return { ...state, dialog: action.showExportDialog ? { kind: 'export' } : null };
    default:
      return state;
  }
}

/**
 * React Flow node renderer for a project node. Shows a compact card when zoomed
 * out, and a full card with metadata + action menu when zoomed in.
 * Rendered within `CustomNode` because React Flow needs this custom node type for project data blocks.
 * Flow: React Flow passes node data, zoom and selection choose compact or full rendering, and actions invoke project mutations.
 */
export function CustomNodeView({
  id,
  data,
  selected,
  targetPosition = Position.Left,
  sourcePosition = Position.Right,
  onExport,
  onError,
  diagnostic,
}: NodeProps<ReactFlowNode<CustomNodeData>> & {
  diagnostic?: string;
  onExport: (format: DataBlockExportFormat) => Promise<string | null>;
  onError: (error: unknown) => void;
}) {
  const { node, onDelete, onRename, onCopy, onUndo, onAddToSelection } = data;

  // Selection and identity are deliberately independent: a tint of the
  // persisted Data Block colour fills the name surface, while React Flow
  // selection adds one detached, theme-inverse outline around the card.
  const isSelected = selected;
  const previewButton = useRef<HTMLButtonElement>(null);
  const [uiState, dispatchUi] = useReducer(customNodeUiReducer, initialCustomNodeUiState);
  const { showMenu, dialog, copied, isHovered, isFocused, isToolbarHovered } = uiState;

  const zoom = useStore((s) => s.transform[2]);
  const isZoomedOut = zoom < COMPACT_NODE_ZOOM_THRESHOLD;

  // Which node currently owns the visible hover toolbar (singleton across the
  // whole graph). When another node claims ownership, this re-renders and our
  // hover toolbar hides immediately.
  const activeToolbarId = useCustomNodeToolbarOwner();

  const nodeName = node.name;

  // Per-node colour. A valid ``#rrggbb`` ``Node.color`` is the block's identity
  // colour; unset / un-analysed blocks default to grey. Large identity surfaces
  // use a theme-aware tint while the exact colour remains available to compact
  // marks such as chart series and legends.
  const effectiveColor = normalizeNodeColor(node.color) ?? GREY;
  const identitySurfaceColor = toNodeSurfaceColor(effectiveColor);

  /** Shows this node's toolbar and claims singleton ownership so any other
   * node's hover toolbar hides at once. Called on node/toolbar mouse-enter. */
  const showToolbar = () => {
    dispatchUi({ type: 'show-toolbar' });
    setActiveToolbarOwner(id);
  };

  /** Hides this node's toolbar immediately and releases ownership. Called when
   * the pointer leaves the node or the toolbar. There is no node/toolbar gap to
   * bridge (the toolbar sits flush against the node), so the toolbar can vanish
   * at once with no grace period. */
  const hideToolbar = () => {
    dispatchUi({ type: 'hide-toolbar' });
    // Mouse clicks leave DOM focus behind; only keyboard focus keeps controls visible.
    if (!document.activeElement?.matches(':focus-visible')) {
      dispatchUi({ type: 'set-focused', focused: false });
      releaseToolbarOwner(id);
    } else if (!isFocused) releaseToolbarOwner(id);
  };

  useEffect(
    () => () => {
      releaseToolbarOwner(id);
    },
    [id],
  );

  /**
   * Opens delete confirmation without letting the graph select the node.
   */
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatchUi({ type: 'open-delete-confirm' });
  };

  /**
   * Confirms deletion through the graph action passed from useProjectGraph.
   */
  const handleDeleteConfirm = () => {
    if (node.id) {
      onDelete(node.id);
    }
    dispatchUi({ type: 'set-delete-confirm', showDeleteConfirm: false });
  };

  /**
   * Opens the shared Data Block rename dialog from the node settings menu.
   */
  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatchUi({ type: 'open-rename', name: data.objectName ?? node.name });
  };

  /**
   * Clones the node from the settings menu.
   */
  const handleCopyNode = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatchUi({ type: 'set-menu', showMenu: false });
    onCopy(node.id);
  };

  /** Opens single-Data-Block export from the settings menu. */
  const handleExportClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatchUi({ type: 'open-export-dialog' });
  };

  /** Undoes the Data Block's latest session edit from the settings menu. */
  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatchUi({ type: 'set-menu', showMenu: false });
    onUndo(node.id);
  };

  /**
   * Copies the node id for debugging and user support workflows.
   */
  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.id) {
      void navigator.clipboard.writeText(data.objectName ? node.name : node.id);
      dispatchUi({ type: 'copy-id' });
      setTimeout(() => {
        dispatchUi({ type: 'copy-id-reset' });
      }, 2000);
    }
  };

  // The settings menu remains mounted when the pointer leaves the node. Plain
  // hover visibility still belongs to the singleton owner so only one graph
  // toolbar can be visible at a time. Dialogs do not keep toolbar chrome alive
  // behind their modal overlays.
  const isToolbarVisible =
    !data.onConnectionPick &&
    (showMenu || ((isHovered || isToolbarHovered || isFocused) && activeToolbarId === id));

  // The detached outline is the sole persistent node-state decoration.
  const nodeClasses = cn(
    'w-80 rounded-md border border-surface-border bg-surface text-body',
    isSelected && 'outline outline-2 outline-offset-2 outline-data-block-selection',
    data.connectionCandidate && 'ring-2 ring-focus cursor-crosshair',
  );

  /**
   * Formats row/column counts for the node shape label.
   */

  /** Stops React Flow from treating side-control pointer events as node clicks/drags. */
  const stopGraphControlEvent = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  /**
   * Stops clicks from dialogs and other logical children rendered outside the
   * card DOM before they reach React Flow's node wrapper. Physical card clicks
   * keep bubbling so React Flow can preserve its normal node interactions.
   */
  const stopPortaledGraphEvent = (event: React.MouseEvent<HTMLDivElement>) => {
    const { target } = event;
    if (!(target instanceof globalThis.Node) || !event.currentTarget.contains(target)) {
      event.stopPropagation();
    }
  };

  /**
   * Requests this node as an input for the active view without letting the
   * click bubble into React Flow's node drag/select handlers.
   * Called by: the fixed-size NodeToolbar "+" button.
   */
  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToSelection?.(node.id, e.detail > 0 ? { x: e.clientX, y: e.clientY } : undefined);
  };

  /**
   * Fixed-pixel-size action toolbar rendered by React Flow outside the scaled
   * node transform. Best practice for zoomable canvases: keep interactive
   * controls out of the zoomed content layer and reveal them only for the
   * hovered or keyboard-focused item, so dense layouts are not permanently occluded. Selection
   * state intentionally does not affect visibility.
   */
  const nodeToolbar = (
    <NodeToolbar
      nodeId={id}
      data-node-toolbar-id={id}
      isVisible={isToolbarVisible}
      position={Position.Top}
      align="center"
      offset={0}
      className="nodrag nopan flex items-center gap-1 rounded-md border border-surface-border bg-surface p-1"
      onMouseEnter={() => {
        dispatchUi({ type: 'set-toolbar-hovered', isToolbarHovered: true });
        setActiveToolbarOwner(id);
      }}
      onMouseLeave={hideToolbar}
      onPointerDown={stopGraphControlEvent}
      onMouseDown={stopGraphControlEvent}
      onClick={stopGraphControlEvent}
      onDoubleClick={stopGraphControlEvent}
      onKeyDown={stopGraphControlEvent}
    >
      {data.onPreview && (
        <button
          ref={previewButton}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            data.onPreview?.(id);
          }}
          className={cn(
            CUSTOM_NODE_TOOLBAR_BUTTON_CLASS,
            data.isPreviewed &&
              'bg-list-active text-[var(--vscode-list-activeSelectionForeground)] hover:bg-list-active hover:text-[var(--vscode-list-activeSelectionForeground)]',
          )}
          aria-pressed={data.isPreviewed ?? false}
          title={data.isPreviewed ? 'Hide preview' : 'Preview data'}
          aria-label="Preview data"
        >
          <Eye className="h-4 w-4" />
        </button>
      )}
      <CustomNodeActionMenu
        showMenu={showMenu}
        onMenuChange={(willOpen) => {
          dispatchUi({
            type: 'set-menu',
            showMenu: willOpen,
          });
          setActiveToolbarOwner(id);
        }}
        onRenameClick={handleRenameClick}
        onCopyNode={handleCopyNode}
        onExportClick={handleExportClick}
        onAddLogicalParent={
          data.onAddLogicalParent
            ? () => {
                dispatchUi({ type: 'set-menu', showMenu: false });
                data.onAddLogicalParent?.(id);
              }
            : undefined
        }
        onAddLogicalChild={
          data.onAddLogicalChild
            ? () => {
                dispatchUi({ type: 'set-menu', showMenu: false });
                data.onAddLogicalChild?.(id);
              }
            : undefined
        }
        onMaterialize={
          data.onMaterialize
            ? (event) => {
                event.stopPropagation();
                dispatchUi({ type: 'set-menu', showMenu: false });
                data.onMaterialize?.(id);
              }
            : undefined
        }
        onEditTable={
          data.onEditTable
            ? () => {
                dispatchUi({ type: 'set-menu', showMenu: false });
                data.onEditTable?.(id);
              }
            : undefined
        }
        onEditSql={
          data.onEditSql
            ? () => {
                dispatchUi({ type: 'set-menu', showMenu: false });
                data.onEditSql?.(id);
              }
            : undefined
        }
        canUndo={node.canUndo}
        onUndo={handleUndo}
        onDeleteClick={handleDeleteClick}
        stopGraphControlEvent={stopGraphControlEvent}
      />
      {!data.databaseObject && (
        <button
          type="button"
          onPointerDown={stopGraphControlEvent}
          onMouseDown={stopGraphControlEvent}
          onClick={handleAddClick}
          className={CUSTOM_NODE_TOOLBAR_BUTTON_CLASS}
          disabled={!onAddToSelection}
          title={!onAddToSelection ? 'Choose Preprocessing to add inputs' : 'Add to selection'}
          aria-label="Add Data Block to selection"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </NodeToolbar>
  );

  const deleteDialog = (
    <AlertDialog
      open={dialog?.kind === 'delete'}
      onOpenChange={(open) => {
        dispatchUi({ type: 'set-delete-confirm', showDeleteConfirm: open });
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-all">
            Delete &ldquo;{nodeName}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this{' '}
            {data.databaseObject ? 'database object' : 'Data Block'}. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteConfirm}
            className="bg-error text-button-foreground hover:bg-error/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const exportDialog = (
    <DataBlockExportDialog
      open={dialog?.kind === 'export'}
      onOpenChange={(open) => {
        dispatchUi({ type: 'set-export-dialog', showExportDialog: open });
      }}
      dataBlock={{ id: node.id, name: node.name }}
      onExport={onExport}
      onError={onError}
    />
  );

  const renameDialog = (
    <DataBlockRenameDialog
      open={dialog?.kind === 'rename'}
      onOpenChange={(open) => {
        dispatchUi({ type: 'set-rename-open', open });
      }}
      currentName={data.objectName ?? node.name}
      value={dialog?.kind === 'rename' ? dialog.draft : ''}
      onValueChange={(value) => {
        dispatchUi({ type: 'set-rename-value', value });
      }}
      onRename={(name) => {
        onRename(node.id, name);
      }}
    />
  );

  const copyIdentityButton = (
    <button
      onClick={handleCopyId}
      className="p-1 hover:bg-panel rounded-sm transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
      title="Copy table name"
    >
      {copied ? (
        <Check className="h-3 w-3 text-[var(--vscode-charts-green)]" />
      ) : (
        <Copy className="h-3 w-3 text-description" />
      )}
    </button>
  );
  const focusProps = {
    tabIndex: data.onPreview ? 0 : undefined,
    'aria-keyshortcuts': data.onPreview ? 'Enter' : undefined,
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget && event.key === 'Enter' && data.onConnectionPick) {
        event.preventDefault();
        event.stopPropagation();
        data.onConnectionPick(id);
        return;
      }
      // Portaled controls follow all graph nodes in DOM order. Enter reaches
      // this card's actions directly without selecting it or opening data.
      if (event.target === event.currentTarget && event.key === 'Enter' && data.onPreview) {
        event.preventDefault();
        event.stopPropagation();
        dispatchUi({ type: 'set-focused', focused: true });
        setActiveToolbarOwner(id);
        requestAnimationFrame(() => previewButton.current?.focus());
      }
    },
    onFocusCapture: () => {
      dispatchUi({ type: 'set-focused', focused: true });
      setActiveToolbarOwner(id);
    },
    onBlurCapture: (event: React.FocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget;
      // NodeToolbar is portaled outside the card, but is part of its keyboard controls.
      if (
        next instanceof Element &&
        (event.currentTarget.contains(next) ||
          next.closest('[data-node-toolbar-id]')?.getAttribute('data-node-toolbar-id') === id)
      )
        return;
      dispatchUi({ type: 'set-focused', focused: false });
      if (!isHovered && !isToolbarHovered) releaseToolbarOwner(id);
    },
  };
  // A separate drop handle keeps ordinary edge anchors fixed at the card boundary.
  const reconnectHandle = (
    <Handle
      id="reconnect-source"
      type="source"
      position={sourcePosition}
      isConnectable={data.reconnectTarget ?? false}
      isConnectableStart={false}
      isConnectableEnd={data.reconnectTarget ?? false}
      className="!inset-0 !h-full !w-full !transform-none !rounded-md !border-0 !opacity-0"
      style={{ pointerEvents: data.reconnectTarget ? 'all' : 'none' }}
    />
  );
  if (isZoomedOut) {
    // Compact view keeps critical controls visible while preserving the compact footprint.
    const compactClasses = cn(
      'flex items-start rounded-md border border-surface-border p-3 text-foreground',
      isSelected && 'outline outline-2 outline-offset-2 outline-data-block-selection',
      data.connectionCandidate && 'ring-2 ring-focus cursor-crosshair',
    );
    return (
      <div
        {...focusProps}
        className={compactClasses}
        data-testid="custom-node-compact-card"
        onClick={stopPortaledGraphEvent}
        onDoubleClick={stopPortaledGraphEvent}
        onMouseEnter={showToolbar}
        onMouseLeave={hideToolbar}
        style={{
          minWidth: '220px',
          maxWidth: '360px',
          position: 'relative',
          backgroundColor: identitySurfaceColor,
        }}
      >
        {nodeToolbar}
        <DataBlockName
          name={nodeName}
          backgroundColor={identitySurfaceColor}
          maxLines={3}
          fadeEdge="head"
          className="w-full text-heading-1 font-semibold leading-snug"
          title={nodeName}
        />
        <Handle
          type="target"
          isConnectableStart={false}
          isConnectableEnd={false}
          position={targetPosition}
          className="w-2! h-2! bg-panel-foreground! opacity-0 pointer-events-none"
        />
        <Handle
          type="source"
          isConnectableStart={false}
          isConnectableEnd={false}
          position={sourcePosition}
          style={{ width: 12, height: 12, borderWidth: 2 }}
        />
        {deleteDialog}
        {reconnectHandle}
        {exportDialog}
        {renameDialog}
      </div>
    );
  }

  return (
    <div
      {...focusProps}
      className={nodeClasses}
      data-testid="custom-node-card"
      onClick={stopPortaledGraphEvent}
      onDoubleClick={stopPortaledGraphEvent}
      onMouseEnter={() => {
        showToolbar();
      }}
      onMouseLeave={hideToolbar}
      style={{
        minWidth: '320px',
        position: 'relative',
      }}
    >
      {/* The toned header is the persistent identity surface; the neutral body
          keeps metadata quiet and selection stays outside the card. */}
      <div
        data-testid="custom-node-identity-header"
        className="relative flex min-h-fit items-start justify-between rounded-t-md border-b border-surface-border px-3 py-2 text-foreground"
        style={{ backgroundColor: identitySurfaceColor }}
      >
        <div className="flex min-w-0 flex-1 items-center">
          <DataBlockName
            name={nodeName}
            backgroundColor={identitySurfaceColor}
            maxLines={3}
            className="w-full text-body font-semibold leading-snug"
            title={nodeName}
          />
        </div>
      </div>

      {/* Node Body */}
      <div className="space-y-1 rounded-b-md bg-surface p-3">
        {node.kind && (
          <div className="group flex items-center justify-between text-label-secondary text-foreground">
            <span>
              Type:{' '}
              {node.kind === 'view'
                ? 'View'
                : node.kind === 'table'
                  ? 'Table'
                  : 'Object unavailable'}
            </span>
            {copyIdentityButton}
          </div>
        )}
        {data.detail && <p className="text-description text-body-secondary">{data.detail}</p>}
        {diagnostic && (
          <p role="status" className="max-w-80 text-description text-body-secondary">
            {diagnostic}
          </p>
        )}
        <div className="font-mono text-label-secondary text-foreground">
          Columns: {node.columnCount === null ? 'Unavailable' : node.columnCount.toLocaleString()}
        </div>
      </div>

      {/* Fixed edge anchors; source reconnection uses the separate card-sized drop handle. */}
      <Handle
        type="target"
        isConnectableStart={false}
        isConnectableEnd={false}
        position={targetPosition}
        className="w-2! h-2! bg-panel-foreground! opacity-0 pointer-events-none"
      />
      <Handle
        type="source"
        isConnectableStart={false}
        isConnectableEnd={false}
        position={sourcePosition}
        style={{ width: 12, height: 12, borderWidth: 2 }}
      />
      {nodeToolbar}
      {reconnectHandle}
      {deleteDialog}
      {exportDialog}
      {renameDialog}
    </div>
  );
}
