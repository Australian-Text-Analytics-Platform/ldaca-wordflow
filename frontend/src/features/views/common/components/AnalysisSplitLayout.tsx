import { type ReactNode, useEffect, useRef, useState } from 'react';

import { ResizeHandle } from '@/components/layout/ResizeHandle';
import { cn } from '@/lib/utils';

import { ResultsFillContext, useResultsFillEngine } from './analysisResultsFill';

/** Smallest parameters pane: the card title and first row stay visible. */
const ANALYSIS_SPLIT_MIN_PARAMETERS_HEIGHT = 96;
/** Smallest results pane while a drag or nudge sizes the parameters pane. */
const ANALYSIS_SPLIT_MIN_RESULTS_HEIGHT = 160;
const KEYBOARD_STEP = 40;
// The handle (8 px) with its vertical margins and the results pane's top padding.
const HANDLE_SPACE = 24;

const storageKeyFor = (viewId: string) => `ldaca.layout.analysisParametersHeight.${viewId}`;

/** Reads the remembered parameters height; null means the natural height. */
const readStoredHeight = (viewId: string): number | null => {
  try {
    const raw = window.localStorage.getItem(storageKeyFor(viewId));
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
};

/** Remembers or forgets the parameters height; storage failures are ignored. */
const writeStoredHeight = (viewId: string, height: number | null) => {
  try {
    if (height === null) window.localStorage.removeItem(storageKeyFor(viewId));
    else window.localStorage.setItem(storageKeyFor(viewId), String(Math.round(height)));
  } catch {
    // Private windows can refuse storage; the split still works for this session.
  }
};

export interface AnalysisSplitLayoutProps {
  /** Identifies the tool so each one remembers its own split. */
  viewId: string;
  /** The tool's parameters card. */
  parameters: ReactNode;
  /** Banners, errors, and results shown below the parameters. */
  children?: ReactNode;
  className?: string;
}

/**
 * Parameters above, results below, with a drag handle between them (issue 196).
 * Used by: every analysis tool rendered in AnalysisTabsHost.
 * Flow: by default the parameters take their natural height and the results
 * fill the rest; each pane scrolls on its own. Dragging or arrow keys fix the
 * parameters height (remembered per tool); double-click returns to the
 * natural height. The handle appears only once the results pane has content.
 * Main tables and lists use `useResultsFill` to take the results pane's spare
 * height, so the handle resizes them too.
 */
export function AnalysisSplitLayout({
  viewId,
  parameters,
  children,
  className,
}: AnalysisSplitLayoutProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const parametersRef = useRef<HTMLDivElement | null>(null);
  const resultsPaneRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const fillRegistry = useResultsFillEngine(resultsPaneRef, resultsRef);
  const [storedHeight, setStoredHeight] = useState<number | null>(() => readStoredHeight(viewId));
  const [drag, setDrag] = useState<{ startY: number; startHeight: number; height: number } | null>(
    null,
  );
  const [hasResults, setHasResults] = useState(false);

  // Results render conditionally inside child components, so watch the
  // rendered content rather than the children prop.
  useEffect(() => {
    const pane = resultsRef.current;
    if (!pane) return;
    const update = () => {
      setHasResults(pane.childElementCount > 0);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(pane, { childList: true });
    return () => {
      observer.disconnect();
    };
  }, []);

  const clampHeight = (height: number) => {
    const containerHeight = containerRef.current?.getBoundingClientRect().height ?? 0;
    const max =
      containerHeight > 0
        ? Math.max(
            ANALYSIS_SPLIT_MIN_PARAMETERS_HEIGHT,
            containerHeight - ANALYSIS_SPLIT_MIN_RESULTS_HEIGHT - HANDLE_SPACE,
          )
        : Number.POSITIVE_INFINITY;
    return Math.round(Math.min(max, Math.max(ANALYSIS_SPLIT_MIN_PARAMETERS_HEIGHT, height)));
  };

  const currentHeight = () =>
    drag?.height ??
    storedHeight ??
    parametersRef.current?.getBoundingClientRect().height ??
    ANALYSIS_SPLIT_MIN_PARAMETERS_HEIGHT;

  const commit = (height: number | null) => {
    setStoredHeight(height);
    writeStoredHeight(viewId, height);
  };

  const showHandle = hasResults;
  const parametersHeight = showHandle ? (drag?.height ?? storedHeight) : null;

  return (
    <div
      ref={containerRef}
      data-testid="analysis-split"
      className={cn('flex min-h-0 flex-1 flex-col', className)}
    >
      <div
        ref={parametersRef}
        data-testid="analysis-split-parameters"
        className={cn(
          'min-h-0 overflow-y-auto',
          parametersHeight === null ? 'flex-[0_1_auto]' : 'flex-none',
        )}
        style={
          parametersHeight === null
            ? showHandle
              ? { minHeight: ANALYSIS_SPLIT_MIN_PARAMETERS_HEIGHT }
              : undefined
            : { height: parametersHeight }
        }
      >
        {parameters}
      </div>

      {showHandle ? (
        <ResizeHandle
          orientation="horizontal"
          isDragging={drag !== null}
          role="separator"
          aria-label="Resize parameters and results"
          aria-valuenow={parametersHeight ?? undefined}
          aria-valuemin={ANALYSIS_SPLIT_MIN_PARAMETERS_HEIGHT}
          tabIndex={0}
          title="Drag to resize. Double-click to reset."
          data-testid="analysis-split-handle"
          className="my-1.5 shrink-0"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            const startHeight = clampHeight(currentHeight());
            setDrag({ startY: event.clientY, startHeight, height: startHeight });
          }}
          onPointerMove={(event) => {
            if (!drag) return;
            const next = clampHeight(drag.startHeight + event.clientY - drag.startY);
            if (next !== drag.height) setDrag({ ...drag, height: next });
          }}
          onPointerUp={(event) => {
            if (!drag) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            if (drag.height !== drag.startHeight) commit(drag.height);
            setDrag(null);
          }}
          onPointerCancel={() => {
            setDrag(null);
          }}
          onDoubleClick={() => {
            commit(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            const step = event.key === 'ArrowUp' ? -KEYBOARD_STEP : KEYBOARD_STEP;
            commit(clampHeight(currentHeight() + step));
          }}
        />
      ) : null}

      <div
        ref={resultsPaneRef}
        data-testid="analysis-split-results"
        className={cn('min-h-0 flex-1 overflow-auto', showHandle && 'pt-1')}
        style={showHandle ? { minHeight: ANALYSIS_SPLIT_MIN_RESULTS_HEIGHT } : undefined}
      >
        {/* flow-root keeps child margins inside, so its height is the content height. */}
        <div ref={resultsRef} className="flow-root space-y-4">
          <ResultsFillContext value={fillRegistry}>{children}</ResultsFillContext>
        </div>
      </div>
    </div>
  );
}
