import { createContext, useContext, useEffect, useRef, useState } from 'react';

/** Wait for the pointer to settle on a bubble, so sweeping across bubbles opens nothing. */
export const BUBBLE_POPUP_OPEN_DELAY_MS = 150;
/** Time to move from the bubble into its word cloud before it closes. */
export const BUBBLE_POPUP_CLOSE_DELAY_MS = 300;

export interface BubblePopupControls {
  /** The Topic whose word cloud is open, or null. */
  popupId: number | null;
  bubbleEnter: (topicId: number) => void;
  bubbleLeave: (topicId: number) => void;
  popupEnter: () => void;
  popupLeave: () => void;
}

/**
 * One word cloud open at a time across the bubble chart (Chao, 15 Nov 2026).
 * Used by: TopicModelingFlowChart, through BubblePopupContext.
 * Flow: a bubble opens its card after the pointer rests on it for the open
 * delay. Leaving the bubble starts the close delay; entering the card, or
 * coming back to the bubble, cancels it, so words in the card can be
 * clicked. While a card is closing, other bubbles under the pointer don't
 * replace it; once it has closed, the bubble under the pointer opens after
 * its own delay. Holding Shift keeps the open card. `enabled` false (lasso
 * mode) closes the card and opens none.
 */
export function useBubblePopup(enabled: boolean): BubblePopupControls {
  const [popupId, setPopupId] = useState<number | null>(null);
  const popupIdRef = useRef<number | null>(null);
  const hoverIdRef = useRef<number | null>(null);
  const inPopupRef = useRef(false);
  const frozenRef = useRef(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOpenTimer = () => {
    if (openTimerRef.current !== null) clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  };
  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const show = (topicId: number | null) => {
    popupIdRef.current = topicId;
    // A card that goes away under the pointer never reports the pointer leaving.
    inPopupRef.current = false;
    setPopupId(topicId);
  };
  const scheduleOpen = (topicId: number) => {
    clearOpenTimer();
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      if (hoverIdRef.current === topicId && popupIdRef.current === null) show(topicId);
    }, BUBBLE_POPUP_OPEN_DELAY_MS);
  };
  const scheduleClose = () => {
    if (frozenRef.current || popupIdRef.current === null) return;
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (inPopupRef.current || frozenRef.current || hoverIdRef.current === popupIdRef.current) {
        return;
      }
      show(null);
      if (hoverIdRef.current !== null) scheduleOpen(hoverIdRef.current);
    }, BUBBLE_POPUP_CLOSE_DELAY_MS);
  };

  // Holding Shift keeps the open card (Chao, 15 Nov 2026).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        frozenRef.current = true;
        clearCloseTimer();
      }
    };
    const release = () => {
      if (!frozenRef.current) return;
      frozenRef.current = false;
      if (!inPopupRef.current && hoverIdRef.current !== popupIdRef.current) scheduleClose();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') release();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the handlers read refs only, so registering once is enough
  }, []);

  // Lasso mode covers the chart: close any card and stop timers.
  useEffect(() => {
    if (enabled) return;
    clearOpenTimer();
    clearCloseTimer();
    hoverIdRef.current = null;
    if (popupIdRef.current !== null) show(null);
  }, [enabled]);

  useEffect(
    () => () => {
      clearOpenTimer();
      clearCloseTimer();
    },
    [],
  );

  return {
    popupId,
    bubbleEnter: (topicId) => {
      if (!enabled) return;
      hoverIdRef.current = topicId;
      if (popupIdRef.current === null) scheduleOpen(topicId);
      else if (popupIdRef.current === topicId) clearCloseTimer();
      // Another card is open: it closes on its own delay, then this one opens.
    },
    bubbleLeave: (topicId) => {
      if (hoverIdRef.current === topicId) hoverIdRef.current = null;
      clearOpenTimer();
      if (popupIdRef.current === topicId) scheduleClose();
    },
    popupEnter: () => {
      inPopupRef.current = true;
      clearCloseTimer();
    },
    popupLeave: () => {
      inPopupRef.current = false;
      if (hoverIdRef.current !== popupIdRef.current) scheduleClose();
    },
  };
}

interface BubblePopupContextValue extends BubblePopupControls {
  /** Left-click on a word in the card. Without either handler the card ignores the pointer. */
  onWordClick?: (word: string) => void;
  /** Right-click on a word in the card. */
  onWordContextMenu?: (word: string) => void;
}

export const BubblePopupContext = createContext<BubblePopupContextValue | null>(null);

export function useBubblePopupContext(): BubblePopupContextValue {
  const value = useContext(BubblePopupContext);
  if (!value) throw new Error('useBubblePopupContext must be used inside BubblePopupContext');
  return value;
}
