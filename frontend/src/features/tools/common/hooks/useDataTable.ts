/** Shared controlled table state for paginated data and captured SQL results. */
import {
  columnVisibilityFeature,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type RowData,
} from '@tanstack/react-table';

const dataTableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
});

type DataTableFeatures = typeof dataTableFeatures;
export type DataColumnDef<TData extends RowData, TValue = unknown> = ColumnDef<
  DataTableFeatures,
  TData,
  TValue
>;
export interface DataTableOptions<TData extends RowData> {
  data: TData[];
  columns: DataColumnDef<TData>[];
  rowCount: number;
  pageIndex?: number;
  pageSize?: number;
  onPaginationChange?: (pagination: PaginationState) => void;
}

/** Pagination belongs to the caller; no data is fetched here. */
export function useDataTable<TData extends RowData>({
  data,
  columns,
  rowCount,
  pageIndex = 0,
  pageSize = 20,
  onPaginationChange,
}: DataTableOptions<TData>) {
  /** Converts table pagination updates into caller-owned backend paging params. */
  /** Passed to: TanStack Table as `onPaginationChange`. */
  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const current = { pageIndex, pageSize };
    const next = typeof updater === 'function' ? updater(current) : updater;
    onPaginationChange?.(next);
  };

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    manualPagination: true,
    rowCount,
    state: {
      pagination: { pageIndex, pageSize },
    },
    onPaginationChange: handlePaginationChange,
  });

  return table;
}
