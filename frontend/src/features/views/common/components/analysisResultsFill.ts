import {
  createContext,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * Lets a tool's main result (table, chart, list) take the spare height of the
 * results pane in AnalysisSplitLayout, so the parameters/results handle makes
 * it taller or shorter (issue 196).
 *
 * Flow: the pane measures its slack (inner height minus content height) and
 * shares it between the registered elements. Elements side by side share a
 * row and each take the row's share; stacked elements split it. Each element
 * stays within [min, pane height]; below the minimum the pane scrolls.
 */

interface ResultsFillEntry {
  element: HTMLElement;
  min: number;
  apply: (height: number) => void;
  /** Largest useful height, such as a table's full height; null for no cap. */
  cap?: () => number | null;
  last: number | null;
}

interface ResultsFillRegistry {
  register: (entry: ResultsFillEntry) => () => void;
  schedule: () => void;
}

export const ResultsFillContext = createContext<ResultsFillRegistry | null>(null);

/**
 * Runs the fill calculation for one results pane.
 * Used by: AnalysisSplitLayout, which renders `ResultsFillContext` with the
 * returned registry around its results.
 */
export function useResultsFillEngine(
  paneRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
): ResultsFillRegistry {
  const entriesRef = useRef(new Set<ResultsFillEntry>());
  const frameRef = useRef<number | null>(null);

  const compute = useCallback(() => {
    frameRef.current = null;
    const pane = paneRef.current;
    const content = contentRef.current;
    const entries = [...entriesRef.current].filter(
      (entry) => entry.element.isConnected && entry.element.getClientRects().length > 0,
    );
    if (!pane || !content || entries.length === 0) return;
    const paneStyle = window.getComputedStyle(pane);
    const inner =
      pane.clientHeight -
      (Number.parseFloat(paneStyle.paddingTop) || 0) -
      (Number.parseFloat(paneStyle.paddingBottom) || 0);
    if (inner <= 0) return;
    const slack = inner - content.getBoundingClientRect().height;
    // Elements whose vertical extents overlap sit in one row and share it.
    const extents = entries
      .map((entry) => entry.element.getBoundingClientRect())
      .sort((left, right) => left.top - right.top);
    let rowCount = 0;
    let rowBottom = Number.NEGATIVE_INFINITY;
    for (const rect of extents) {
      if (rect.top >= rowBottom - 1) rowCount += 1;
      rowBottom = Math.max(rowBottom, rect.bottom);
    }
    const share = slack / Math.max(1, rowCount);
    for (const entry of entries) {
      const current = entry.element.getBoundingClientRect().height;
      const cap = entry.cap?.() ?? Number.POSITIVE_INFINITY;
      const target = Math.floor(
        Math.min(Math.max(entry.min, Math.min(inner, cap)), Math.max(entry.min, current + share)),
      );
      if (entry.last === null || Math.abs(target - entry.last) >= 1) {
        entry.last = target;
        entry.apply(target);
      }
    }
  }, [contentRef, paneRef]);

  const schedule = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(compute);
  }, [compute]);

  useEffect(() => {
    const pane = paneRef.current;
    const content = contentRef.current;
    if (!pane || !content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(schedule);
    observer.observe(pane);
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [contentRef, paneRef, schedule]);

  return useMemo(
    () => ({
      register: (entry: ResultsFillEntry) => {
        entriesRef.current.add(entry);
        schedule();
        return () => {
          entriesRef.current.delete(entry);
          schedule();
        };
      },
      schedule,
    }),
    [schedule],
  );
}

/**
 * Sizes one result element from the results pane's spare height.
 * Used by: ResultFrame for the main table, list, or chart of each tool.
 * Flow: pass the element and whether it should fill; `height` is the fill
 * height, or null outside a split or while filling is off.
 */
export function useResultsFill(
  element: HTMLElement | null,
  { min, enabled, cap }: { min: number; enabled: boolean; cap?: () => number | null },
) {
  const registry = useContext(ResultsFillContext);
  const [height, setHeight] = useState<number | null>(null);
  const capRef = useRef(cap);
  useEffect(() => {
    capRef.current = cap;
  }, [cap]);

  useEffect(() => {
    if (!registry || !element || !enabled) return;
    return registry.register({
      element,
      min,
      apply: setHeight,
      cap: () => capRef.current?.() ?? null,
      last: null,
    });
  }, [element, enabled, min, registry]);

  return registry && enabled ? height : null;
}
