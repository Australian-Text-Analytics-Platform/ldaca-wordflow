export const DATA_BLOCK_EXPORT_FORMATS = [
  { value: 'csv', label: 'CSV (.csv)', extension: 'csv' },
  { value: 'json', label: 'JSON (.json)', extension: 'json' },
  { value: 'ndjson', label: 'NDJSON (.ndjson)', extension: 'ndjson' },
  { value: 'parquet', label: 'Parquet (.parquet)', extension: 'parquet' },
  { value: 'ipc', label: 'Arrow IPC (.arrow)', extension: 'arrow' },
] as const;
export type DataBlockExportFormat = (typeof DATA_BLOCK_EXPORT_FORMATS)[number]['value'];

export interface DataBlockExportSelection {
  id: string;
  name: string;
}
