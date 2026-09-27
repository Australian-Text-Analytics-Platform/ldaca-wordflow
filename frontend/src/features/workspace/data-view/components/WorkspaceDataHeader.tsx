import { useState } from 'react';
import { ChevronDown, Columns3, Eraser, Plus, Redo2, Replace, Undo2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import HelpIcon from '@/components/help/HelpIcon';
import { DeleteColumnsDialog } from './DeleteColumnsDialog';
import { CLEAN_TEXT_OPERATIONS } from '../dataEditorRequests';
import type { DataEditorTool } from '../dataEditorToolStore';
import { focusDataEditorTool } from '../focusDataEditorTool';

import type { WorkspaceDataTableHeaderInfo } from '../hooks/useWorkspaceDataTable';

interface WorkspaceDataHeaderProps {
  info: WorkspaceDataTableHeaderInfo;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Deletes several columns in one edit (issue 141). */
  onDeleteColumns?: (columns: string[]) => Promise<void>;
  /** Opens a Data Editor tool (issue 143). */
  onOpenTool?: (
    tool: DataEditorTool,
    options?: { column?: string | null; operation?: string | null },
  ) => void;
}

/**
 * Choosing a tool moves focus into its panel's first field once the menu has
 * closed, instead of back to the menu trigger (which stole the first keystroke).
 */
const keepToolFocus = (event: Event) => {
  event.preventDefault();
  focusDataEditorTool();
};

const TOOL_BUTTON =
  'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-label-secondary text-description enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Renders selected-node title and rename controls.
 * Rendered by `WorkspaceDataTableFeature` above `WorkspaceTable`.
 * Why: the data table feature needs the active node label and node-level actions
 * grouped in one compact line above the table state.
 * Flow: derive editable header state from node info, keep long labels clipped
 * with a leading fade, run inline rename, and expose icon-only actions beside
 * the table.
 */
export const WorkspaceDataHeader = ({
  info,
  onUndo,
  onDeleteColumns,
  onOpenTool,
  onRedo,
}: WorkspaceDataHeaderProps) => {
  const [deleteColumnsOpen, setDeleteColumnsOpen] = useState(false);

  return (
    <div className="shrink-0 border-b border-surface-border bg-panel p-2">
      {/* The editing tools sit on the left and Undo/Redo at the right end
          (issue 208); on a narrow panel Undo/Redo wrap to a second line. The
          title and renaming live in the tab strip above (issue 206). */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {onOpenTool ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={TOOL_BUTTON}>
                    <Plus className="h-3 w-3" />
                    Add column
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onCloseAutoFocus={keepToolFocus}>
                  <DropdownMenuItem
                    onSelect={() => {
                      onOpenTool('combine');
                    }}
                  >
                    Combine columns…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      onOpenTool('count');
                    }}
                  >
                    Count words, characters, or matches…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      onOpenTool('duplicate');
                    }}
                  >
                    Copy column…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      onOpenTool('extract');
                    }}
                  >
                    Extract text…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      onOpenTool('split');
                    }}
                  >
                    Split column…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                className={TOOL_BUTTON}
                onClick={() => {
                  onOpenTool('find_replace');
                }}
              >
                <Replace className="h-3 w-3" />
                Find &amp; replace
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={TOOL_BUTTON}>
                    <Eraser className="h-3 w-3" />
                    Clean text
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onCloseAutoFocus={keepToolFocus}>
                  {CLEAN_TEXT_OPERATIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onSelect={() => {
                        onOpenTool('clean_text', { operation: option.value });
                      }}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <HelpIcon
                targetKey="ui.data-editor.column-tools"
                label="About the column tools"
                tooltip="Add, change, or clean columns of this Data Block in place. Rows are never added, removed, or reordered."
                className="h-5 w-5 shrink-0 text-description"
              />
            </>
          ) : null}
          {onDeleteColumns ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-label-secondary text-description enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                setDeleteColumnsOpen(true);
              }}
              disabled={info.columns.length < 2}
              title="Delete several columns at once"
            >
              <Columns3 className="h-3 w-3" />
              Delete columns
            </button>
          ) : null}
          {info.isEmptyTable && (
            <span
              className="shrink-0 text-label-secondary italic text-description"
              aria-live="polite"
            >
              (empty table)
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-label-secondary text-description enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onUndo}
            disabled={!info.canUndo}
            aria-label="Undo Data Block edit"
            title="Undo the last edit from this Project session"
          >
            <Undo2 className="h-3 w-3" />
            Undo
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-label-secondary text-description enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onRedo}
            disabled={!info.canRedo}
            aria-label="Redo Data Block edit"
            title="Redo the last undone edit from this Project session"
          >
            <Redo2 className="h-3 w-3" />
            Redo
          </button>
        </div>
        {onDeleteColumns ? (
          <DeleteColumnsDialog
            open={deleteColumnsOpen}
            onOpenChange={setDeleteColumnsOpen}
            columns={info.columns}
            onConfirm={onDeleteColumns}
          />
        ) : null}
      </div>
    </div>
  );
};
