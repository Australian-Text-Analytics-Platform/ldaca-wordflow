import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useFilePreview } from '../hooks/useFilePreview';
import { FilePreviewContent } from './FilePreviewContent';
import { CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface AddFilePanelProps {
  filename: string | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

/**
 * Confirmation panel opened by the data loader before a selected file becomes
 * a workspace block. `FilePreviewContent` is the sole Dialog owner; this
 * component only gates its body so preview hooks run for a concrete open file.
 * Rendered by: DataLoaderFeature when a pending upload needs confirmation.
 * Flow: combine open state with filename presence, then mount the preview
 * content that owns the single focus, escape, and close lifecycle.
 */
export function AddFilePanel({ filename, open, onClose, onConfirm }: AddFilePanelProps) {
  if (!open || !filename) return null;
  return <AddFilePanelBody filename={filename} onClose={onClose} onConfirm={onConfirm} />;
}

/**
 * File-add dialog body. Shows preview rows before delegating the actual add
 * operation back to the data-loader feature via FilePreviewContent. A
 * workbook with several sheets opens the Add window with one row per sheet
 * instead (issue 323), so this window shows no Sheet menu.
 */
function AddFilePanelBody({
  filename,
  onClose,
  onConfirm,
}: Omit<AddFilePanelProps, 'open'> & { filename: string }) {
  const {
    previewData,
    columns,
    loading,
    error,
    fileType,
    sheetNames,
    selectedSheet,
    setSelectedSheet,
  } = useFilePreview(filename, true, null, null);

  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    try {
      setSubmitting(true);
      await onConfirm();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <CardFooter className="border-t px-6 py-4">
      <div className="flex w-full items-center justify-end gap-2">
        <Button variant="outline" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => {
            void handleConfirm();
          }}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding…
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Add to Project
            </>
          )}
        </Button>
      </div>
    </CardFooter>
  );

  return (
    <FilePreviewContent
      filename={filename}
      open
      onClose={onClose}
      data={{
        previewData,
        columns,
        loading,
        error,
        fileType,
        sheetNames,
        selectedSheet,
        setSelectedSheet,
      }}
      title={`Add File: ${filename}`}
      description="Check the preview, then add the file to the Project as a Data Block."
      footer={footer}
    />
  );
}
