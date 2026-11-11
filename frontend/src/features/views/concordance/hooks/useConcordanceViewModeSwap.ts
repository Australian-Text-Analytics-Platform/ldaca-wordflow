import { useCallback, useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { ConcordanceAnalysisResponse } from '@/api';

interface Params {
  /** The Combined view is an advanced setting: off in Basic. */
  combinedAllowed: boolean;
  viewMode: 'separated' | 'combined';
  setViewMode: Dispatch<SetStateAction<'separated' | 'combined'>>;
  results: ConcordanceAnalysisResponse | null;
  combinedLoading: boolean;
  resultsRef: RefObject<HTMLDivElement | null>;
}

/** Owns only Concordance presentation mode and scroll anchoring; Query owns every page. */
export function useConcordanceViewModeSwap({
  combinedAllowed,
  viewMode,
  setViewMode,
  results,
  combinedLoading,
  resultsRef,
}: Params) {
  // Back to Separated when the results cannot be combined, or Advanced is
  // turned off: Basic keeps two Data Blocks' results separated.
  useEffect(() => {
    if (viewMode !== 'combined' || (results?.combinable !== false && combinedAllowed)) return;
    const frame = requestAnimationFrame(() => {
      setViewMode('separated');
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [combinedAllowed, results?.combinable, setViewMode, viewMode]);

  const handleViewModeChange = useCallback(
    (nextMode: 'separated' | 'combined') => {
      if (nextMode === viewMode) return;
      const anchor = resultsRef.current;
      const previousTop = anchor?.getBoundingClientRect().top ?? 0;
      const previousScrollY = window.scrollY;
      if (anchor) {
        anchor.style.minHeight = `${String(anchor.getBoundingClientRect().height)}px`;
      }
      setViewMode(nextMode);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const nextAnchor = resultsRef.current;
          if (nextAnchor) {
            const delta = nextAnchor.getBoundingClientRect().top - previousTop;
            if (Math.abs(delta) > 1) window.scrollTo({ top: previousScrollY + delta });
            nextAnchor.style.minHeight = '';
          }
        });
      });
    },
    [resultsRef, setViewMode, viewMode],
  );

  return { combinedLoading, handleViewModeChange };
}
