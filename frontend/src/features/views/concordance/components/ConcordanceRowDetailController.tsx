import { useEffect, useRef, useState, type ReactNode } from 'react';

import { RowDetailPanel } from '../../common/components/RowDetailPanel';
import { useRowDetailDialog } from '../../common/components/useRowDetailDialog';
import {
  buildConcordanceRowDetailCustomization,
  buildConcordanceRowDetailPayload,
  orderedConcordanceHits,
  type ConcordanceRowDetailItem,
  type ConcordanceRowDetailView,
} from '../concordanceRowDetail';

interface ConcordanceRowDetailControllerProps {
  sequenceKey: string;
  items: ConcordanceRowDetailItem[];
  page: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  loading: boolean;
  error?: unknown;
  onPageChange: (page: number) => void;
  searchWord: string;
  /** Table (one colour) or Dispersion (legend colours) (issue 429). */
  view: ConcordanceRowDetailView;
  children: (openDetailAt: (index: number) => void) => ReactNode;
}

/** Keeps Concordance-specific detail rendering beside each paginated result card. */
export function ConcordanceRowDetailController({
  sequenceKey,
  items,
  page,
  hasPreviousPage,
  hasNextPage,
  loading,
  error,
  onPageChange,
  searchWord,
  view,
  children,
}: ConcordanceRowDetailControllerProps) {
  const { detailPayload, selectedItem, detailOpen, setDetailOpen, openDetailAt, navigation } =
    useRowDetailDialog({
      sequenceKey,
      items,
      page,
      hasPreviousPage,
      hasNextPage,
      loading,
      error,
      onPageChange,
      toPayload: buildConcordanceRowDetailPayload,
    });
  // Dispersion steps through matches, like the Topic Modelling segment viewer,
  // and moves on to the neighbouring document at either end (issue 429). The
  // table steps through its rows, one match each.
  const byMatch = view.kind === 'dispersion';
  const [matchIndex, setMatchIndex] = useState(0);
  const enterAt = useRef<'first' | 'last'>('first');
  const matchCount = selectedItem ? orderedConcordanceHits(selectedItem).length : 0;
  useEffect(() => {
    setMatchIndex(enterAt.current === 'last' ? Math.max(0, matchCount - 1) : 0);
    enterAt.current = 'first';
    // A new row (clicked, or reached by Previous/Next) starts at one end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem]);

  const customization = selectedItem
    ? buildConcordanceRowDetailCustomization(
        selectedItem,
        searchWord,
        byMatch ? { ...view, matchIndex } : view,
      )
    : undefined;
  const detailNavigation = byMatch
    ? {
        ...navigation,
        canPrevious: matchIndex > 0 || navigation.canPrevious,
        canNext: matchIndex < matchCount - 1 || navigation.canNext,
        onPrevious: () => {
          if (matchIndex > 0) {
            setMatchIndex(matchIndex - 1);
            return;
          }
          enterAt.current = 'last';
          navigation.onPrevious();
        },
        onNext: () => {
          if (matchIndex < matchCount - 1) {
            setMatchIndex(matchIndex + 1);
            return;
          }
          enterAt.current = 'first';
          navigation.onNext();
        },
        previousLabel: 'Previous match',
        nextLabel: 'Next match',
      }
    : navigation;

  return (
    <>
      {children(openDetailAt)}
      <RowDetailPanel
        open={detailOpen}
        onOpenChange={setDetailOpen}
        payload={detailPayload}
        customization={customization}
        navigation={detailNavigation}
      />
    </>
  );
}
