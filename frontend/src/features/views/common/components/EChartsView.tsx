import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { BarChart, LineChart } from 'echarts/charts';
import {
  AriaComponent,
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  MarkAreaComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import {
  init,
  use as registerEChartsModules,
  type EChartsCoreOption,
  type EChartsType,
} from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

import { Button } from '@/components/ui/button';
import { fitBars } from '@/lib/barFit';
import { ECHARTS_WHEEL_ZOOM_MODIFIER, isChartZoomWheel } from '@/lib/chartZoom';

registerEChartsModules([
  LineChart,
  BarChart,
  AriaComponent,
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  // Shades selected periods on numeric Trends axes (issue 190).
  MarkAreaComponent,
  TooltipComponent,
  VisualMapComponent,
  SVGRenderer,
]);

interface EChartsZoomRange {
  start: number;
  end: number;
}

interface EChartsShowTipEvent {
  dataIndex?: number;
}

interface EChartsPointerEvent {
  offsetX?: number;
  offsetY?: number;
  event?: { shiftKey?: boolean };
}

interface EChartsDataZoomEvent {
  start?: number;
  end?: number;
  batch?: { start?: number; end?: number }[];
}

interface EChartsViewProps {
  option: EChartsCoreOption;
  height: number;
  pointCount: number;
  dataResetKey: string;
  ariaLabel: string;
  selectedIndices?: ReadonlySet<number>;
  onSelect?: (index: number, shiftHeld: boolean) => void;
  getPointSummary?: (index: number) => string;
  /**
   * Reminder shown under the chart when points can be selected, for example
   * "Click a period to select it; Shift-click another to select the periods
   * between" (issue 224).
   */
  selectionHint?: string;
  /**
   * Fit bar series to the chart's width (issue 225): stack them when the groups
   * don't fit side by side, and cap the zoom when even stacked bars would be too
   * thin. The value names the points in messages, for example "periods".
   */
  fitBarsLabel?: string;
  className?: string;
  testId?: string;
  toolbarStart?: ReactNode;
}

const FULL_ZOOM: EChartsZoomRange = { start: 0, end: 100 };
const MIN_ZOOM_SPAN = 5;

const clampZoomRange = (start: number, end: number): EChartsZoomRange => {
  const safeStart = Math.max(0, Math.min(100, start));
  const safeEnd = Math.max(safeStart, Math.min(100, end));
  return { start: safeStart, end: safeEnd };
};

const zoomAroundCenter = (
  current: EChartsZoomRange,
  factor: number,
  maxSpan = 100,
): EChartsZoomRange => {
  const center = (current.start + current.end) / 2;
  const width = Math.max(
    Math.min(MIN_ZOOM_SPAN, maxSpan),
    Math.min(maxSpan, (current.end - current.start) * factor),
  );
  let start = center - width / 2;
  let end = center + width / 2;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > 100) {
    start -= end - 100;
    end = 100;
  }
  return clampZoomRange(start, end);
};

const zoomFromEvent = (event: EChartsDataZoomEvent): EChartsZoomRange | null => {
  const payload = event.batch?.[0] ?? event;
  if (typeof payload.start !== 'number' || typeof payload.end !== 'number') return null;
  return clampZoomRange(payload.start, payload.end);
};

const PLOT_WIDTH_ALLOWANCE = 90;

type SeriesOption = Record<string, unknown>;

const countBarSeries = (option: EChartsCoreOption): number =>
  Array.isArray(option.series)
    ? (option.series as SeriesOption[]).filter((series) => series.type === 'bar').length
    : 0;

/** One bar per point with the groups on top of each other (issue 225). */
const stackBarSeries = (series: unknown): unknown =>
  Array.isArray(series)
    ? (series as SeriesOption[]).map((item) =>
        item.type === 'bar'
          ? {
              ...item,
              stack: 'wordflow-bars',
              itemStyle: { ...(item.itemStyle as SeriesOption | undefined), borderRadius: 0 },
            }
          : item,
      )
    : series;

/**
 * Owns the imperative ECharts lifecycle for analysis charts.
 *
 * The callback refs are intentionally stable: ECharts subscriptions are an
 * identity-sensitive external-library boundary and must not be recreated on
 * every React render.
 */
function EChartsInstance({
  option,
  height,
  pointCount,
  ariaLabel,
  selectedIndices,
  onSelect,
  getPointSummary,
  selectionHint,
  fitBarsLabel,
  className,
  testId,
  toolbarStart,
}: EChartsViewProps) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const selectRef = useRef(onSelect);
  const summaryRef = useRef(getPointSummary);
  const nearestPointIndexRef = useRef<number | null>(null);
  const zoomRangeRef = useRef<EChartsZoomRange>(FULL_ZOOM);
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomRange, setZoomRange] = useState<EChartsZoomRange>(FULL_ZOOM);
  const [liveText, setLiveText] = useState('');
  const [plotWidth, setPlotWidth] = useState(0);

  useEffect(() => {
    selectRef.current = onSelect;
    summaryRef.current = getPointSummary;
  }, [getPointSummary, onSelect]);

  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;

    const chart = init(element, undefined, { renderer: 'svg' });
    chartRef.current = chart;

    const handleShowTip = (event: EChartsShowTipEvent) => {
      if (typeof event.dataIndex === 'number') nearestPointIndexRef.current = event.dataIndex;
    };
    const handlePlotClick = (event: EChartsPointerEvent) => {
      if (!selectRef.current) return;
      if (typeof event.offsetX !== 'number' || typeof event.offsetY !== 'number') return;
      const pixel: [number, number] = [event.offsetX, event.offsetY];
      if (!chart.containPixel({ gridIndex: 0 }, pixel)) return;

      // Let ECharts snap the axis pointer to the nearest complete-dataset row.
      // Its synchronous showTip event supplies the correct dataIndex for both
      // categorical and continuous axes, including while dataZoom is active.
      chart.dispatchAction({ type: 'updateAxisPointer', x: pixel[0], y: pixel[1] });
      const index = nearestPointIndexRef.current;
      if (index == null) return;
      setActiveIndex(index);
      setLiveText(summaryRef.current?.(index) ?? `Point ${String(index + 1)}`);
      selectRef.current(index, !!event.event?.shiftKey);
    };
    const handleDataZoom = (event: EChartsDataZoomEvent) => {
      const next = zoomFromEvent(event);
      if (next) {
        zoomRangeRef.current = next;
        setZoomRange(next);
      }
    };

    // Safari keeps painting a clipped line or area with a stale clip when the
    // SVG renderer changes a <clipPath> in place (entry animation, hover,
    // series added or removed), so lines vanished and only their dots showed
    // (issue 213). Re-inserting each clipPath after every render makes WebKit
    // rebuild it from its current shape. The nodes keep their identity, so the
    // renderer's own bookkeeping is unaffected.
    const refreshClipPaths = () => {
      for (const clip of element.querySelectorAll('clipPath')) {
        const parent = clip.parentNode;
        if (!parent) continue;
        const next = clip.nextSibling;
        parent.removeChild(clip);
        parent.insertBefore(clip, next);
      }
    };
    chart.on('rendered', refreshClipPaths);
    // ECharts cancels every wheel over an inside dataZoom, even one it then
    // ignores, so the pane could not scroll past the chart (issue 215). Only a
    // wheel with the zoom key held reaches ECharts.
    const keepPageScroll = (event: WheelEvent) => {
      if (!isChartZoomWheel(event)) event.stopPropagation();
    };
    element.addEventListener('wheel', keepPageScroll, { capture: true });
    chart.on('showtip', handleShowTip as never);
    chart.on('datazoom', handleDataZoom as never);
    chart.getZr().on('click', handlePlotClick);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
      setPlotWidth(element.clientWidth);
    });
    setPlotWidth(element.clientWidth);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
      chart.off('rendered', refreshClipPaths);
      element.removeEventListener('wheel', keepPageScroll, { capture: true });
      chart.off('showtip', handleShowTip);
      chart.off('datazoom', handleDataZoom);
      chart.getZr().off('click', handlePlotClick);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Bars fit the chart's width (issue 225). The axis labels and margins take
  // about PLOT_WIDTH_ALLOWANCE pixels of the element's width.
  const barSeriesCount = fitBarsLabel ? countBarSeries(option) : 0;
  const barFit =
    barSeriesCount > 0 && plotWidth > 0
      ? fitBars({
          plotWidth: plotWidth - PLOT_WIDTH_ALLOWANCE,
          pointCount,
          seriesCount: barSeriesCount,
          visiblePercent: zoomRange.end - zoomRange.start,
        })
      : null;
  const stackBars = barFit?.stacked ?? false;
  const maxSpan = barFit?.maxSpanPercent ?? 100;

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let currentZoom = zoomRangeRef.current;
    if (currentZoom.end - currentZoom.start > maxSpan + 0.001) {
      // Too many points for bars: show the first ones that fit (issue 225).
      currentZoom = clampZoomRange(currentZoom.start, currentZoom.start + maxSpan);
      if (currentZoom.end - currentZoom.start < maxSpan) {
        currentZoom = { start: Math.max(0, 100 - maxSpan), end: 100 };
      }
      zoomRangeRef.current = currentZoom;
      setZoomRange(currentZoom);
    }
    const series = stackBars ? stackBarSeries(option.series) : option.series;
    chart.setOption(
      {
        ...option,
        ...(series === undefined ? {} : { series }),
        aria: {
          enabled: true,
          decal: { show: true },
          description: ariaLabel,
        },
        dataZoom: [
          {
            id: 'wordflow-inside-zoom',
            type: 'inside',
            xAxisIndex: 0,
            start: currentZoom.start,
            end: currentZoom.end,
            maxSpan,
            filterMode: 'none',
            // Scrolling the page must not zoom the chart (issue 213); Cmd
            // (Ctrl elsewhere) + scroll zooms, as in every chart (issue 215).
            zoomOnMouseWheel: ECHARTS_WHEEL_ZOOM_MODIFIER,
            moveOnMouseMove: false,
            moveOnMouseWheel: false,
          },
          {
            id: 'wordflow-slider-zoom',
            type: 'slider',
            xAxisIndex: 0,
            start: currentZoom.start,
            end: currentZoom.end,
            maxSpan,
            filterMode: 'none',
            bottom: 4,
            height: 20,
            showDetail: false,
            brushSelect: false,
            // Theme tokens so the slider stands out in light and dark (issue 213).
            borderColor: 'var(--vscode-charts-lines)',
            fillerColor: 'color-mix(in srgb, var(--vscode-focusBorder) 22%, transparent)',
            handleStyle: {
              color: 'var(--vscode-editor-background)',
              borderColor: 'var(--vscode-focusBorder)',
              borderWidth: 1.5,
            },
            moveHandleStyle: { color: 'var(--vscode-focusBorder)', opacity: 0.55 },
            dataBackground: {
              lineStyle: { color: 'var(--vscode-focusBorder)', opacity: 0.45 },
              areaStyle: { color: 'var(--vscode-focusBorder)', opacity: 0.12 },
            },
            selectedDataBackground: {
              lineStyle: { color: 'var(--vscode-focusBorder)', opacity: 0.8 },
              areaStyle: { color: 'var(--vscode-focusBorder)', opacity: 0.25 },
            },
            emphasis: {
              handleStyle: { borderColor: 'var(--vscode-focusBorder)', borderWidth: 2 },
              moveHandleStyle: { color: 'var(--vscode-focusBorder)', opacity: 0.8 },
            },
          },
        ],
      },
      { notMerge: true, lazyUpdate: false },
    );
  }, [ariaLabel, option, stackBars, maxSpan]);

  const moveActivePoint = (nextIndex: number) => {
    if (pointCount <= 0) return;
    const bounded = Math.max(0, Math.min(pointCount - 1, nextIndex));
    setActiveIndex(bounded);
    setLiveText(summaryRef.current?.(bounded) ?? `Point ${String(bounded + 1)}`);
    chartRef.current?.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: bounded });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveActivePoint(activeIndex - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveActivePoint(activeIndex + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveActivePoint(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveActivePoint(pointCount - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (pointCount > 0) selectRef.current?.(activeIndex, event.shiftKey);
    } else if (event.key === 'Escape') {
      chartRef.current?.dispatchAction({ type: 'hideTip' });
    }
  };

  const setZoom = (next: EChartsZoomRange, announcement: string) => {
    zoomRangeRef.current = next;
    setZoomRange(next);
    setLiveText(announcement);
    chartRef.current?.dispatchAction({
      type: 'dataZoom',
      dataZoomId: 'wordflow-inside-zoom',
      start: next.start,
      end: next.end,
    });
  };

  // With a zoom cap (issue 225), "full" is the widest window allowed.
  const zoomSpan = zoomRange.end - zoomRange.start;
  const isWidestZoom = zoomSpan >= maxSpan - 0.001;
  const isFullZoom = zoomRange.start === 0 && isWidestZoom;

  return (
    <div className={className} data-testid={testId}>
      <div
        className="mb-2 flex flex-nowrap items-center justify-end gap-2 overflow-x-auto pb-1"
        aria-label="Chart controls"
      >
        {toolbarStart}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-control-sm"
          aria-label="Zoom in"
          onClick={() => {
            setZoom(zoomAroundCenter(zoomRange, 0.75, maxSpan), 'Chart zoomed in');
          }}
        >
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-control-sm"
          aria-label="Zoom out"
          disabled={isWidestZoom}
          onClick={() => {
            setZoom(zoomAroundCenter(zoomRange, 4 / 3, maxSpan), 'Chart zoomed out');
          }}
        >
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-control-sm"
          aria-label="Reset zoom"
          disabled={isFullZoom}
          onClick={() => {
            setZoom({ start: 0, end: maxSpan }, 'Chart zoom reset');
          }}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div
        ref={plotRef}
        role="group"
        aria-roledescription="interactive chart"
        aria-label={ariaLabel}
        aria-description="Use Left and Right Arrow to inspect points, Enter or Space to select one, and Shift+Enter to select the points between it and the last one selected."
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{ height: `${String(height)}px` }}
        className="w-full cursor-crosshair focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-border"
      />
      {barFit?.maxVisiblePoints ? (
        <p className="mt-1 text-label-secondary text-description">
          Too many {fitBarsLabel} to show as bars at once, so the chart shows up to{' '}
          {barFit.maxVisiblePoints.toLocaleString()} of {pointCount.toLocaleString()}. Drag the
          slider under the chart to see the others, or choose Line or Area to see them all.
        </p>
      ) : stackBars ? (
        <p className="mt-1 text-label-secondary text-description">
          The groups are stacked because they don&apos;t fit side by side at this width. Zoom in to
          see them side by side.
        </p>
      ) : null}
      {/* Clicking and Shift-clicking replace the Select range button (issue 224). */}
      {onSelect && selectionHint ? (
        <p className="mt-1 text-label-secondary text-description">{selectionHint}</p>
      ) : null}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveText}
      </div>
      <div className="sr-only">{String(selectedIndices?.size ?? 0)} chart points selected.</div>
    </div>
  );
}

/** Resets viewport-only state by remounting the imperative boundary for a new result key. */
export function EChartsView(props: EChartsViewProps) {
  return <EChartsInstance key={props.dataResetKey} {...props} />;
}
