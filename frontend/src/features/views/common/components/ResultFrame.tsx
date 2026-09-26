import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { useResultsFill } from './analysisResultsFill';

const STORAGE_PREFIX = 'ldaca.layout.resultHeight.';
const KEYBOARD_STEP = 40;
const MAX_HEIGHT = 2400;

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
 * with the tool's other results. The bottom-right grip (drag, or arrow keys
 * when focused) sets its own size, which is remembered per `storageKey` and
 * takes it out of the sharing; double-clicking the grip returns it to
 * filling. The grip sits above the content so charts cannot cover it.
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
  const [drag, setDrag] = useState<{
    pointerId: number;
    startY: number;
    startHeight: number;
    height: number;
  } | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const userHeight = drag?.height ?? storedHeight;
  const fillHeight = useResultsFill(frame, {
    min: minHeight,
    enabled: fill && userHeight === null,
    cap: fitContent && frame ? () => naturalFrameHeight(frame) : undefined,
  });
  const cssHeight =
    userHeight !== null
      ? `${String(userHeight)}px`
      : fillHeight !== null
        ? `${String(fillHeight)}px`
        : toCssHeight(defaultHeight);

  useEffect(() => {
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setMeasuredHeight(Math.round(frame.getBoundingClientRect().height));
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  }, [frame]);

  const clamp = (height: number) => Math.round(Math.min(MAX_HEIGHT, Math.max(minHeight, height)));
  const commit = (height: number | null) => {
    setStoredHeight(height);
    writeStoredHeight(storageKey, height);
  };
  const currentHeight = () =>
    userHeight ?? (frame ? frame.getBoundingClientRect().height : minHeight);

  return (
    <div
      ref={setFrame}
      data-testid={testId}
      data-result-size={userHeight !== null ? 'user' : fillHeight !== null ? 'fill' : 'default'}
      className={cn('relative w-full overflow-hidden', className)}
      style={{ height: cssHeight, minHeight }}
    >
      {typeof children === 'function'
        ? children(cssHeight !== undefined ? measuredHeight : null)
        : children}
      {/* Our own grip, drawn above the content: charts and canvases cover
          the browser's native resize corner and take its pointer events. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize this result"
        aria-valuenow={userHeight ?? undefined}
        aria-valuemin={minHeight}
        tabIndex={0}
        title="Drag to resize. Double-click to fit the space again."
        data-testid="result-frame-grip"
        className="nodrag nopan nowheel absolute right-0 bottom-0 z-30 flex size-4 cursor-ns-resize touch-none items-end justify-end rounded-tl-sm text-description/70 hover:text-foreground focus-visible:outline-1 focus-visible:outline-focus"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.currentTarget.setPointerCapture === 'function') {
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          const startHeight = clamp(currentHeight());
          setDrag({
            pointerId: event.pointerId,
            startY: event.clientY,
            startHeight,
            height: startHeight,
          });
        }}
        onPointerMove={(event) => {
          if (drag?.pointerId !== event.pointerId) return;
          const next = clamp(drag.startHeight + event.clientY - drag.startY);
          if (next !== drag.height) setDrag({ ...drag, height: next });
        }}
        onPointerUp={(event) => {
          if (drag?.pointerId !== event.pointerId) return;
          if (typeof event.currentTarget.releasePointerCapture === 'function') {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          if (drag.height !== drag.startHeight) commit(drag.height);
          setDrag(null);
        }}
        onPointerCancel={() => {
          setDrag(null);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          commit(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          commit(
            clamp(currentHeight() + (event.key === 'ArrowUp' ? -KEYBOARD_STEP : KEYBOARD_STEP)),
          );
        }}
      >
        <svg viewBox="0 0 10 10" className="m-0.5 size-2.5" aria-hidden="true">
          <path d="M9 3 3 9M9 6 6 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      </div>
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
