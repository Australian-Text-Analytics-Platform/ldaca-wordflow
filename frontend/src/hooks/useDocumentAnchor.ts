import { useEffect, useRef, type RefObject } from 'react';
import { toast } from 'sonner';
import { ANCHOR_HIGHLIGHT_DURATION_MS } from '@/config/layout';

interface UseDocumentAnchorOptions {
  activeAnchor: string | null;
  loading: boolean;
  error: string | null;
  documentKey: string;
  documentRef: RefObject<HTMLDivElement | null>;
  headerRef: RefObject<HTMLElement | null>;
}

/** Scrolls to and highlights a document anchor when it becomes active. */
export const useDocumentAnchor = ({
  activeAnchor,
  loading,
  error,
  documentKey,
  documentRef,
  headerRef,
}: UseDocumentAnchorOptions) => {
  const missingAnchorRef = useRef<string | null>(null);
  const applied = useRef('');

  useEffect(() => {
    if (!activeAnchor || loading || error) return;
    const key = `${documentKey}#${activeAnchor}`;
    if (applied.current === key) return;
    applied.current = key;
    const anchorElement = Array.from(
      documentRef.current?.querySelectorAll<HTMLElement>('[id]') ?? [],
    ).find((element) => element.id === activeAnchor);
    if (!anchorElement) {
      if (missingAnchorRef.current !== activeAnchor) {
        missingAnchorRef.current = activeAnchor;
        toast('Help section not found — showing top of document.');
      }
      return;
    }
    missingAnchorRef.current = null;
    anchorElement.style.scrollMarginTop = `${String((headerRef.current?.getBoundingClientRect().height ?? 0) + 12)}px`;
    anchorElement.scrollIntoView({ block: 'start' });
    const highlightTarget =
      anchorElement.closest('p, li, section, h2, h3, h4, h5') ?? anchorElement;
    highlightTarget.classList.add('tutorial-highlight');
    const timeoutId = window.setTimeout(() => {
      highlightTarget.classList.remove('tutorial-highlight');
    }, ANCHOR_HIGHLIGHT_DURATION_MS);
    return () => {
      window.clearTimeout(timeoutId);
      highlightTarget.classList.remove('tutorial-highlight');
    };
  }, [activeAnchor, documentKey, error, loading, documentRef, headerRef]);
};
