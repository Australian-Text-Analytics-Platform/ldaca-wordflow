import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ChartImageDownloadDialog } from '@/components/ui/ChartImageDownloadDialog';
import {
  type AgreementMatrixImage,
  downloadAgreementMatrixImage,
} from '@/features/views/common/agreementMatrixImage';
import { toastError } from '@/lib/toastError';

interface AgreementMatrixDownloadButtonProps {
  /** Names what is saved, such as "Download confusion matrix". */
  label: string;
  onClick: () => void;
}

/**
 * The Download button at the top of a reliability popup (Chao, 19 Nov 2026).
 * Used by: `ColumnComparisonHeader` and `MultiCoderAlphaBadge`. It only opens
 * the format dialog, which lives outside the popup so it stays open after the
 * popup closes.
 */
export function AgreementMatrixDownloadButton({
  label,
  onClick,
}: AgreementMatrixDownloadButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 shrink-0 gap-1.5 px-2"
      aria-label={label}
      title={label}
      onClick={(event) => {
        // The popup is portalled, but React still bubbles the click to the column header.
        event.stopPropagation();
        onClick();
      }}
    >
      <Download aria-hidden="true" className="size-3.5" />
      Download
    </Button>
  );
}

interface AgreementMatrixDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Built when Download is chosen, so the image has the latest counts. */
  image: () => AgreementMatrixImage;
  /** The file name before the suffix, such as the Data Block's name. */
  fileStem: string;
  /** Ends the file name, such as "confusion_matrix" or "coincidence_matrix_preview". */
  fileSuffix: string;
}

/** The SVG, PNG or JPEG choice for a reliability popup's image, as for the charts. */
export function AgreementMatrixDownloadDialog({
  open,
  onOpenChange,
  title,
  image,
  fileStem,
  fileSuffix,
}: AgreementMatrixDownloadDialogProps) {
  return (
    <ChartImageDownloadDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onConfirm={(format) => {
        void downloadAgreementMatrixImage(image(), { fileStem, fileSuffix, format }).catch(
          (error: unknown) => {
            toastError(error, 'Try again.', { title: "Couldn't download the matrix." });
          },
        );
      }}
    />
  );
}
