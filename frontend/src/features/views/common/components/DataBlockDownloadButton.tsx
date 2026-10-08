import { useState } from 'react';
import { Download } from 'lucide-react';
import type { DataBlockExportFormat } from '@/api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadDataBlocks } from '@/features/workspace/common/dataBlockExport';
import { toastError } from '@/lib/toastError';

interface DataBlockDownloadButtonProps {
  workspaceId: string;
  nodeId: string;
  nodeName: string;
  /** Names what is downloaded, for the button's label, e.g. "Annotation table". */
  label?: string;
  /** Class for the trigger, to match a toolbar's smaller buttons. */
  className?: string;
}

const FORMATS: { value: DataBlockExportFormat; label: string }[] = [
  { value: 'csv', label: 'CSV (.csv)' },
  { value: 'xlsx', label: 'Excel (.xlsx)' },
];

/**
 * The small download icon on a table that shows a whole Data Block (issue
 * 352): saves it as CSV or Excel straight away, as the Export view would,
 * without going through Export.
 * Used by: the Annotation tables and the Data Editor.
 */
export function DataBlockDownloadButton({
  workspaceId,
  nodeId,
  nodeName,
  label = 'table',
  className,
}: DataBlockDownloadButtonProps) {
  const [busy, setBusy] = useState(false);
  const download = async (format: DataBlockExportFormat) => {
    setBusy(true);
    try {
      await downloadDataBlocks({
        workspaceId,
        workspaceName: nodeName,
        dataBlocks: [{ id: nodeId, name: nodeName }],
        format,
      });
    } catch (cause) {
      toastError(cause, 'Try again.', { title: `Couldn't download the ${label}.` });
    } finally {
      setBusy(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          className={className}
          aria-label={`Download ${label}`}
          title={`Download ${label}`}
        >
          <Download className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {FORMATS.map((format) => (
          <DropdownMenuItem
            key={format.value}
            onSelect={() => {
              void download(format.value);
            }}
          >
            {format.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
