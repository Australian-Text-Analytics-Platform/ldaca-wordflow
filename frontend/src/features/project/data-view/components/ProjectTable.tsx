import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  SortingState,
  Updater,
  PaginationState as TanstackPaginationState,
} from '@tanstack/react-table';
import { type ColumnPinningState, flexRender, useTable } from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DatetimeFormatPanel } from '@/features/tools/common/components/DatetimeFormatPanel';
import { RowDetailPanel } from '@/features/tools/common/components/RowDetailPanel';
import { useRowDetailDialog } from '@/features/tools/common/components/useRowDetailDialog';
import { TablePaginationFooter } from '@/features/tools/common/components/TablePaginationFooter';
import { ProjectColumnHeader } from './ProjectColumnHeader';
import { SqlTypeDialog } from './SqlTypeDialog';
import { TopicCoverageBar } from './TopicCoverageBar';
import type { DataRow, NodeTablePagination } from '../types';
import { type ArrowField } from '@/lib/arrow/decodeArrowTable';
import { isTopicCoverageField } from '@/lib/arrow/semanticTypes';
import {
  DATA_TYPES,
  getTypeDisplayName,
  columnCastIdentity,
  type ColumnCastType,
} from '../services/schemaMutations';
import { useColumnMutations } from '../hooks/useColumnMutations';
import {
  projectTableFeatures,
  defaultTablePreferences,
  type TablePreferences,
  type ProjectTableColumn,
  type ProjectTableColumnDef,
} from './projectTableFeatures';

// --- Constants ---
const WIDE_COLUMN_THRESHOLD = 120;
const COLLAPSED_COLUMN_MAX_WIDTH = 320;
const EXPANDED_COLUMN_MAX_WIDTH = 960;
const WIDE_COLUMN_SAMPLE_LIMIT = 25;
const ROW_ACTIONS_WIDTH = 72;

// --- Props ---
export interface ProjectTableProps {
  base?: string;
  data: DataRow[];
  preferences?: TablePreferences;
  onPreferencesChange?: (preferences: TablePreferences) => void;
  /** Optional host-owned cell editor. Returning undefined keeps the read-only renderer. */
  renderCell?: (rowIndex: number, column: string) => ReactNode;
  columnHeaderExtra?: (column: string) => ReactNode;
  rowIds?: readonly string[];
  rowActions?: { header?: ReactNode; render: (rowIndex: number) => ReactNode };

  columns: string[];
  columnFields: Record<string, ArrowField>;
  loading?: boolean;
  /** Background fetch state that must not replace the current table shell. */
  fetching?: boolean;
  /** Page-query failure used by transparent Row Details navigation. */
  pageError?: unknown;
  projectKey?: string;
  nodeId?: string;
  nodeLabel?: string;
  documentColumn?: string;
  onCast?: (column: string, targetType: ColumnCastType, format?: string) => Promise<void>;
  onRenameColumn?: (column: string, nextName: string) => Promise<void>;
  onDeleteColumn?: (column: string) => Promise<void>;
  onMutationError?: (error: unknown) => void;

  /** Server-side pagination info (1-indexed page from backend). */
  pagination?: NodeTablePagination;
  /** Trustworthy total row count used by TanStack for exact page bounds. */
  rowCount?: number;
  /** Arrow page lookahead used only when the Data Block row count is unknown. */
  hasNext?: boolean;

  // Server-side state callbacks
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

/**
 * Server-backed data table for the selected project node. It owns table UI
 * state while delegating column mutations and row detail display to helpers.
 * Rendered by `NativeDataView` as the selected node's server-backed row surface.
 * Flow: server rows enter TanStack Table, UI handlers update sorting/filtering/pagination, and column actions call project mutations.
 */
export function ProjectTable({
  base = '',
  data,
  preferences,
  onPreferencesChange,
  renderCell,
  columnHeaderExtra,
  rowIds,
  rowActions,
  columns: responseColumns,
  columnFields,
  loading = false,
  fetching = false,
  pageError,
  projectKey,
  nodeId,
  nodeLabel,
  documentColumn,
  onCast,
  onRenameColumn,
  onDeleteColumn,
  onMutationError,
  pagination,
  rowCount,
  hasNext,
  sorting = [],
  onSortingChange,
  onPageChange,
  onPageSizeChange,
}: ProjectTableProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [localPreferences, setLocalPreferences] = useState(defaultTablePreferences);
  const currentPreferences = preferences ?? localPreferences;
  const {
    expanded: expandedColumns,
    pinning: columnPinning,
    widths: columnSizing,
  } = currentPreferences;
  const changePreferences = (patch: Partial<TablePreferences>) => {
    const next = { ...currentPreferences, ...patch };
    if (onPreferencesChange) onPreferencesChange(next);
    else setLocalPreferences(next);
  };
  const setExpandedColumns = (updater: Updater<Record<string, boolean>>) => {
    changePreferences({
      expanded: typeof updater === 'function' ? updater(expandedColumns) : updater,
    });
  };
  const setColumnPinning = (updater: Updater<ColumnPinningState>) => {
    changePreferences({
      pinning: typeof updater === 'function' ? updater(columnPinning) : updater,
    });
  };
  const sanitizedData = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const backendColumns = useMemo(
    () => responseColumns.filter((column) => column.trim().length > 0),
    [responseColumns],
  );

  // A cached owner switch may not enter the loading branch, so reset the
  // viewport explicitly when the project or Data Block identity changes.
  useEffect(() => {
    if (!viewportRef.current) return;
    viewportRef.current.scrollLeft = 0;
    viewportRef.current.scrollTop = 0;
  }, [projectKey, nodeId]);

  const mutations = useColumnMutations({
    nodeName: nodeLabel ?? nodeId,
    columnFields,
    onCast,
    onRenameColumn,
    onDeleteColumn,
    onError: onMutationError,
  });

  const {
    columnFields: mutationColumnFields,
    loadingCast,
    columnActionLoading,
    renamingColumn,
    datetimeModal,
    closeDatetimeModal,
    handleDatetimeFormatConfirm,
    sqlTypeModal,
    requestSqlType,
    closeSqlTypeModal,
    confirmSqlType,
    deleteColumnDialogOpen,
    setDeleteColumnDialogOpen,
    columnToDelete,
    requestDeleteColumn,
    confirmDeleteColumn,
    handleTypeChange,
    startRename,
    cancelRename,
    submitRename,
  } = mutations;

  const columns = useMemo(() => {
    if (backendColumns.length > 0) return backendColumns;
    return Object.keys(mutationColumnFields);
  }, [backendColumns, mutationColumnFields]);

  const wideColumns = useMemo(() => {
    const sampleRows = sanitizedData.slice(0, WIDE_COLUMN_SAMPLE_LIMIT);
    const result = new Set<string>();
    columns.forEach((col) => {
      let maxLen = col.length;
      for (const row of sampleRows) {
        // DataRow is typed non-null, but rows arrive from API/JSON so guard malformed (null) rows.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!row || typeof row !== 'object') continue;
        const raw = row[col];
        if (raw == null) continue;
        // Cell values may be objects; default stringification matches the existing width heuristic.
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const display = typeof raw === 'string' ? raw : String(raw);
        maxLen = Math.max(maxLen, display.length);
        if (maxLen > WIDE_COLUMN_THRESHOLD) {
          result.add(col);
          break;
        }
      }
    });
    return result;
  }, [columns, sanitizedData]);

  /**
   * Cycles one column through ascending, descending, and unsorted states.
   * Passed to `ProjectColumnHeader` as `onSort`.
   * Flow: inspect the current column sort state, choose the next asc/desc/none state, emit sorting changes, and reset to page one.
   */
  const handleSort = (columnId: string) => {
    const current = sorting.find((s) => s.id === columnId);
    let next: SortingState;
    if (!current) {
      next = [{ id: columnId, desc: false }];
    } else if (!current.desc) {
      next = [{ id: columnId, desc: true }];
    } else {
      next = [];
    }
    onSortingChange?.(next);
    onPageChange?.(1);
  };

  // Build column definitions
  const columnDefs: ProjectTableColumnDef[] = columns.map((column) => {
    const currentField = mutationColumnFields[column];
    const currentType = currentField ? columnCastIdentity(currentField) : 'unknown';
    const isColumnLoading = Boolean(loadingCast[column]);
    const isColumnMutating = Boolean(columnActionLoading[column]);
    const isColumnBusy = isColumnLoading || isColumnMutating;
    const displayLabel =
      DATA_TYPES.find((type) => type.value === currentType)?.label ??
      getTypeDisplayName(currentField);
    const availableTypes = [
      { value: currentType, label: displayLabel },
      ...DATA_TYPES.filter((t) => t.value !== currentType && t.label !== displayLabel),
    ];
    const isWideColumn = wideColumns.has(column);
    const isExpandedColumn = expandedColumns[column] === true;
    const isCollapsedColumn = isWideColumn && !isExpandedColumn;

    const sortState = sorting.find((s) => s.id === column);

    /**
     * Toggles wide-column expansion without storing false entries.
     * Passed to this column's `ProjectColumnHeader` as `onToggleExpand`.
     */
    const onToggleExpand = () => {
      setExpandedColumns((prev) => {
        if (prev[column]) {
          const { [column]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [column]: true };
      });
    };

    return {
      id: column,
      /**
       * Reads row values by dynamic project column name for TanStack Table.
       * Invoked by TanStack Table for each row in this column.
       */
      accessorFn: (row) => row[column],
      /**
       * Renders the interactive project column header controls.
       * Invoked by TanStack Table for this column's header cell.
       * Flow: pass column state, filter state, and mutation handlers into the lifted header component.
       */
      header: ({ column: colInst }) => (
        <div className="space-y-1">
          <ProjectColumnHeader
            column={column}
            colInst={colInst}
            currentType={currentType}
            displayLabel={displayLabel}
            availableTypes={availableTypes}
            onMoreTypes={() => {
              requestSqlType(column);
            }}
            isColumnBusy={isColumnBusy}
            isRenaming={renamingColumn === column}
            canCast={Boolean(onCast && onMutationError)}
            canRename={Boolean(onRenameColumn && onMutationError)}
            canDelete={Boolean(onDeleteColumn && onMutationError)}
            isWideColumn={isWideColumn}
            isCollapsedColumn={isCollapsedColumn}
            onToggleExpand={onToggleExpand}
            sortState={sortState ? { id: sortState.id, desc: sortState.desc } : undefined}
            onSort={() => {
              handleSort(column);
            }}
            onStartRename={() => {
              startRename(column);
            }}
            onSubmitRename={submitRename}
            onCancelRename={cancelRename}
            onTypeChange={(newType) => {
              handleTypeChange(column, newType);
            }}
            onRequestDelete={() => {
              requestDeleteColumn(column);
            }}
          />
          {columnHeaderExtra?.(column)}
        </div>
      ),
      /**
       * Renders a compact display value while preserving full text in the title.
       * Called by TanStack Table for each visible body cell in this column.
       */
      cell: ({ getValue }) => {
        const cellValue = getValue();
        // This renderer is selected by the exact extension identity published
        // in IPC metadata, not by a second frontend dtype alias.
        if (isTopicCoverageField(currentField)) {
          return <TopicCoverageBar value={cellValue} />;
        }
        // Cell values may be structs/objects; default stringification preserves prior display text.
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const displayValue = cellValue == null ? '' : String(cellValue);
        return (
          <span className="block truncate" title={displayValue}>
            {displayValue}
          </span>
        );
      },
      meta: {
        headerClassName: 'whitespace-nowrap border-r border-surface-border/70 px-2 py-2 text-left',
        headerMaxWidth: isWideColumn
          ? isCollapsedColumn
            ? COLLAPSED_COLUMN_MAX_WIDTH
            : EXPANDED_COLUMN_MAX_WIDTH
          : undefined,
        cellClassName:
          'whitespace-nowrap border-r border-surface-border/60 px-2 py-1.5 text-body text-foreground',
        cellMaxWidth: isWideColumn
          ? isCollapsedColumn
            ? COLLAPSED_COLUMN_MAX_WIDTH
            : EXPANDED_COLUMN_MAX_WIDTH
          : undefined,
      },
    } satisfies ProjectTableColumnDef;
  });

  // TanStack Table instance (server-side)
  const pageIndex = pagination ? pagination.page - 1 : 0;
  const pageSize = pagination?.page_size ?? 20;
  const totalRows = rowCount;
  // Snapshot editors/local results supply totals; ordinary node pages use lookahead.
  const usesLookaheadPagination = rowCount === undefined && hasNext !== undefined;

  /**
   * Bridges TanStack pagination updates to server pagination callbacks.
   * Passed to `useTable` as `onPaginationChange`.
   */
  const handlePaginationChange = (
    updater: TanstackPaginationState | ((prev: TanstackPaginationState) => TanstackPaginationState),
  ) => {
    const current = { pageIndex, pageSize };
    const next = typeof updater === 'function' ? updater(current) : updater;
    if (next.pageSize !== pageSize || next.pageIndex !== pageIndex) {
      if (viewportRef.current) viewportRef.current.scrollTop = 0;
    }
    if (next.pageSize !== pageSize) onPageSizeChange?.(next.pageSize);
    if (next.pageIndex !== pageIndex) onPageChange?.(next.pageIndex + 1);
  };

  /**
   * Bridges TanStack sorting updates to server sorting callbacks.
   * Passed to `useTable` as `onSortingChange`.
   */
  const handleSortingChangeInternal = (
    updater: SortingState | ((prev: SortingState) => SortingState),
  ) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    onSortingChange?.(next);
    onPageChange?.(1);
  };

  const tableInstance = useTable({
    features: projectTableFeatures,
    data: sanitizedData,
    getRowId: (_row, index) => rowIds?.[index] ?? String(index),
    columns: columnDefs,
    manualPagination: true,
    manualSorting: true,
    rowCount: usesLookaheadPagination ? undefined : totalRows,
    pageCount: usesLookaheadPagination ? pageIndex + 1 + (hasNext ? 1 : 0) : undefined,
    state: {
      pagination: { pageIndex, pageSize },
      sorting,
      columnPinning,
      columnSizing,
    },
    onPaginationChange: handlePaginationChange,
    onSortingChange: handleSortingChangeInternal,
    onColumnPinningChange: setColumnPinning,
    onColumnSizingChange: (updater) => {
      changePreferences({
        widths: typeof updater === 'function' ? updater(columnSizing) : updater,
      });
    },
  });

  /**
   * Computes sticky styles for pinned TanStack columns.
   * Called while rendering pinned header and body cells.
   * Flow: read the column pin state, set sticky offsets, then add edge shadows for pinned sides.
   */
  const getPinnedStyles = (
    col: ProjectTableColumn,
    variant: 'header' | 'cell',
  ): React.CSSProperties | undefined => {
    const pinState = col.getIsPinned();
    if (!pinState) return undefined;
    const style: React.CSSProperties = {
      position: 'sticky',
      zIndex: variant === 'header' ? 30 : 5,
    };
    if (variant === 'header') style.top = 0;
    if (pinState === 'start') {
      style.insetInlineStart = `${String(col.getStart('start') + (rowActions ? ROW_ACTIONS_WIDTH : 0))}px`;
      style.boxShadow = '2px 0 0 -1px var(--vscode-surface-border)';
    } else {
      style.insetInlineEnd = `${String(col.getStart('end'))}px`;
      style.boxShadow = '-2px 0 0 -1px var(--vscode-surface-border)';
    }
    return style;
  };

  const tableRows = tableInstance.getRowModel().rows;
  const visibleColumnCount =
    Math.max(tableInstance.getVisibleLeafColumns().length, 1) + (rowActions ? 1 : 0);
  const hasPreviousPage = pageIndex > 0;
  const hasNextPage = usesLookaheadPagination
    ? hasNext
    : totalRows !== undefined && (pageIndex + 1) * pageSize < totalRows;
  const { detailPayload, detailOpen, setDetailOpen, openDetailAt, navigation } = useRowDetailDialog(
    {
      sequenceKey: `${projectKey ?? ''}\0${nodeId ?? ''}\0${String(pageSize)}\0${JSON.stringify(sorting)}`,
      items: sanitizedData,
      page: pageIndex + 1,
      hasPreviousPage,
      hasNextPage,
      loading: fetching,
      error: pageError,
      onPageChange: (nextPage) => {
        onPageChange?.(nextPage);
      },
      toPayload: (row) => ({
        record: { ...row },
        textColumn:
          documentColumn && Object.prototype.hasOwnProperty.call(row, documentColumn)
            ? documentColumn
            : undefined,
      }),
    },
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-3">
          <Loader2 className="h-6 w-6 animate-spin text-link" />
          <span className="text-body font-medium text-description">Loading data...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full w-full flex-col min-h-0">
        <ScrollArea viewportRef={viewportRef} scrollbars="both" className="flex-1 bg-surface">
          <Table disableContainer className="w-max table-auto">
            <TableHeader className="sticky top-0 z-20 bg-panel">
              {tableInstance.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {rowActions && (
                    <TableHead
                      className="sticky start-0 z-40 border-r border-surface-border bg-panel px-1"
                      style={{
                        width: ROW_ACTIONS_WIDTH,
                        minWidth: ROW_ACTIONS_WIDTH,
                        maxWidth: ROW_ACTIONS_WIDTH,
                      }}
                    >
                      {rowActions.header ?? <span className="sr-only">Row actions</span>}
                    </TableHead>
                  )}
                  {hg.headers.map((header) => {
                    const meta = header.column.columnDef.meta;
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(
                          meta?.headerClassName,
                          'h-8 px-1 py-1 last:border-r-0',
                          header.column.getIsPinned() ? 'bg-panel' : 'bg-panel',
                        )}
                        style={{
                          ...(meta?.headerMinWidth
                            ? { minWidth: `${String(meta.headerMinWidth)}px` }
                            : {}),
                          ...(meta?.headerMaxWidth !== undefined
                            ? {
                                maxWidth: `${String(meta.headerMaxWidth)}px`,
                                width: `${String(meta.headerMaxWidth)}px`,
                                overflow: 'hidden',
                              }
                            : {}),
                          ...(meta?.headerMinWidth || meta?.headerMaxWidth !== undefined
                            ? {
                                transition:
                                  'max-width 200ms ease, width 200ms ease, min-width 200ms ease',
                              }
                            : {}),
                          ...getPinnedStyles(header.column, 'header'),
                        }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody className="divide-y divide-border/60 bg-surface">
              {tableRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer transition-colors duration-150 hover:bg-panel/40 [&>td]:px-1 [&>td]:py-1"
                  onClick={() => {
                    if (!renderCell) openDetailAt(row.index);
                  }}
                >
                  {rowActions && (
                    <TableCell
                      className="sticky start-0 z-10 border-r border-surface-border bg-surface"
                      style={{
                        width: ROW_ACTIONS_WIDTH,
                        minWidth: ROW_ACTIONS_WIDTH,
                        maxWidth: ROW_ACTIONS_WIDTH,
                      }}
                    >
                      {rowActions.render(row.index)}
                    </TableCell>
                  )}
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    const editor = renderCell?.(row.index, cell.column.id);
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          meta?.cellClassName,
                          'last:border-r-0',
                          cell.column.getIsPinned() ? 'bg-surface' : undefined,
                        )}
                        style={{
                          ...(meta?.cellMinWidth
                            ? { minWidth: `${String(meta.cellMinWidth)}px` }
                            : {}),
                          ...(meta?.cellMaxWidth !== undefined
                            ? {
                                maxWidth: `${String(meta.cellMaxWidth)}px`,
                                width: `${String(meta.cellMaxWidth)}px`,
                                overflow: 'hidden',
                              }
                            : {}),
                          ...(meta?.cellMinWidth || meta?.cellMaxWidth !== undefined
                            ? {
                                transition:
                                  'max-width 200ms ease, width 200ms ease, min-width 200ms ease',
                              }
                            : {}),
                          ...getPinnedStyles(cell.column, 'cell'),
                        }}
                      >
                        {editor !== undefined
                          ? editor
                          : flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {tableRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumnCount}
                    className="px-4 py-6 text-center text-body text-description"
                  >
                    No rows to display
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
        <TablePaginationFooter
          table={tableInstance}
          pageIndex={pageIndex}
          pageSize={pageSize}
          rowCount={usesLookaheadPagination ? undefined : totalRows}
          hasNext={usesLookaheadPagination ? hasNext : undefined}
          loading={fetching}
          compact
        />
      </div>

      <DatetimeFormatPanel
        open={datetimeModal !== null}
        onClose={closeDatetimeModal}
        onConfirm={handleDatetimeFormatConfirm}
        columnName={datetimeModal?.column ?? ''}
      />
      {sqlTypeModal && (
        <SqlTypeDialog
          base={base}
          column={sqlTypeModal.column}
          nodeName={sqlTypeModal.nodeName}
          applying={loadingCast[sqlTypeModal.column] ?? false}
          onClose={closeSqlTypeModal}
          onCast={confirmSqlType}
        />
      )}

      <AlertDialog open={deleteColumnDialogOpen} onOpenChange={setDeleteColumnDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete column</AlertDialogTitle>
            <AlertDialogDescription>
              Delete column &quot;{columnToDelete}&quot; from this Data Block? You can undo this
              while the Project remains open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-button-foreground hover:bg-error/90"
              onClick={() => {
                void confirmDeleteColumn();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RowDetailPanel
        open={detailOpen}
        onOpenChange={setDetailOpen}
        payload={detailPayload}
        navigation={navigation}
      />
    </>
  );
}
