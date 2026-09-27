import { Settings2 } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NodeMoreMenu } from '@/components/layout/NodeMoreMenu';

export const CUSTOM_NODE_TOOLBAR_BUTTON_CLASS =
  'relative flex h-8 w-8 items-center justify-center rounded-md border border-surface-border bg-surface text-description transition-colors hover:bg-panel hover:text-foreground';

interface CustomNodeActionMenuProps {
  showMenu: boolean;
  onMenuChange: (showMenu: boolean) => void;
  onRenameClick: (event: React.MouseEvent) => void;
  onCopyNode: (event: React.MouseEvent) => void;
  onExportClick: (event: React.MouseEvent) => void;
  onMaterialize?: (event: React.MouseEvent) => void;
  onEditSql?: () => void;
  onEditTable?: () => void;
  onAddLogicalParent?: () => void;
  onAddLogicalChild?: () => void;
  canUndo: boolean;
  onUndo: (event: React.MouseEvent) => void;
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
  onMenuChange,
  onRenameClick,
  onCopyNode,
  onExportClick,
  onMaterialize,
  onEditSql,
  onEditTable,
  onAddLogicalParent,
  onAddLogicalChild,
  canUndo,
  onUndo,
  onDeleteClick,
  stopGraphControlEvent,
}: CustomNodeActionMenuProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [boundary, setBoundary] = useState<Element | null>(null);
  return (
    <DropdownMenu
      modal={false}
      open={showMenu}
      onOpenChange={(open) => {
        if (open) setBoundary(trigger.current?.closest('.react-flow') ?? null);
        onMenuChange(open);
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
          side="top"
          align="end"
          collisionBoundary={boundary}
          collisionPadding={8}
          className="w-48"
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
            title="Undo applies only to View query layers. Table writes and metadata changes are not undone."
            onClick={canUndo ? onUndo : undefined}
            disabled={!canUndo}
            className="min-h-control w-full rounded-sm px-2 py-1 text-left text-label-secondary data-disabled:cursor-not-allowed data-disabled:opacity-50"
          >
            Undo
          </DropdownMenuItem>

          <DropdownMenuItem
            title="Redo is not available for SQL edits."
            disabled
            className="min-h-control w-full rounded-sm px-2 py-1 text-left text-label-secondary data-disabled:cursor-not-allowed data-disabled:opacity-50"
          >
            Redo
          </DropdownMenuItem>

          <NodeMoreMenu
            onEditSql={onEditSql}
            onEditTable={onEditTable}
            collisionBoundary={boundary}
          />
          {onAddLogicalParent && (
            <DropdownMenuItem onSelect={onAddLogicalParent}>Add logical parent</DropdownMenuItem>
          )}
          {onAddLogicalChild && (
            <DropdownMenuItem onSelect={onAddLogicalChild}>Add logical child</DropdownMenuItem>
          )}
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
