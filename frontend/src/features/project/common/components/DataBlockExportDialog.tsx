import { useState } from 'react';
import type { DataBlockExportFormat } from '@/features/project/common/exportFormats';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DATA_BLOCK_EXPORT_FORMATS, type DataBlockExportSelection } from '../exportFormats';
import { toast } from 'sonner';

interface DataBlockExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataBlock: DataBlockExportSelection;
  onExport: (format: DataBlockExportFormat) => Promise<string | null>;
  onError: (error: unknown) => void;
}

/** Chooses a format and downloads exactly one Data Block directly. */
export function DataBlockExportDialog({
  open,
  onOpenChange,
  dataBlock,
  onExport,
  onError,
}: DataBlockExportDialogProps) {
  const [format, setFormat] = useState<DataBlockExportFormat>('csv');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const filename = await onExport(format);
      if (filename === null) return;
      toast.success('Data Block exported');
      onOpenChange(false);
    } catch (error) {
      onError(error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <DialogHeader>
          <DialogTitle className="break-all">Export &ldquo;{dataBlock.name}&rdquo;</DialogTitle>
          <DialogDescription>
            {exporting
              ? 'Export continues after closing this dialog. Cancel it in the Task Centre.'
              : 'Choose a format. This Data Block will download as one file.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor={`node-export-format-${dataBlock.id}`} className="text-body font-medium">
            Format
          </label>
          <Select
            value={format}
            disabled={exporting}
            onValueChange={(value) => {
              const next = DATA_BLOCK_EXPORT_FORMATS.find((candidate) => candidate.value === value);
              if (next) setFormat(next.value);
            }}
          >
            <SelectTrigger id={`node-export-format-${dataBlock.id}`} aria-label="Export format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATA_BLOCK_EXPORT_FORMATS.map((candidate) => (
                <SelectItem key={candidate.value} value={candidate.value}>
                  {candidate.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {exporting ? 'Close' : 'Cancel'}
          </Button>
          <Button type="button" disabled={exporting} onClick={() => void handleExport()}>
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
