import { Settings2 } from 'lucide-react';
import { useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NodeMoreMenu } from '@/components/layout/NodeMoreMenu';
import { computeMenuPlacement, type NodeMenuPlacement } from './customNodeMenuPlacement';

export const CUSTOM_NODE_TOOLBAR_BUTTON_CLASS =
  'relative flex h-8 w-8 items-center justify-center rounded-md border border-surface-border bg-surface text-description transition-colors hover:bg-panel hover:text-foreground';

interface CustomNodeActionMenuProps {
  showMenu: boolean;
  menuOpensUp: boolean;
  menuOpensRight: boolean;
  onMenuChange: (showMenu: boolean, placement: NodeMenuPlacement | null) => void;
  onRenameClick: (event: React.MouseEvent) => void;
  onCopyNode: (event: React.MouseEvent) => void;
  onExportClick: (event: React.MouseEvent) => void;
  native?: boolean;
  onMaterialize?: (event: React.MouseEvent) => void;
  onEditSql?: () => void;
  onEditTable?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: (event: React.MouseEvent) => void;
  onRedo: (event: React.MouseEvent) => void;
  onDeleteClick: (event: React.MouseEvent) => void;
  stopGraphControlEvent: (event: React.SyntheticEvent) => void;
}

/**
 * Renders the fixed-size settings button and dropdown menu for a graph node.
 * Used by: CustomNode's React Flow toolbar because menu placement, disabled
 * history actions, and event isolation are one coherent interaction boundary.
 */
export function CustomNodeActionMenu({
  showMenu,
  menuOpensUp,
  menuOpensRight,
  onMenuChange,
  onRenameClick,
  onCopyNode,
  onExportClick,
  native,
  onMaterialize,
  onEditSql,
  onEditTable,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDeleteClick,
  stopGraphControlEvent,
}: CustomNodeActionMenuProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <DropdownMenu
      modal={false}
      open={showMenu}
      onOpenChange={(open) => {
        onMenuChange(open, open && trigger.current ? computeMenuPlacement(trigger.current) : null);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          ref={trigger}
          type="button"
          onPointerDown={stopGraphControlEvent}
          onMouseDown={stopGraphControlEvent}
          onClick={(event) => {
            event.stopPropagation();
          }}
          className={CUSTOM_NODE_TOOLBAR_BUTTON_CLASS}
          title="More options"
          aria-label="Data Block actions"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>

      {showMenu && (
        <DropdownMenuContent
          side={menuOpensUp ? 'top' : 'bottom'}
          align={menuOpensRight ? 'start' : 'end'}
          className="w-40"
          onClick={stopGraphControlEvent}
          onKeyDown={stopGraphControlEvent}
          onKeyUp={stopGraphControlEvent}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <DropdownMenuItem
            onClick={onRenameClick}
            className="min-h-control w-full rounded-sm px-2 py-1 text-left text-label-secondary hover:bg-panel/60"
          >
            Rename
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={onCopyNode}
            className="min-h-control w-full rounded-sm px-2 py-1 text-left text-label-secondary hover:bg-panel/60"
          >
            Clone
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={onExportClick}
            className="min-h-control w-full rounded-sm px-2 py-1 text-left text-label-secondary hover:bg-panel/60"
          >
            Export
          </DropdownMenuItem>

          {onMaterialize && (
            <DropdownMenuItem
              onClick={onMaterialize}
              title="Store current results as a Table. Ends SQL-layer Undo and live source updates."
              className="min-h-control w-full rounded-sm px-2 py-1 text-left text-label-secondary hover:bg-panel/60"
            >
              Materialize
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            title={
              native
                ? 'Undo applies only to View query layers. Table writes and metadata changes are not undone.'
                : undefined
            }
            onClick={canUndo ? onUndo : undefined}
            disabled={!canUndo}
            className="min-h-control w-full rounded-sm px-2 py-1 text-left text-label-secondary data-disabled:cursor-not-allowed data-disabled:opacity-50"
          >
            Undo
          </DropdownMenuItem>

          <DropdownMenuItem
            title={native ? 'Redo is not available for native SQL edits.' : undefined}
            onClick={canRedo ? onRedo : undefined}
            disabled={!canRedo}
            className="min-h-control w-full rounded-sm px-2 py-1 text-left text-label-secondary data-disabled:cursor-not-allowed data-disabled:opacity-50"
          >
            Redo
          </DropdownMenuItem>

          <NodeMoreMenu onEditSql={onEditSql} onEditTable={onEditTable} />
          <DropdownMenuItem
            onClick={onDeleteClick}
            className="min-h-control w-full rounded-sm px-2 py-1 text-left text-label-secondary text-error hover:bg-error-background"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
