import React from 'react';
import { arrowTypeDisplayName, type ArrowColumn } from '@/lib/arrow/decodeArrowTable';
import { Loader2 } from 'lucide-react';
import { flexRender } from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TablePaginationFooter } from '@/features/tools/common/components/TablePaginationFooter';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RowDetailPanel } from '../../common/components/RowDetailPanel';
import { useRowDetailDialog } from '../../common/components/useRowDetailDialog';
import { type DataColumnDef, useDataTable } from '@/features/tools/common/hooks/useDataTable';
import { formatPreviewValue } from '../utils/typeUtils';
import { type PreviewRow, type PreviewPagination, PREVIEW_PAGE_SIZE_OPTIONS } from '../types';

interface PreviewTableProps {
  title: React.ReactNode;
  description: string;
  columns: string[];
  schema?: ArrowColumn[];
  data: PreviewRow[];
  pagination: PreviewPagination | null;
  loading: boolean;
  error: string | null;
  ready: boolean;
  readyMessage?: string;
  page: number;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  /** Set the current page (1-indexed). Replaces onPreviousPage / onNextPage. */
  onPageChange: (page: number) => void;
  loadingBadge?: React.ReactNode;
  documentColumn?: string;
  rowCount?: number;
}

/**
 * Builds TanStack column definitions from backend-provided preview columns.
 * `PreviewTable` uses it so all preprocessing tabs share the same value
 * formatting in table cells.
 * Called by `PreviewTable` whenever backend columns change.
 */
function buildColumnDefs(
  columnsToRender: string[],
  schema: ArrowColumn[],
): DataColumnDef<PreviewRow>[] {
  return columnsToRender.map((col) => {
    const field = schema.find((column) => column.name === col)?.field;
    return {
      accessorKey: col,
      header: () => (
        <span>
          {col}
          {field && (
            <span className="ml-2 font-normal text-description">{arrowTypeDisplayName(field)}</span>
          )}
        </span>
      ),
      cell: ({ getValue }) => formatPreviewValue(getValue()),
    };
  });
}

/**
 * Shared preview table component used across data preprocessing sub-tabs.
 * Internally backed by a server-side TanStack Table (useDataTable) for
 * consistent rendering and pagination handling.
 * Rendered by preprocessing sub-tabs that expose paginated server previews.
 * Flow: build server-table columns from preview rows, wire pagination/page-size controls,
 * render loading/error/empty states, and show the table body when preview data arrives.
 */
export function PreviewTable({
  title,
  description,
  columns,
  schema = [],
  data,
  pagination,
  loading,
  error,
  ready,
  readyMessage = 'Configure conditions to see a preview',
  page,
  pageSize,
  onPageSizeChange,
  onPageChange,
  loadingBadge,
  documentColumn,
  rowCount,
}: PreviewTableProps) {
  const columnsToRender = columns;
  const tableColSpan = Math.max(columnsToRender.length, 1);
  const currentPage = pagination?.page ?? page;
  const hasNext =
    pagination?.has_next ?? (rowCount !== undefined && currentPage * pageSize < rowCount);

  const { detailPayload, detailOpen, setDetailOpen, openDetailAt, navigation } = useRowDetailDialog(
    {
      sequenceKey: `${documentColumn ?? ''}\0${String(pageSize)}\0${columns.join('\0')}`,
      items: data,
      page: currentPage,
      hasPreviousPage: currentPage > 1,
      hasNextPage: hasNext,
      loading,
      error,
      onPageChange,
      toPayload: (row) => ({
        record: { ...row },
        textColumn:
          documentColumn && Object.prototype.hasOwnProperty.call(row, documentColumn)
            ? documentColumn
            : undefined,
      }),
    },
  );

  const columnDefs = buildColumnDefs(columnsToRender, schema);

  const table = useDataTable<PreviewRow>({
    data,
    columns: columnDefs,
    rowCount: rowCount ?? data.length,
    pageIndex: currentPage - 1,
    pageSize,
    // Bridges TanStack's zero-based pagination model to the one-based preview
    // endpoints exposed by preprocessing APIs.
    // Invoked by useDataTable when TanStack pagination changes.
    onPaginationChange: (next) => {
      if (next.pageSize !== pageSize) {
        onPageSizeChange(next.pageSize);
      }
      const newPage = next.pageIndex + 1;
      if (newPage !== currentPage) {
        onPageChange(newPage);
      }
    },
  });

  return (
    <Card>
      <CardHeader className="space-y-0 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle data-guidance="preprocessing-preview">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {loadingBadge}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {!ready ? (
          <div className="rounded-md border border-dashed border-surface-border-foreground/40 bg-panel/40 p-4 text-body text-description">
            {readyMessage}
          </div>
        ) : error ? (
          <div className="rounded-md border border-error/40 bg-error/10 p-4 text-body text-error">
            Preview unavailable. See the error notification for details.
          </div>
        ) : (
          <ScrollArea
            type="always"
            scrollbars="horizontal"
            className="rounded-lg border border-surface-border"
          >
            <Table disableContainer>
              <TableHeader className="bg-panel/40">
                {columnsToRender.length > 0 ? (
                  table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className="px-3 py-2 text-left text-label-secondary font-medium tracking-wide text-description"
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableHead className="px-3 py-2 text-left text-label-secondary font-medium tracking-wide text-description">
                      No columns
                    </TableHead>
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {loading && data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={tableColSpan}
                      className="px-3 py-6 text-center text-description"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-link" />
                        Loading preview…
                      </span>
                    </TableCell>
                  </TableRow>
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={tableColSpan}
                      className="px-3 py-6 text-center text-description"
                    >
                      No rows match the current configuration.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer transition-colors duration-150 hover:bg-panel/40"
                      onClick={() => {
                        openDetailAt(row.index);
                      }}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const cellValue = cell.getValue();
                        return (
                          <TableCell
                            key={cell.id}
                            className="max-w-xs truncate px-3 py-2 font-mono text-label-secondary text-foreground"
                            title={formatPreviewValue(cellValue)}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
      {ready && !error && (
        <CardFooter className="block border-t border-surface-border p-0">
          <TablePaginationFooter
            table={table}
            pageIndex={currentPage - 1}
            pageSize={pageSize}
            hasNext={hasNext}
            rowCount={rowCount}
            loading={loading}
            pageSizeOptions={PREVIEW_PAGE_SIZE_OPTIONS}
          />
        </CardFooter>
      )}

      <RowDetailPanel
        open={detailOpen}
        onOpenChange={setDetailOpen}
        payload={detailPayload}
        navigation={navigation}
      />
    </Card>
  );
}
