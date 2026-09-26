import 'echarts-wordcloud';

import { init, type EChartsType, use as registerEChartsModules } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import type { WordCloudSeriesOption } from 'echarts/types/dist/echarts';
import { memo, useEffect, useMemo, useRef } from 'react';
import { useElementWidth } from '@/lib/useElementWidth';
import { wordCloudLayoutSize, wordCloudSizingValue } from './wordCloudLayoutSize';

registerEChartsModules([SVGRenderer]);

interface WordCloudDatum {
  text: string;
  value: number;
  color?: string;
}

interface Props {
  words: WordCloudDatum[];
  color?: string;
  minWidth?: number;
  minHeight?: number;
  aspectRatio?: number;
  /** Fixed height, for example from a resized ResultFrame; overrides the aspect ratio. */
  height?: number;
  svgRef?: (element: SVGSVGElement | null) => void;
  onWordClick?: (word: string) => void;
  onWordContextMenu?: (word: string) => void;
}

interface WordCloudPointerEvent {
  name?: string;
}

// echarts-wordcloud 2.1.0 implements these options, but its bundled declaration
// file was not updated when they were added to the extension.
interface WordflowWordCloudSeriesOption extends WordCloudSeriesOption {
  keepAspect: boolean;
  shrinkToFit: boolean;
}

/** Longest time the previous frame is held if the new layout never draws words. */
const OVERLAY_MAX_HOLD_MS = 1500;

/** Responsive deterministic ECharts cloud shared by analysis-specific wrappers. */
function ResponsiveWordCloudInstance({
  words,
  color = 'currentColor',
  minWidth = 180,
  minHeight = 0,
  aspectRatio = 0.6,
  height,
  svgRef,
  onWordClick,
  onWordContextMenu,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const wordClickRef = useRef(onWordClick);
  const wordContextMenuRef = useRef(onWordContextMenu);
  const svgRefRef = useRef(svgRef);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const measuredWidth = useElementWidth(containerRef);
  const cloudWidth = Math.max(minWidth, measuredWidth);
  const cloudHeight = Math.max(minHeight, height ?? Math.round(cloudWidth * aspectRatio));
  const interactive = Boolean(onWordClick ?? onWordContextMenu);
  const ariaLabel = words.map((word) => `${word.text}: ${String(word.value)}`).join(', ');
  // Parents rebuild the words array on unrelated renders (for example when a
  // saved stop-word list echoes back). Relayout only when the content changes,
  // because every relayout clears and redraws the whole cloud.
  const wordsSignature = JSON.stringify(
    words.map((word) => [word.text, word.value, word.color ?? null]),
  );
  const stableWords = useMemo(
    () =>
      (JSON.parse(wordsSignature) as [string, number, string | null][]).map(
        ([text, value, wordColor]) => ({ text, value, color: wordColor ?? undefined }),
      ),
    [wordsSignature],
  );

  useEffect(() => {
    wordClickRef.current = onWordClick;
    wordContextMenuRef.current = onWordContextMenu;
    svgRefRef.current = svgRef;
  }, [onWordClick, onWordContextMenu, svgRef]);

  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;

    // Suppress the native context menu in the capture phase, before zrender's
    // own listener runs. A right-click that adds a stop word re-renders the
    // cloud synchronously and detaches the SVG target, after which React's
    // delegated onContextMenu can no longer resolve it and never fires.
    const suppressNativeContextMenu = (event: MouseEvent) => {
      if (wordContextMenuRef.current) event.preventDefault();
    };
    element.addEventListener('contextmenu', suppressNativeContextMenu, true);

    const chart = init(element, undefined, { renderer: 'svg' });
    chartRef.current = chart;

    const handleClick = (event: WordCloudPointerEvent) => {
      if (event.name) wordClickRef.current?.(event.name);
    };
    const handleContextMenu = (event: WordCloudPointerEvent) => {
      if (event.name) wordContextMenuRef.current?.(event.name);
    };

    chart.on('click', 'series.wordCloud', handleClick as never);
    chart.on('contextmenu', 'series.wordCloud', handleContextMenu as never);

    return () => {
      element.removeEventListener('contextmenu', suppressNativeContextMenu, true);
      chart.off('click', handleClick);
      chart.off('contextmenu', handleContextMenu);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const element = plotRef.current;
    if (!chart || !element) return;

    const sizingWords = stableWords.map((word) => ({
      text: word.text,
      value: wordCloudSizingValue(word.value),
    }));
    const layoutSize = wordCloudLayoutSize({
      width: cloudWidth,
      height: cloudHeight,
      words: sizingWords,
    });
    const series: WordflowWordCloudSeriesOption = {
      type: 'wordCloud',
      // Circle stretched to the pane (keepAspect: false) gives the rounded cloud.
      shape: 'circle',
      keepAspect: false,
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      sizeRange: layoutSize.sizeRange,
      rotationRange: [0, 0],
      rotationStep: 1,
      gridSize: layoutSize.gridSize,
      drawOutOfBound: false,
      shrinkToFit: true,
      layoutAnimation: false,
      silent: !interactive,
      cursor: interactive ? 'pointer' : 'default',
      textStyle: {
        color,
        fontFamily: 'Segoe UI, Roboto, sans-serif',
        fontWeight: 'normal',
      },
      data: stableWords.map((word) => ({
        name: word.text,
        value: wordCloudSizingValue(word.value),
        textStyle: {
          color: word.color ?? color,
        },
      })),
    };

    // Hold a copy of the current cloud on top while the new layout computes, so
    // replacing the words does not flash an empty pane.
    const overlay = overlayRef.current;
    const previousSvg = element.querySelector('svg');
    if (overlay && previousSvg?.querySelector('text')) {
      overlay.replaceChildren(previousSvg.cloneNode(true));
    }
    const releaseOverlay = () => {
      overlay?.replaceChildren();
    };
    const drawn = new MutationObserver(() => {
      if (!element.querySelector('svg text')) return;
      releaseOverlay();
      drawn.disconnect();
    });
    drawn.observe(element, { childList: true, subtree: true });
    const overlayFallback = window.setTimeout(releaseOverlay, OVERLAY_MAX_HOLD_MS);

    // echarts-wordcloud defers its first layout pass even when layoutAnimation is
    // disabled. Dispose the previous layout before replacing the option so a
    // pending pass cannot append stale words after a resize or tab remount.
    chart.clear();
    chart.resize({ width: cloudWidth, height: cloudHeight });
    chart.setOption({ animation: false, series: [series] }, { notMerge: true, lazyUpdate: false });

    const svg = element.querySelector('svg');
    svgRefRef.current?.(svg);
    return () => {
      drawn.disconnect();
      window.clearTimeout(overlayFallback);
      svgRefRef.current?.(null);
    };
  }, [cloudHeight, cloudWidth, color, interactive, stableWords]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        ref={plotRef}
        role="img"
        aria-label={ariaLabel}
        style={{ width: `${String(cloudWidth)}px`, height: `${String(cloudHeight)}px` }}
      />
      <div
        ref={overlayRef}
        aria-hidden="true"
        data-testid="word-cloud-previous-frame"
        className="pointer-events-none absolute left-0 top-0"
      />
    </div>
  );
}

/** ECharts layout is an identity-sensitive external boundary, so prop-stable parents may skip it. */
export const ResponsiveWordCloud = memo(ResponsiveWordCloudInstance);
