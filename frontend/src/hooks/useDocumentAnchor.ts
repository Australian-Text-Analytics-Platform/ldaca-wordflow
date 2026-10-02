import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { ANCHOR_HIGHLIGHT_DURATION_MS, ANCHOR_SETTLE_DURATION_MS } from '@/config/layout';

interface UseDocumentAnchorOptions {
  activeAnchor: string | null;
  loading: boolean;
  error: string | null;
}

/** Inputs that mean the reader has started scrolling or reading on their own. */
const READER_INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * Scrolls to and highlights a document anchor when it becomes active.
 *
 * Images above the anchor have no size until they load, so a single scroll
 * landed short or past the section, differently on each opening. The anchor is
 * therefore scrolled back into view whenever the document's height changes,
 * until the reader scrolls, clicks or types, or the settle time ends.
 */
export const useDocumentAnchor = ({ activeAnchor, loading, error }: UseDocumentAnchorOptions) => {
  const missingAnchorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeAnchor || loading || error) return;
    const anchorElement = document.getElementById(activeAnchor);
    if (!anchorElement) {
      if (missingAnchorRef.current !== activeAnchor) {
        missingAnchorRef.current = activeAnchor;
        toast('Help section not found — showing top of document.');
      }
      return;
    }
    missingAnchorRef.current = null;
    anchorElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const highlightTarget =
      anchorElement.closest('p, li, section, h2, h3, h4, h5') ?? anchorElement;
    highlightTarget.classList.add('tutorial-highlight');
    const highlightTimeoutId = window.setTimeout(() => {
      highlightTarget.classList.remove('tutorial-highlight');
    }, ANCHOR_HIGHLIGHT_DURATION_MS);

    const content = anchorElement.closest('main') ?? anchorElement.parentElement;
    let initialObservation = true;
    const observer =
      content && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            // The first callback reports the size at observe time; only later changes move the anchor.
            if (initialObservation) {
              initialObservation = false;
              return;
            }
            anchorElement.scrollIntoView({ block: 'start' });
          })
        : null;
    const stopSettling = () => {
      observer?.disconnect();
      for (const type of READER_INPUT_EVENTS) window.removeEventListener(type, stopSettling, true);
    };
    if (observer && content) {
      observer.observe(content);
      for (const type of READER_INPUT_EVENTS) window.addEventListener(type, stopSettling, true);
    }
    const settleTimeoutId = window.setTimeout(stopSettling, ANCHOR_SETTLE_DURATION_MS);

    return () => {
      window.clearTimeout(highlightTimeoutId);
      window.clearTimeout(settleTimeoutId);
      stopSettling();
    };
  }, [activeAnchor, error, loading]);
};
