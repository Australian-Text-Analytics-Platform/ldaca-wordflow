import {
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  type ColumnPinningState,
  type ColumnSizingState,
  type Column,
  type ColumnDef,
} from '@tanstack/react-table';
import type { DataRow } from '../types';

interface ProjectColumnMeta {
  headerClassName?: string;
  headerMinWidth?: number;
  headerMaxWidth?: number;
  cellClassName?: string;
  cellMinWidth?: number;
  cellMaxWidth?: number;
}

export const projectTableFeatures = tableFeatures({
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: metaHelper<ProjectColumnMeta>(),
});

export type ProjectTableColumn = Column<typeof projectTableFeatures, DataRow>;
export type ProjectTableColumnDef = ColumnDef<typeof projectTableFeatures, DataRow>;

export interface TablePreferences {
  widths: ColumnSizingState;
  pinning: ColumnPinningState;
  expanded: Record<string, boolean>;
}
export const defaultTablePreferences: TablePreferences = {
  widths: {},
  pinning: { start: [], end: [] },
  expanded: {},
};
