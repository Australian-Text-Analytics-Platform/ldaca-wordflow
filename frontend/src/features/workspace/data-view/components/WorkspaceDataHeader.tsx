import { useEffect, useState, useRef } from 'react';
import { ChevronDown, Columns3, Eraser, Pencil, Plus, Redo2, Replace, Undo2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import HelpIcon from '@/components/help/HelpIcon';
import { cn } from '@/lib/utils';
import { DeleteColumnsDialog } from './DeleteColumnsDialog';
import { CLEAN_TEXT_OPERATIONS } from '../dataEditorRequests';
import type { DataEditorTool } from '../dataEditorToolStore';
import { focusDataEditorTool } from '../focusDataEditorTool';

import type { WorkspaceDataTableHeaderInfo } from '../hooks/useWorkspaceDataTable';

interface WorkspaceDataHeaderProps {
  info: WorkspaceDataTableHeaderInfo;
  onRename?: (newName: string) => void;
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
 * Keeps the selected data-node label on the header row while preserving the
 * useful trailing filename when space is tight.
 * Rendered by: WorkspaceDataHeader because its title row must not wrap under
 * the action buttons.
 * Flow: measure the label against its wrapper, switch to RTL clipping when it
 * overflows, and draw a muted left-edge fade over the hidden prefix.
 */
function HeaderNodeLabel({ label }: { label: string }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const text = textRef.current;
    if (!wrap || !text) return;
    const measure = () => {
      setOverflowing(text.offsetWidth > wrap.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    observer.observe(text);
    return () => {
      observer.disconnect();
    };
  }, [label]);

  return (
    <span
      ref={wrapRef}
      dir={overflowing ? 'rtl' : 'ltr'}
      className="relative min-w-0 flex-1 overflow-hidden"
      data-testid="workspace-data-node-label"
      title={label}
    >
      <span
        ref={textRef}
        dir="ltr"
        className="block w-max whitespace-nowrap text-body font-semibold text-foreground"
      >
        {label}
      </span>
      <span
        aria-hidden="true"
        data-testid="workspace-data-node-label-fade"
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-14 bg-linear-to-r from-muted via-muted/90 to-transparent',
          overflowing ? 'opacity-100' : 'opacity-0',
        )}
      />
    </span>
  );
}

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
  onRename,
  onUndo,
  onDeleteColumns,
  onOpenTool,
  onRedo,
}: WorkspaceDataHeaderProps) => {
  const [renameDraft, setRenameDraft] = useState<{ baseLabel: string; value: string }>();
  const [deleteColumnsOpen, setDeleteColumnsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isRenaming = renameDraft?.baseLabel === info.nodeLabel;

  /**
   * Commits a node rename when the inline editor blurs or submits.
   * Attached to the rename form's submit and input blur paths.
   */
  const handleRenameCommit = () => {
    if (!isRenaming) {
      return;
    }
    const trimmed = renameDraft.value.trim();
    if (trimmed && trimmed !== info.nodeLabel && onRename) {
      onRename(trimmed);
    }
    setRenameDraft(undefined);
  };

  /**
   * Opens inline node rename mode and focuses the draft input.
   * Attached to the node-name edit button.
   */
  const startRename = () => {
    setRenameDraft({ baseLabel: info.nodeLabel, value: info.nodeLabel });
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 10);
  };

  return (
    <div className="shrink-0 border-b border-surface-border bg-panel p-2">
      {/* Wraps instead of squeezing: on a narrow panel the tools move to a
          second line rather than overlapping the Data Block name. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        <h3 className="shrink-0 text-body font-medium text-foreground">Data Editor</h3>
        <HelpIcon
          targetKey="ui.data-viewer"
          label="Data Editor"
          className="h-5 w-5 shrink-0 text-description"
        />
        <span className="shrink-0 text-description">|</span>
        <div className="flex min-w-48 flex-1 basis-48 items-center gap-2">
          {isRenaming ? (
            <input
              ref={inputRef}
              className="min-w-0 flex-1 rounded-sm border px-2 py-0.5 text-body font-semibold text-foreground"
              value={renameDraft.value}
              onChange={(e) => {
                setRenameDraft({ baseLabel: info.nodeLabel, value: e.target.value });
              }}
              onBlur={handleRenameCommit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameCommit();
                if (e.key === 'Escape') setRenameDraft(undefined);
              }}
              aria-label="Node name"
            />
          ) : (
            <HeaderNodeLabel label={info.nodeLabel} />
          )}
          {onRename && !isRenaming && (
            <button
              className="inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-label-secondary text-description hover:text-foreground"
              onClick={startRename}
              title="Rename"
              aria-label="Rename node"
            >
              <Pencil className="h-3 w-3" />
              Rename
            </button>
          )}
          {info.isEmptyTable && (
            <span
              className="shrink-0 text-label-secondary italic text-description"
              aria-live="polite"
            >
              (empty table)
            </span>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
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
                    Duplicate column…
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
