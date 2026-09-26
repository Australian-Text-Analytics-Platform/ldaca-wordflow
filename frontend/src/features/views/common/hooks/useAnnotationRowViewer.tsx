import { RowDetailPanel, type RowDetailPayload } from '../components/RowDetailPanel';
import { useRowDetailDialog } from '../components/useRowDetailDialog';

interface UseAnnotationRowViewerOptions<T> {
  sequenceKey: string;
  rows: readonly T[];
  /** One-based page shown by the table. */
  page: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  loading: boolean;
  onPageChange: (page: number) => void;
  toPayload: (row: T) => RowDetailPayload;
}

/**
 * Row viewer for the annotator tables: the shared Row Details dialog with
 * previous/next navigation across pages. Returns the opener and the dialog.
 */
export function useAnnotationRowViewer<T>(options: UseAnnotationRowViewerOptions<T>) {
  const { detailPayload, detailOpen, setDetailOpen, openDetailAt, navigation } = useRowDetailDialog(
    { ...options, items: options.rows },
  );
  const dialog = (
    <RowDetailPanel
      open={detailOpen}
      onOpenChange={setDetailOpen}
      payload={detailPayload}
      customization={{ label: 'Annotation' }}
      navigation={navigation}
    />
  );
  return { openRowAt: openDetailAt, rowViewer: dialog };
}
