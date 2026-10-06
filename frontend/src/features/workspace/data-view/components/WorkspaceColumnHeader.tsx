import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Expand,
  Loader2,
  Minimize,
  Pin,
  Settings2,
} from 'lucide-react';
import { useRef } from 'react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ArrowField } from '@/lib/arrow/arrowTable';

import { isColumnCastType, type ColumnCastType } from '../services/schemaMutations';
import { ColumnTypeSymbol } from './ColumnTypeSymbol';
import { RenameInput } from './RenameInput';
import type { WorkspaceTableColumn } from './workspaceTableFeatures';
import type { DataEditorTool } from '../dataEditorToolStore';
import { focusDataEditorTool } from '../focusDataEditorTool';

interface DataTypeOption {
  value: string;
  label: string;
}

interface SortState {
  id: string;
  desc: boolean;
}

export interface WorkspaceColumnHeaderProps {
  column: string;
  /** TanStack column instance, used to drive pin state. */
  colInst: WorkspaceTableColumn;

  // Mutation state
  currentType: string;
  /** The column's decoded field, which picks the type button's symbol. */
  field?: ArrowField;
  displayLabel: string;
  /** The plain type name plus any exact spelling, for the tooltip. */
  typeTooltip?: string;
  availableTypes: DataTypeOption[];
  isColumnBusy: boolean;
  isRenaming: boolean;

  // Capability flags
  canCast: boolean;
  canRename: boolean;
  canDelete: boolean;
  /**
   * The column holds topic coverage (issue 200): it cannot be sorted, change
   * type, or be read by the text tools, so only Copy column is offered.
   */
  isTopicCoverage?: boolean;

  // Wide column expand/collapse
  isWideColumn: boolean;
  isCollapsedColumn: boolean;
  onToggleExpand: () => void;

  // Sort
  sortState: SortState | undefined;
  onSort: () => void;

  onStartRename: () => void;
  onSubmitRename: (column: string, value: string) => Promise<boolean>;
  onCancelRename: () => void;
  onTypeChange: (newType: ColumnCastType) => void;
  onRequestDelete: () => void;
  /** Opens a Data Editor tool with this column pre-filled (issue 143). */
  onOpenTool?: (tool: DataEditorTool) => void;
}

const COLUMN_TOOLS: { tool: DataEditorTool; label: string }[] = [
  { tool: 'find_replace', label: 'Find & replace…' },
  { tool: 'clean_text', label: 'Clean text…' },
  { tool: 'extract', label: 'Extract text…' },
  { tool: 'split', label: 'Split…' },
  { tool: 'count', label: 'Count…' },
  { tool: 'duplicate', label: 'Copy column…' },
];

const TOPIC_COVERAGE_TOOLS = COLUMN_TOOLS.filter((item) => item.tool === 'duplicate');
const TOPIC_COVERAGE_SORT_REASON = "Topic coverage columns can't be sorted yet.";
const TOPIC_COVERAGE_TYPE_REASON = "Topic coverage columns can't change type yet.";

/** "whole number" reads as "Whole number" when it stands alone. */
const typeName = (label: string): string => label.charAt(0).toUpperCase() + label.slice(1);

/**
 * Renders one server-backed table column header with identity-preserving cast,
 * rename, and delete controls.
 */
export function WorkspaceColumnHeader({
  column,
  colInst,
  currentType,
  field,
  displayLabel,
  typeTooltip,
  availableTypes,
  isColumnBusy,
  isRenaming,
  canCast,
  canRename,
  canDelete,
  isTopicCoverage = false,
  isWideColumn,
  isCollapsedColumn,
  onToggleExpand,
  sortState,
  onSort,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onTypeChange,
  onRequestDelete,
  onOpenTool,
}: WorkspaceColumnHeaderProps) {
  const openedToolRef = useRef(false);
  const isPinnedStart = colInst.getIsPinned() === 'start';

  const typeButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isColumnBusy || !canCast || isTopicCoverage}
      className={cn(
        'h-7 w-fit shrink-0 gap-0.5 px-1 text-label-secondary font-medium',
        isColumnBusy && 'cursor-progress opacity-80',
      )}
      aria-label={`Change data type for column ${column}`}
      aria-description={typeName(displayLabel)}
    >
      <ColumnTypeSymbol field={field} />
      {isColumnBusy ? (
        <Loader2 className="h-3 w-3 animate-spin text-description" />
      ) : (
        <ChevronDown className="h-3 w-3 text-description" />
      )}
    </Button>
  );

  return (
    <div className="flex min-w-0 items-center gap-1">
      {/* Pin */}
      <button
        type="button"
        onClick={() => {
          colInst.pin(isPinnedStart ? false : 'start');
        }}
        className={cn(
          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent text-description transition-colors hover:bg-panel-foreground/10 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus',
          isPinnedStart && 'text-link',
        )}
        aria-pressed={isPinnedStart}
        aria-label={isPinnedStart ? `Unpin column ${column}` : `Pin column ${column} to the start`}
      >
        <Pin className="h-3.5 w-3.5" fill={isPinnedStart ? 'currentColor' : 'none'} />
      </button>

      {isRenaming ? (
        <RenameInput column={column} onSubmit={onSubmitRename} onCancel={onCancelRename} />
      ) : (
        <div className="min-w-0">
          {/* Double-click the name to rename the column, like a tab (issue 208). */}
          <span
            className="block max-w-[160px] truncate text-label-secondary font-medium text-foreground"
            title={canRename ? `${column} (double-click to rename)` : column}
            onDoubleClick={
              canRename && !isColumnBusy
                ? (event) => {
                    event.preventDefault();
                    onStartRename();
                  }
                : undefined
            }
          >
            {column}
          </span>
        </div>
      )}

      {/* Sort indicator + click-to-sort */}
      <DisabledReasonTooltip reason={isTopicCoverage ? TOPIC_COVERAGE_SORT_REASON : null}>
        <button
          type="button"
          onClick={onSort}
          disabled={isTopicCoverage}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-description transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          aria-label={`Sort by ${column}`}
        >
          {sortState ? (
            sortState.desc ? (
              <ArrowDown className="h-3.5 w-3.5 text-link" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5 text-link" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5" />
          )}
        </button>
      </DisabledReasonTooltip>

      {/* Data type selector: a symbol, with the full name in the tooltip and menu (issue 206) */}
      <DropdownMenu>
        {isTopicCoverage ? (
          <DisabledReasonTooltip reason={TOPIC_COVERAGE_TYPE_REASON}>
            <DropdownMenuTrigger asChild>{typeButton}</DropdownMenuTrigger>
          </DisabledReasonTooltip>
        ) : (
          <TooltipProvider delayDuration={300} skipDelayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>{typeButton}</DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{typeTooltip ?? typeName(displayLabel)}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <DropdownMenuContent align="start" className="w-40 p-1">
          <DropdownMenuRadioGroup value={currentType}>
            {availableTypes.map((t) => (
              <DropdownMenuRadioItem
                key={t.value}
                value={t.value}
                className="text-label-secondary"
                // onSelect, not onValueChange: choosing "category" on a category
                // column opens its order window again (issue 318).
                onSelect={() => {
                  if (!isColumnBusy && isColumnCastType(t.value)) onTypeChange(t.value);
                }}
              >
                {typeName(t.label)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Expand / collapse wide column */}
      {isWideColumn && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleExpand}
          className="h-7 w-7 shrink-0 text-description hover:text-link"
          aria-label={isCollapsedColumn ? `Expand column ${column}` : `Collapse column ${column}`}
        >
          {isCollapsedColumn ? (
            <Expand className="h-3.5 w-3.5" />
          ) : (
            <Minimize className="h-3.5 w-3.5" />
          )}
        </Button>
      )}

      {(canRename || canDelete || onOpenTool) && !isRenaming && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={isColumnBusy}
              className={cn(
                'h-7 w-7 shrink-0 text-description hover:text-link',
                isColumnBusy && 'cursor-progress opacity-80',
              )}
              aria-label={`Column settings for ${column}`}
            >
              {isColumnBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Settings2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44 p-1"
            onCloseAutoFocus={(event) => {
              // A tool takes focus into its panel; Rename and Delete keep the default.
              if (!openedToolRef.current) return;
              openedToolRef.current = false;
              event.preventDefault();
              focusDataEditorTool();
            }}
          >
            {onOpenTool
              ? (isTopicCoverage ? TOPIC_COVERAGE_TOOLS : COLUMN_TOOLS).map((item) => (
                  <DropdownMenuItem
                    key={item.tool}
                    disabled={isColumnBusy}
                    onSelect={() => {
                      openedToolRef.current = true;
                      onOpenTool(item.tool);
                    }}
                    className="text-label-secondary"
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))
              : null}
            {canRename && (
              <DropdownMenuItem
                disabled={isColumnBusy}
                onSelect={onStartRename}
                className="text-label-secondary"
              >
                Rename
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem
                disabled={isColumnBusy}
                onSelect={onRequestDelete}
                className="text-label-secondary text-error focus:text-error"
              >
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
