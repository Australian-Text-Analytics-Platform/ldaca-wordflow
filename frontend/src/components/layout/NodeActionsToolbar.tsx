import { useState } from 'react';
import { Pin, Settings2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { DataBlockRenameDialog } from '@/features/project/common/components/DataBlockRenameDialog';
import type { NodeInputPointerPosition } from '@/stores/nodeInputRequestsStore';
import { NodeMoreMenu } from './NodeMoreMenu';

/** Minimal node shape the row toolbar needs. */
interface NodeActionsToolbarNode {
  id: string;
  name: string;
}

export interface NodeActionsToolbarProps {
  node: NodeActionsToolbarNode;
  isPinned: boolean;
  onTogglePin: (nodeId: string) => void;
  inputsDisabled?: boolean;
  onAddToSelection?: (nodeId: string, pointer?: NodeInputPointerPosition) => void;
  onRename: (nodeId: string, newName: string) => void;
  onClone: (nodeId: string) => void;
  onMaterialize?: (nodeId: string) => void;
  onEditSql?: (nodeId: string) => void;
  onEditTable?: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}

const iconButtonClass =
  'inline-flex h-6 w-6 items-center justify-center rounded-sm border border-surface-border bg-surface text-description transition-colors hover:bg-panel hover:text-foreground';

interface NodePinButtonProps {
  node: NodeActionsToolbarNode;
  isPinned: boolean;
  onTogglePin: (nodeId: string) => void;
}

/**
 * Single pin action shared by the full row toolbar and the pinned row's resting
 * affordance.
 * Rendered by: NodeActionsToolbar for hovered rows and ProjectNodeList for
 * pinned rows at rest because only the pin icon should remain visible when the
 * full toolbar is hidden.
 */
export function NodePinButton({ node, isPinned, onTogglePin }: NodePinButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        onTogglePin(node.id);
      }}
      className={cn(
        iconButtonClass,
        isPinned && 'border-button/70 bg-button/10 text-link hover:bg-button/15 hover:text-link',
      )}
      title={isPinned ? 'Unpin data block' : 'Pin data block'}
      aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${node.name}`}
      data-pin-action
      data-pinned={isPinned ? 'true' : 'false'}
    >
      <Pin
        className={cn(
          'h-3.5 w-3.5 transition-transform',
          isPinned && '-rotate-45 translate-y-0.5 fill-current',
        )}
      />
    </button>
  );
}

/**
 * Compact per-Data-Block action toolbar rendered at the end of each row in the
 * sidebar Data Blocks list. Mirrors the graph card's hover toolbar
 * (settings menu with Rename / Clone / Undo / Redo / Delete, and an add-to-inputs
 * button) with hover action overlay.
 *
 * Rendered by: Sidebar via ProjectNodeList's ``renderRowActions``
 * slot. Wired to the same project actions the graph uses (delete/rename/clone/
 * undo/redo) plus the node-input add request.
 *
 * Flow: render icon buttons; the settings menu opens the shared Data Block
 * rename dialog or the local delete confirmation, then calls the project
 * actions passed by the list view.
 */
export function NodeActionsToolbar({
  node,
  isPinned,
  onTogglePin,
  onAddToSelection,
  inputsDisabled = false,
  onRename,
  onClone,
  onMaterialize,
  onEditSql,
  onEditTable,
  onDelete,
}: NodeActionsToolbarProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const [deleteOpen, setDeleteOpen] = useState(false);

  /** Opens the rename dialog seeded with the current name. */
  const openRename = () => {
    setRenameValue(node.name);
    setRenameOpen(true);
  };

  return (
    <div className="flex items-center gap-1">
      <NodePinButton node={node} isPinned={isPinned} onTogglePin={onTogglePin} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={iconButtonClass}
            title="More options"
            aria-label={`Actions for ${node.name}`}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36">
          <DropdownMenuItem onSelect={openRename}>Rename</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              onClone(node.id);
            }}
          >
            Clone
          </DropdownMenuItem>
          {onMaterialize && (
            <DropdownMenuItem
              onSelect={() => {
                onMaterialize(node.id);
              }}
            >
              Materialize
            </DropdownMenuItem>
          )}
          <NodeMoreMenu
            onEditTable={
              onEditTable
                ? () => {
                    onEditTable(node.id);
                  }
                : undefined
            }
            onEditSql={
              onEditSql
                ? () => {
                    onEditSql(node.id);
                  }
                : undefined
            }
          />
          <DropdownMenuItem
            className="text-error focus:text-error"
            onSelect={() => {
              setDeleteOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        onClick={(event) => {
          onAddToSelection?.(
            node.id,
            event.detail > 0 ? { x: event.clientX, y: event.clientY } : undefined,
          );
        }}
        className={iconButtonClass}
        disabled={inputsDisabled}
        title={
          inputsDisabled ? 'Analysis execution is not available on desktop yet' : 'Add to selection'
        }
        aria-label={`Add ${node.name} to selection`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <DataBlockRenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        currentName={node.name}
        value={renameValue}
        onValueChange={setRenameValue}
        onRename={(name) => {
          onRename(node.id, name);
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{node.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this data block and its data. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-button-foreground hover:bg-error/90"
              onClick={() => {
                onDelete(node.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
