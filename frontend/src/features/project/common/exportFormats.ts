export const DATA_BLOCK_EXPORT_FORMATS = [
  { value: 'csv', label: 'CSV (.csv)', extension: 'csv' },
  { value: 'xlsx', label: 'Excel (.xlsx)', extension: 'xlsx' },
  { value: 'json', label: 'JSON (.json)', extension: 'json' },
  { value: 'parquet', label: 'Parquet (.parquet)', extension: 'parquet' },
] as const;
export type DataBlockExportFormat = (typeof DATA_BLOCK_EXPORT_FORMATS)[number]['value'];

export interface DataBlockExportSelection {
  id: string;
  name: string;
}
