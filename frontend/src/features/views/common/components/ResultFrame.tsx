import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { useResultsFill } from './analysisResultsFill';

const STORAGE_PREFIX = 'ldaca.layout.resultHeight.';
const SAVE_DELAY_MS = 250;
/** Double-clicks this close to the bottom-right corner reset the size. */
const CORNER_HIT_PX = 18;

/** Reads a remembered result height; storage failures fall back to filling. */
const readStoredHeight = (key: string): number | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
};

/** Remembers or forgets a result height; storage failures are ignored. */
const writeStoredHeight = (key: string, height: number | null) => {
  try {
    if (height === null) window.localStorage.removeItem(STORAGE_PREFIX + key);
    else window.localStorage.setItem(STORAGE_PREFIX + key, String(Math.round(height)));
  } catch {
    // Private windows can refuse storage; the size still applies this session.
  }
};

const toCssHeight = (height: number | string | undefined) =>
  typeof height === 'number' ? `${String(height)}px` : height;

/**
 * Full height of a frame whose content scrolls inside a ScrollArea viewport (or
 * an element marked `data-result-frame-scroll`), so a short table does not
 * fill with blank space.
 */
const naturalFrameHeight = (frame: HTMLElement): number | null => {
  const scroller = frame.querySelector<HTMLElement>(
    '[data-result-frame-scroll], [data-slot="scroll-area-viewport"]',
  );
  if (!scroller) return null;
  return frame.clientHeight - scroller.clientHeight + scroller.scrollHeight;
};

export interface ResultFrameProps {
  /** Remembers the user's size per result, for example `topic-modeling.bubbles`. */
  storageKey: string;
  /** Take the results pane's spare height (default). */
  fill?: boolean;
  /** Stop filling at the content's full height (tables and lists). */
  fitContent?: boolean;
  /** Height when not filling and not resized; omit for the natural height. */
  defaultHeight?: number | string;
  minHeight?: number;
  className?: string;
  testId?: string;
  /**
   * The result. A function receives the frame's height in pixels once it has
   * one (filling, a default, or a user size), otherwise null.
   */
  children: ReactNode | ((height: number | null) => ReactNode);
}

/**
 * One main result (table, list, chart, or word cloud) in an analysis tool
 * (issue 196).
 * Flow: by default the frame fills the results pane's spare height, shared
 * with the tool's other results. The bottom-right grip, like the Stop words
 * box, sets its own size, which is remembered per `storageKey` and takes it
 * out of the sharing; double-clicking the grip returns it to filling.
 */
export function ResultFrame({
  storageKey,
  fill = true,
  fitContent = false,
  defaultHeight,
  minHeight = 160,
  className,
  testId = 'result-frame',
  children,
}: ResultFrameProps) {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [storedHeight, setStoredHeight] = useState<number | null>(() =>
    readStoredHeight(storageKey),
  );
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const fillHeight = useResultsFill(frame, {
    min: minHeight,
    enabled: fill && storedHeight === null,
    cap: fitContent && frame ? () => naturalFrameHeight(frame) : undefined,
  });
  const cssHeight =
    storedHeight !== null
      ? `${String(storedHeight)}px`
      : fillHeight !== null
        ? `${String(fillHeight)}px`
        : toCssHeight(defaultHeight);
  const cssHeightRef = useRef(cssHeight);
  const frameRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    cssHeightRef.current = cssHeight;
  }, [cssHeight]);

  useEffect(() => {
    if (!frame || typeof ResizeObserver === 'undefined') return;
    let saveTimer: number | undefined;
    const observer = new ResizeObserver(() => {
      const height = Math.round(frame.getBoundingClientRect().height);
      setMeasuredHeight(height);
      // The browser writes a dragged size as an inline height; any value other
      // than the one React rendered is the user's resize.
      const inline = frame.style.height;
      if (inline && inline !== (cssHeightRef.current ?? '')) {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          setStoredHeight(height);
          writeStoredHeight(storageKey, height);
        }, SAVE_DELAY_MS);
      }
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
      window.clearTimeout(saveTimer);
    };
  }, [frame, storageKey]);

  return (
    <div
      ref={(element) => {
        frameRef.current = element;
        setFrame(element);
      }}
      data-testid={testId}
      data-result-size={storedHeight !== null ? 'user' : fillHeight !== null ? 'fill' : 'default'}
      title="Drag the bottom-right corner to resize. Double-click it to fit the space again."
      className={cn('relative w-full resize-y overflow-hidden', className)}
      style={{ height: cssHeight, minHeight }}
      onDoubleClick={(event) => {
        const frame = frameRef.current;
        if (!frame || storedHeight === null) return;
        const rect = frame.getBoundingClientRect();
        if (
          rect.right - event.clientX > CORNER_HIT_PX ||
          rect.bottom - event.clientY > CORNER_HIT_PX
        )
          return;
        setStoredHeight(null);
        writeStoredHeight(storageKey, null);
        // Clear the browser's inline size so filling takes over again.
        frame.style.height = toCssHeight(defaultHeight) ?? '';
      }}
    >
      {typeof children === 'function'
        ? children(cssHeight !== undefined ? measuredHeight : null)
        : children}
    </div>
  );
}

export interface ResultChartFitProps {
  /** The ResultFrame height, or null to use `fallbackHeight`. */
  frameHeight: number | null;
  fallbackHeight: number;
  minHeight?: number;
  children: (chartHeight: number) => ReactNode;
}

/**
 * Gives a chart the frame height minus the toolbar or legend drawn with it.
 * Used by: ResultFrame children whose chart takes a numeric height (ECharts).
 * Flow: measure the rendered chrome around the chart after each render and
 * subtract it, so the whole chart fits the frame.
 */
export function ResultChartFit({
  frameHeight,
  fallbackHeight,
  minHeight = 120,
  children,
}: ResultChartFitProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [chrome, setChrome] = useState(0);
  const chartHeight =
    frameHeight === null ? fallbackHeight : Math.max(minHeight, Math.round(frameHeight - chrome));

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const next = Math.max(0, Math.round(wrapper.getBoundingClientRect().height - chartHeight));
    if (Math.abs(next - chrome) >= 1) setChrome(next);
  }, [chartHeight, chrome]);

  return <div ref={wrapperRef}>{children(chartHeight)}</div>;
}
