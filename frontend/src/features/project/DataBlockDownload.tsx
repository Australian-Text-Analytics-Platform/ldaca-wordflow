import { useState } from 'react';
import { OperationError } from './OperationError';
import { exportNode } from './filesApi';
import type { DataBlockExportFormat } from './common/exportFormats';
import { targetLabel, type DataTarget } from './objects';
import { DownloadButton, DownloadDialog } from '@/features/tools/common/components/DownloadControl';

export function DataBlockDownload({ base, target }: { base: string; target: DataTarget }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <div>
      <DownloadButton label="Download Data Block" onClick={() => setOpen(true)} />
      <DownloadDialog<DataBlockExportFormat>
        open={open}
        onOpenChange={setOpen}
        title={`Download ${targetLabel(target)}`}
        description="Downloads all committed database rows. Unapplied Editor previews are excluded."
        formats={(['csv', 'xlsx', 'json', 'parquet'] as const).map((value) => ({
          value,
          label: value.toUpperCase(),
        }))}
        defaultFormat="csv"
        formatLabel="Data Block download format"
        onExport={(format) => {
          setError(null);
          return exportNode(base, target, format);
        }}
        onError={setError}
      />
      {error !== null && <OperationError title="Could not download Data Block" error={error} />}
    </div>
  );
}
