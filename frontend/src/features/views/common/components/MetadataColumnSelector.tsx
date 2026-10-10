import React, { useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import { normalizeMetadataColumns } from './metadataColumnSelection';
import {
  COLUMN_MENU_CLASS as MENU_CLASS,
  COLUMN_MENU_ITEM_CLASS as ITEM_CLASS,
} from './columnMenuStyles';

interface MetadataColumnSection {
  columns: string[];
  /**
   * Optional foreground colour applied to the items in this section. When
   * provided, the dropdown skips section headers and relies on colour alone
   * to differentiate which Data Block each column came from — the same
   * colour is used for that block in the input panel above.
   */
  color?: string;
  /**
   * When true, items in this section render disabled — visible (with their
   * colour tint) but not toggleable. Used by Combined view to indicate
   * that columns exclusive to one source can't be displayed in the
   * combined table.
   */
  disabled?: boolean;
}

interface MetadataColumnSelectorProps {
  availableColumns: string[];
  selectedColumns: string[];
  onSelectedColumnsChange: (columns: string[]) => void;
  /** Columns owned by another control remain visible but cannot be selected here. */
  disabledColumns?: string[];
  /**
   * Optional grouping of `availableColumns`. When provided and there is more
   * than one section, the dropdown renders each group with a divider so
   * users can tell which block a column came from. When omitted the dropdown
   * falls back to a flat list.
   */
  sections?: MetadataColumnSection[];
  /**
   * When provided, disables the dropdown trigger and surfaces the reason via
   * a tooltip. Used to express "the selected Data Blocks have no shared
   * metadata, so showing metadata isn't meaningful here" — currently only
   * triggered by Combined view in Concordance when two blocks have no
   * intersecting metadata columns.
   */
  disabledReason?: string;
}

/**
 * Renders the shared metadata-column dropdown used by analysis result tables to
 * choose which row metadata survives in visible and combined views.
 * Used by: Annotation Manual, Preview, and Review tables plus
 * Concordance/Quotation result tables.
 */

/** A menu row's height when none can be measured yet (a compact row is about 28px). */
const MENU_ROW_FALLBACK_PX = 28;

export function MetadataColumnSelector({
  availableColumns,
  selectedColumns,
  onSelectedColumnsChange,
  disabledColumns = [],
  sections,
  disabledReason,
}: MetadataColumnSelectorProps) {
  const normalizedAvailableColumns = normalizeMetadataColumns(availableColumns);
  const normalizedSelectedColumns = normalizeMetadataColumns(selectedColumns).filter((column) =>
    normalizedAvailableColumns.includes(column),
  );
  const useSections = Array.isArray(sections) && sections.length > 1;
  const disabledColumnSet = new Set(disabledColumns);

  // Columns that the user is allowed to toggle from this dropdown. Items in
  // sections marked `disabled` are excluded — they're shown but inert.
  // A name filter for wide tables (issue 373); Select all covers what matches.
  const [filter, setFilter] = useState('');
  // The filter shows only for lists of at least twice what the menu can show
  // at once, where scrolling gets hard (Chao, 2026-10-11).
  const [visibleRows, setVisibleRows] = useState<number | null>(null);
  const measureMenu = (node: HTMLDivElement | null) => {
    if (!node) return;
    const available = Number.parseFloat(
      getComputedStyle(node).getPropertyValue('--radix-dropdown-menu-content-available-height'),
    );
    const row = node.querySelector<HTMLElement>('[role="menuitemcheckbox"]')?.offsetHeight ?? 0;
    const height = Number.isFinite(available) && available > 0 ? available : window.innerHeight;
    const rows = Math.max(1, Math.floor(height / (row > 0 ? row : MENU_ROW_FALLBACK_PX)));
    setVisibleRows((previous) => (previous === rows ? previous : rows));
  };
  const query = filter.trim().toLocaleLowerCase();
  const showFilter = visibleRows !== null && normalizedAvailableColumns.length >= 2 * visibleRows;
  const matches = (column: string) =>
    !showFilter || !query || column.toLocaleLowerCase().includes(query);
  const selectableColumns = useSections
    ? Array.from(
        new Set(
          sections
            .filter((s) => !s.disabled)
            .flatMap((s) => normalizeMetadataColumns(s.columns))
            .filter((c) => normalizedAvailableColumns.includes(c) && !disabledColumnSet.has(c)),
        ),
      )
    : normalizedAvailableColumns.filter((column) => !disabledColumnSet.has(column));
  const matchingSelectable = selectableColumns.filter(matches);

  const allSelectableSelected =
    matchingSelectable.length > 0 &&
    matchingSelectable.every((c) => normalizedSelectedColumns.includes(c));

  /** Called by: MetadataColumnSelector checkbox items. */
  const toggleColumn = (column: string, checked: boolean) => {
    if (checked) {
      onSelectedColumnsChange(normalizeMetadataColumns([...normalizedSelectedColumns, column]));
      return;
    }

    onSelectedColumnsChange(
      normalizedSelectedColumns.filter((selectedColumn) => selectedColumn !== column),
    );
  };

  const triggerDisabled = Boolean(disabledReason);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) setFilter('');
        }}
      >
        <DisabledReasonTooltip reason={triggerDisabled ? disabledReason : undefined}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={triggerDisabled}
              aria-label="Show metadata"
            >
              Show metadata ({normalizedSelectedColumns.length})
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </DisabledReasonTooltip>
        <DropdownMenuContent ref={measureMenu} align="start" className={MENU_CLASS}>
          {showFilter ? (
            <div className="relative px-1 pb-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-2 left-3 size-3.5 text-description"
              />
              <input
                type="search"
                aria-label="Filter columns by name"
                placeholder="Filter columns…"
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                }}
                // Keep typing in the box: the menu would jump to items by letter.
                onKeyDown={(event) => {
                  if (event.key !== 'Escape' && event.key !== 'ArrowDown') event.stopPropagation();
                }}
                className="h-7 w-full rounded-sm border border-input-border bg-editor pr-2 pl-7 text-body placeholder:text-description focus:border-focus focus:outline-hidden"
              />
            </div>
          ) : null}
          <DropdownMenuCheckboxItem
            className={ITEM_CLASS}
            checked={allSelectableSelected}
            // "Select all" only operates on selectable columns; selections
            // already in disabled sections are preserved untouched.
            onCheckedChange={(checked) => {
              if (checked) {
                onSelectedColumnsChange(
                  normalizeMetadataColumns([...normalizedSelectedColumns, ...matchingSelectable]),
                );
              } else {
                onSelectedColumnsChange(
                  normalizedSelectedColumns.filter((c) => !matchingSelectable.includes(c)),
                );
              }
            }}
            onSelect={(event) => {
              event.preventDefault();
            }}
            disabled={matchingSelectable.length === 0}
          >
            {showFilter && query ? 'Select all matching' : 'Select all'}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {useSections
            ? sections.flatMap((section, sectionIdx) => {
                const items = normalizeMetadataColumns(section.columns).filter(
                  (column) => normalizedAvailableColumns.includes(column) && matches(column),
                );
                if (items.length === 0) return [];
                const out: React.ReactNode[] = [];
                if (sectionIdx > 0) {
                  out.push(<DropdownMenuSeparator key={`sep-${String(sectionIdx)}`} />);
                }
                items.forEach((column) => {
                  out.push(
                    <DropdownMenuCheckboxItem
                      key={`${String(sectionIdx)}-${column}`}
                      checked={normalizedSelectedColumns.includes(column)}
                      onCheckedChange={(checked) => {
                        toggleColumn(column, checked);
                      }}
                      onSelect={(event) => {
                        event.preventDefault();
                      }}
                      disabled={(section.disabled ?? false) || disabledColumnSet.has(column)}
                      style={section.color ? { color: section.color } : undefined}
                      className={ITEM_CLASS}
                    >
                      {column}
                    </DropdownMenuCheckboxItem>,
                  );
                });
                return out;
              })
            : normalizedAvailableColumns.filter(matches).map((column) => (
                <DropdownMenuCheckboxItem
                  key={column}
                  className={ITEM_CLASS}
                  checked={normalizedSelectedColumns.includes(column)}
                  disabled={disabledColumnSet.has(column)}
                  onCheckedChange={(checked) => {
                    toggleColumn(column, checked);
                  }}
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                >
                  {column}
                </DropdownMenuCheckboxItem>
              ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
