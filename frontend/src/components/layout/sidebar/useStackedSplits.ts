import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

interface UseStackedSplitsOptions {
  /** Minimum pixel height a non-collapsed section can shrink to. Default 120. */
  minSectionPx?: number;
  /** Per-section minimum pixel overrides for compact sections such as Tasks. */
  sectionMinPx?: Partial<Record<string, number>>;
  /** Initial split ratios (must sum to ~1). Defaults to even distribution. */
  initialRatios?: Record<string, number>;
  /** Initial collapsed map. Defaults to all-expanded. */
  initialCollapsed?: Record<string, boolean>;
  /**
   * Sections that start sized to their content (the sidebar's Views list), so
   * showing or hiding an entry resizes them. Dragging a boundary next to one
   * fixes its height for the rest of the session.
   */
  fitContentKeys?: readonly string[];
}

export interface StackedSplitsApi<KeyT extends string> {
  /** Attach to the wrapping flex column. ResizeObserver tracks its height. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Read accessor for the per-section collapse state. */
  isCollapsed: (key: KeyT) => boolean;
  /** Toggle a section's collapsed state. */
  toggleSection: (key: KeyT) => void;
  /**
   * Per-section flex style. Collapsed sections render at content height; the
   * remaining sections share the leftover space proportional to their ratio.
   */
  getSectionFlexStyle: (key: KeyT) => CSSProperties;
  /**
   * Pass to each section's inner scroll container so the drag handler can
   * push overflow into the right pane when the cursor moves past min/max.
   */
  assignSectionScrollRef: (key: KeyT, node: HTMLDivElement | null) => void;
  /** Pass to each section's outer element; fitted sections are measured from it. */
  assignSectionRef: (key: KeyT, node: HTMLDivElement | null) => void;
  /** Lower section key for the boundary currently being dragged. */
  resizingLowerKey: KeyT | null;
  /**
   * Pointer-down handler for the separator between `upperKey` (above) and
   * `lowerKey` (below). Resizes the pair against each other; if the cursor
   * tries to push past either pane's min, the overflow scrolls that pane.
   */
  handleResizeStart: (
    upperKey: KeyT,
    lowerKey: KeyT,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
}

/**
 * Hook used by the sidebar to manage collapsible, drag-resizable vertical
 * sections. It owns section ratios, collapse state, resize observation, and
 * overflow scrolling so the sidebar component can stay focused on rendering
 * views, nodes, and tasks.
 * Why: the sidebar needs collapsible, resizable vertical sections without mixing layout math into rendering code.
 * Flow: seed collapse and ratio state, observe container height, compute flex
 * styles, apply section-specific resize minimums, and expose collapse, ref, and
 * drag-resize handlers.
 */
export const useStackedSplits = <KeyT extends string>(
  keys: readonly KeyT[],
  options: UseStackedSplitsOptions = {},
): StackedSplitsApi<KeyT> => {
  const {
    minSectionPx = 120,
    sectionMinPx,
    initialRatios,
    initialCollapsed,
    fitContentKeys,
  } = options;

  const defaultRatio = keys.length > 0 ? 1 / keys.length : 0;
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    keys.forEach((key) => {
      seed[key] = initialCollapsed?.[key] ?? false;
    });
    return seed;
  });
  const [sectionHeights, setSectionHeights] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    keys.forEach((key) => {
      seed[key] = initialRatios?.[key] ?? defaultRatio;
    });
    return seed;
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sectionScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [containerHeight, setContainerHeight] = useState(0);
  const [resizingLowerKey, setResizingLowerKey] = useState<KeyT | null>(null);
  // Not persisted: every start fits the content again.
  const [fittedSections, setFittedSections] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    keys.forEach((key) => {
      seed[key] = fitContentKeys?.includes(key) ?? false;
    });
    return seed;
  });
  const [fitHeights, setFitHeights] = useState<Record<string, number>>({});
  const fittedSectionsRef = useRef(fittedSections);
  const fitObserverRef = useRef<ResizeObserver | null>(null);

  /** Height a fitted section needs to show its whole content without scrolling. */
  const measureFittedSections = useCallback(() => {
    setFitHeights((previous) => {
      let next = previous;
      for (const [key, fitted] of Object.entries(fittedSectionsRef.current)) {
        if (!fitted) continue;
        const section = sectionRefs.current[key];
        const scroll = sectionScrollRefs.current[key];
        const content = scroll?.firstElementChild;
        if (!section || !scroll || !(content instanceof HTMLElement)) continue;
        const style = getComputedStyle(scroll);
        const padding =
          (Number.parseFloat(style.paddingTop) || 0) +
          (Number.parseFloat(style.paddingBottom) || 0);
        // The section's own chrome (header, borders) plus the content at full height.
        const chrome = section.getBoundingClientRect().height - scroll.clientHeight;
        const contentHeight = content.getBoundingClientRect().height;
        if (contentHeight <= 0) continue;
        const needed = Math.ceil(chrome + padding + contentHeight);
        if (Math.abs((next[key] ?? 0) - needed) < 1) continue;
        next = next === previous ? { ...previous } : next;
        next[key] = needed;
      }
      return next;
    });
  }, []);

  // Watch each fitted section's scroll area and content; attach after every
  // commit because the content mounts and unmounts as the section collapses.
  useLayoutEffect(() => {
    fittedSectionsRef.current = fittedSections;
    if (typeof ResizeObserver === 'undefined') return;
    const anyFitted = Object.values(fittedSections).some(Boolean);
    if (!anyFitted) {
      fitObserverRef.current?.disconnect();
      fitObserverRef.current = null;
      return;
    }
    fitObserverRef.current ??= new ResizeObserver(() => {
      measureFittedSections();
    });
    const observer = fitObserverRef.current;
    for (const [key, fitted] of Object.entries(fittedSections)) {
      if (!fitted) continue;
      const scroll = sectionScrollRefs.current[key];
      const content = scroll?.firstElementChild;
      if (scroll) observer.observe(scroll);
      if (content) observer.observe(content);
    }
  });

  useLayoutEffect(
    () => () => {
      fitObserverRef.current?.disconnect();
    },
    [],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (typeof ResizeObserver === 'undefined') {
      setContainerHeight(container.getBoundingClientRect().height);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerHeight(entry.contentRect.height);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Fitted sections take their own height, so only the others share the rest.
  const activeSectionTotal =
    keys.reduce((sum, key) => {
      if (collapsedSections[key] || (fittedSections[key] && fitHeights[key] !== undefined))
        return sum;
      return sum + (sectionHeights[key] ?? 0);
    }, 0) || 1;

  const isCollapsed = (key: KeyT) => Boolean(collapsedSections[key]);

  const toggleSection = (key: KeyT) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getSectionFlexStyle = (key: KeyT): CSSProperties => {
    if (collapsedSections[key]) {
      return { flex: '0 0 auto' };
    }
    if (fittedSections[key]) {
      const needed = fitHeights[key];
      if (needed === undefined) return { flex: '0 1 auto' };
      // Leave the other open sections at least their minimum height.
      const othersMinimum = keys.reduce(
        (sum, other) =>
          other === key || collapsedSections[other]
            ? sum
            : sum + (sectionMinPx?.[other] ?? minSectionPx),
        0,
      );
      const available = containerHeight > 0 ? containerHeight - othersMinimum : needed;
      return { flex: '0 0 auto', height: Math.min(needed, Math.max(available, minSectionPx)) };
    }
    const ratio = (sectionHeights[key] ?? 0) / activeSectionTotal;
    return { flexGrow: ratio, flexShrink: 0, flexBasis: 0 };
  };

  // These callbacks cross ref/listener boundaries: React invokes the ref during
  // attach/detach, and a resize gesture installs window listeners that must
  // share one captured interaction until mouseup removes them.
  const assignSectionScrollRef = useCallback((key: KeyT, node: HTMLDivElement | null) => {
    sectionScrollRefs.current[key] = node;
  }, []);

  const assignSectionRef = useCallback((key: KeyT, node: HTMLDivElement | null) => {
    sectionRefs.current[key] = node;
  }, []);

  const scrollSection = useCallback((key: KeyT, deltaPixels: number) => {
    if (deltaPixels === 0) return;
    const target = sectionScrollRefs.current[key];
    if (!target) return;
    target.scrollTop += deltaPixels;
  }, []);

  const handleResizeStart = useCallback(
    (upperKey: KeyT, lowerKey: KeyT, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (collapsedSections[upperKey] || collapsedSections[lowerKey]) return;
      const measuredHeight = containerRef.current?.getBoundingClientRect().height;
      const height =
        containerHeight > 0
          ? containerHeight
          : measuredHeight && measuredHeight > 0
            ? measuredHeight
            : 1;
      if (height <= 0) return;

      event.preventDefault();
      const handle = event.currentTarget;
      const pointerId = event.pointerId;
      const startY = event.clientY;
      // A drag next to a fitted section fixes it: every open section's current
      // height becomes its ratio, so nothing moves until the pointer does.
      let ratios = sectionHeights;
      if (fittedSections[upperKey] || fittedSections[lowerKey]) {
        const measured: Record<string, number> = { ...sectionHeights };
        for (const key of keys) {
          const section = sectionRefs.current[key];
          if (collapsedSections[key] || !section) continue;
          measured[key] = section.getBoundingClientRect().height / height;
        }
        ratios = measured;
        setSectionHeights(measured);
        setFittedSections((previous) => ({ ...previous, [upperKey]: false, [lowerKey]: false }));
      }
      const startUpper = ratios[upperKey] ?? 0;
      const startLower = ratios[lowerKey] ?? 0;
      const pairTotal = startUpper + startLower;
      if (pairTotal <= 0) return;

      const minRatioFor = (key: KeyT) =>
        Math.max((sectionMinPx?.[key] ?? minSectionPx) / height, 0.02);
      let minUpper = minRatioFor(upperKey);
      let minLower = minRatioFor(lowerKey);
      const minTotal = minUpper + minLower;
      if (!Number.isFinite(minTotal) || minTotal <= 0) {
        return;
      }
      if (minTotal >= pairTotal) {
        const scale = (pairTotal - 0.02) / minTotal;
        if (!Number.isFinite(scale) || scale <= 0) return;
        minUpper *= scale;
        minLower *= scale;
      }
      const maxUpper = pairTotal - minLower;
      if (maxUpper <= minUpper) {
        return;
      }

      setResizingLowerKey(lowerKey);
      try {
        handle.setPointerCapture(pointerId);
      } catch {
        // Pointer capture is an enhancement; window listeners still own the drag.
      }

      /**
       * Called by the window pointermove listener installed below for this drag.
       * Flow: convert pointer delta to section ratios, clamp the upper/lower pair, update heights, then scroll overflow when the drag hits a minimum bound.
       */
      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const deltaY = moveEvent.clientY - startY;
        const deltaRatio = deltaY / height;
        const candidateUpper = startUpper + deltaRatio;
        let nextUpper = candidateUpper;
        let overflowTarget: KeyT | null = null;
        let overflowRatio = 0;

        if (candidateUpper < minUpper) {
          nextUpper = minUpper;
          overflowTarget = upperKey;
          overflowRatio = candidateUpper - minUpper;
        } else if (candidateUpper > maxUpper) {
          nextUpper = maxUpper;
          overflowTarget = lowerKey;
          overflowRatio = candidateUpper - maxUpper;
        }

        const nextLower = pairTotal - nextUpper;
        setSectionHeights((prev) => ({
          ...prev,
          [upperKey]: nextUpper,
          [lowerKey]: nextLower,
        }));

        if (overflowTarget && overflowRatio !== 0) {
          scrollSection(overflowTarget, overflowRatio * height);
        }
      };

      /** Removes this drag's window listeners when the pointer ends or is cancelled. */
      const onEnd = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        setResizingLowerKey(null);
        try {
          handle.releasePointerCapture(pointerId);
        } catch {
          // Ignore release failures when capture was unavailable or already lost.
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    },
    [
      collapsedSections,
      containerHeight,
      fittedSections,
      keys,
      sectionHeights,
      minSectionPx,
      sectionMinPx,
      scrollSection,
    ],
  );

  return {
    containerRef,
    isCollapsed,
    toggleSection,
    getSectionFlexStyle,
    assignSectionScrollRef,
    assignSectionRef,
    resizingLowerKey,
    handleResizeStart,
  };
};
