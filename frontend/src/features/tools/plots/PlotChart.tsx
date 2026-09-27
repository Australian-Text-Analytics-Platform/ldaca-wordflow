import { useEffect, useRef, useState, type ReactNode } from 'react';
import { init, use as register, type EChartsCoreOption, type EChartsType } from 'echarts/core';
import { BarChart, LineChart, ScatterChart, HeatmapChart, SankeyChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  VisualMapComponent,
  CalendarComponent,
  TitleComponent,
  AriaComponent,
  GraphicComponent,
} from 'echarts/components';
import { useActiveTheme } from '@/features/theme/themeRuntime';
import { SVGRenderer } from 'echarts/renderers';
import { Button } from '@/components/ui/button';
import { updatePlotMarkers } from './plotRendering';
import type { PlotPoint } from './plotModel';
register([
  BarChart,
  LineChart,
  ScatterChart,
  HeatmapChart,
  SankeyChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  VisualMapComponent,
  CalendarComponent,
  TitleComponent,
  AriaComponent,
  GraphicComponent,
  SVGRenderer,
]);
interface Props {
  option: EChartsCoreOption;
  points: PlotPoint[];
  height: number;
  minimumWidth?: number;
  toolbarEnd?: ReactNode;
  rectangular: boolean;
  horizontal?: boolean;
  intervals: boolean;
  cartesian: boolean;
  onSelect: (keys: string[], add: boolean, range: boolean) => void;
}
export function PlotChart({
  option,
  points,
  height,
  minimumWidth,
  toolbarEnd,
  rectangular,
  horizontal = false,
  intervals,
  cartesian,
  onSelect,
}: Props) {
  const [inspection, setInspection] = useState<{ range: string; date: string } | null>(null);
  const calendars = option.calendar as
    | { left: number; top: number; range: [string, string]; cellSize: [number, number] }[]
    | undefined;
  const range = JSON.stringify(calendars?.[0]?.range ?? []);
  const inspectedDate = inspection?.range === range ? inspection.date : null;
  const theme = useActiveTheme();
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);
  const callbacks = useRef({ points, rectangular, horizontal, intervals, cartesian, onSelect });
  const [interaction, setInteraction] = useState<'select' | 'zoom' | null>(null);
  const interactionRef = useRef(interaction);
  const [emptyViewport, setEmptyViewport] = useState(false);
  const [drag, setDrag] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    minimumWidth?: number;
  } | null>(null);
  const [focused, setFocused] = useState(0);
  const zoom = useRef<{ start: number; end: number }[]>([]);
  const axes = useRef('');
  useEffect(() => {
    callbacks.current = { points, rectangular, horizontal, intervals, cartesian, onSelect };
    interactionRef.current = interaction;
  }, [points, rectangular, horizontal, intervals, cartesian, onSelect, interaction]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const instance = init(element, undefined, { renderer: 'svg' });
    chart.current = instance;
    instance.on('click', (event) => {
      const data = event.data as { selectionKey?: string } | null;
      if (data?.selectionKey && !interactionRef.current)
        callbacks.current.onSelect(
          [data.selectionKey],
          Boolean(
            event.event?.event && 'shiftKey' in event.event.event && event.event.event.shiftKey,
          ),
          false,
        );
    });
    instance
      .getZr()
      .on(
        'click',
        (event: {
          target?: unknown;
          offsetX: number;
          offsetY: number;
          event?: { shiftKey?: boolean };
        }) => {
          if (
            event.target ||
            interactionRef.current ||
            !callbacks.current.intervals ||
            !callbacks.current.cartesian ||
            !instance.containPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY])
          )
            return;
          const position = instance.convertFromPixel({ gridIndex: 0 }, [
            event.offsetX,
            event.offsetY,
          ])[0];
          if (position === undefined) return;
          const nearest = callbacks.current.points.reduce<PlotPoint | undefined>(
            (best, point) =>
              !best || Math.abs(point.x - position) < Math.abs(best.x - position) ? point : best,
            undefined,
          );
          if (nearest)
            callbacks.current.onSelect([nearest.key], Boolean(event.event?.shiftKey), false);
        },
      );
    const updateViewport = () => {
      const current = callbacks.current;
      if (!current.cartesian) return;
      setEmptyViewport(
        current.points.length > 0 &&
          !current.points.some((point) => {
            const pixel = instance.convertToPixel({ gridIndex: 0 }, [point.x, point.y]);
            return instance.containPixel({ gridIndex: 0 }, pixel);
          }),
      );
    };
    instance.on('datazoom', () => {
      const options = instance.getOption().dataZoom as { start: number; end: number }[] | undefined;
      zoom.current = options?.map(({ start, end }) => ({ start, end })) ?? [];
      updateViewport();
      updatePlotMarkers(instance);
    });
    let start: number[] | null = null;
    let moved = false;
    let startPixel: [number, number] | null = null;
    const coordinates = (event: { offsetX: number; offsetY: number }) =>
      instance.convertFromPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY]);
    instance.getZr().on('mousedown', (event: { offsetX: number; offsetY: number }) => {
      if (
        interactionRef.current &&
        callbacks.current.cartesian &&
        instance.containPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY])
      ) {
        start = coordinates(event);
        startPixel = [event.offsetX, event.offsetY];
        moved = false;
      }
    });
    instance.getZr().on('globalout', () => {
      setInspection(null);
    });
    instance.getZr().on('mousemove', (event: { offsetX: number; offsetY: number }) => {
      const calendars = (instance.getOption().calendar ?? []) as {
        left: number;
        top: number;
        range: [string, string];
        cellSize: [number, number];
      }[];
      if (calendars.length) {
        let date: string | null = null;
        for (let index = 0; index < calendars.length; index++) {
          const calendar = calendars[index];
          if (!calendar) continue;
          if (
            event.offsetX < calendar.left ||
            event.offsetY < calendar.top ||
            event.offsetY > calendar.top + 7 * calendar.cellSize[1]
          )
            continue;
          const timestamp = instance.convertFromPixel({ seriesIndex: index }, [
            event.offsetX,
            event.offsetY,
          ]) as unknown as number;
          if (!Number.isFinite(timestamp)) continue;
          const candidate = new Date(timestamp).toISOString().slice(0, 10);
          if (candidate >= calendar.range[0] && candidate <= calendar.range[1]) {
            date = candidate;
            break;
          }
        }
        setInspection((old) =>
          date
            ? old?.date === date && old.range === JSON.stringify(calendars[0]?.range)
              ? old
              : { date, range: JSON.stringify(calendars[0]?.range) }
            : null,
        );
      }
      if (start && startPixel) {
        moved = true;
        setDrag({
          left: Math.min(startPixel[0], event.offsetX),
          top: Math.min(startPixel[1], event.offsetY),
          width: Math.abs(event.offsetX - startPixel[0]),
          height: Math.abs(event.offsetY - startPixel[1]),
        });
      }
    });
    instance
      .getZr()
      .on(
        'mouseup',
        (event: { offsetX: number; offsetY: number; event?: { shiftKey?: boolean } }) => {
          if (!start) return;
          const end = coordinates(event),
            begin = start;
          start = null;
          startPixel = null;
          setDrag(null);
          if (!moved || begin[0] === undefined || end[0] === undefined) return;
          const left = Math.min(begin[0], end[0]),
            right = Math.max(begin[0], end[0]),
            bottom = Math.min(begin[1] ?? 0, end[1] ?? 0),
            top = Math.max(begin[1] ?? 0, end[1] ?? 0);
          if (interactionRef.current === 'zoom') {
            const controls = instance.getOption().dataZoom as {
              xAxisIndex?: number[];
              yAxisIndex?: number | number[];
            }[];
            controls.forEach((control, dataZoomIndex) => {
              const vertical = Array.isArray(control.yAxisIndex)
                ? control.yAxisIndex.length > 0
                : control.yAxisIndex !== undefined;
              instance.dispatchAction({
                type: 'dataZoom',
                dataZoomIndex,
                startValue: vertical ? bottom : left,
                endValue: vertical ? top : right,
              });
            });
            setInteraction(null);
            return;
          }
          const keys = callbacks.current.points
            .filter(
              (p) =>
                (callbacks.current.horizontal
                  ? p.y >= bottom && p.y <= top
                  : p.x >= left && p.x <= right) &&
                (!callbacks.current.rectangular || (p.y >= bottom && p.y <= top)),
            )
            .map((p) => p.key);
          callbacks.current.onSelect([...new Set(keys)], Boolean(event.event?.shiftKey), true);
        },
      );
    let resizeFrame = 0;
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (
          instance.getWidth() !== element.clientWidth ||
          instance.getHeight() !== element.clientHeight
        )
          instance.resize();
        updatePlotMarkers(instance);
      });
    });
    resize.observe(element);
    return () => {
      resize.disconnect();
      cancelAnimationFrame(resizeFrame);
      instance.dispose();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const foreground =
      getComputedStyle(document.documentElement).getPropertyValue('--vscode-foreground').trim() ||
      getComputedStyle(host.current ?? document.body).color;
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue('--vscode-surface-background')
      .trim();
    const signature = JSON.stringify([
      (option.xAxis as { type?: string } | undefined)?.type,
      (option.yAxis as { type?: string } | undefined)?.type,
    ]);
    if (axes.current !== signature) {
      zoom.current = [];
      axes.current = signature;
    }
    const calendars = option.calendar as Record<string, unknown>[] | undefined;
    const titles = option.title as Record<string, unknown>[] | undefined;
    instance.setOption(
      {
        ...option,
        textStyle: { color: foreground },
        dataZoom: (option.dataZoom as Record<string, unknown>[] | undefined)?.map((control) => ({
          ...control,
          ...(control.type === 'inside' ? { moveOnMouseMove: !interaction } : {}),
        })),
        graphic: (
          option.graphic as { children: { type: string; style?: object }[] }[] | undefined
        )?.map((group) => ({
          ...group,
          children: group.children.map((child) =>
            child.type === 'text'
              ? { ...child, style: { ...child.style, fill: foreground } }
              : child,
          ),
        })),
        series: (option.series as Record<string, unknown>[] | undefined)?.map((series) => ({
          ...series,
          ...(series.type === 'sankey'
            ? { label: { ...(series.label as object), color: foreground, textBorderWidth: 0 } }
            : {}),
          ...(series.type === 'heatmap'
            ? {
                data: (series.data as { selectionOutline?: boolean; itemStyle?: object }[]).map(
                  (item) =>
                    item.selectionOutline
                      ? { ...item, itemStyle: { ...item.itemStyle, borderColor: foreground } }
                      : item,
                ),
              }
            : {}),
        })),
        animation: false,
        aria: { enabled: false },
        calendar: calendars?.map((calendar) => ({
          ...calendar,
          dayLabel: { ...(calendar.dayLabel as object), firstDay: 1, color: foreground },
          monthLabel: { ...(calendar.monthLabel as object), color: foreground },
          itemStyle: { color: background, borderColor: foreground, borderWidth: 0.3 },
          splitLine: { lineStyle: { color: foreground, opacity: 0.4 } },
        })),
        title: titles?.map((title) => ({
          ...title,
          textStyle: { ...(title.textStyle as object), fontSize: 13, color: foreground },
        })),
        visualMap: option.visualMap
          ? { ...option.visualMap, textStyle: { color: foreground } }
          : undefined,
        tooltip: {
          ...(option.tooltip as Record<string, unknown>),
          backgroundColor: background,
          textStyle: { color: foreground },
        },
        xAxis: option.xAxis
          ? {
              ...option.xAxis,
              axisLabel: {
                ...(option.xAxis as { axisLabel?: object }).axisLabel,
                color: foreground,
              },
              nameTextStyle: { color: foreground },
              splitLine: { lineStyle: { color: foreground, opacity: 0.12 } },
            }
          : undefined,
        yAxis: option.yAxis
          ? {
              ...option.yAxis,
              axisLabel: {
                ...(option.yAxis as { axisLabel?: object }).axisLabel,
                color: foreground,
              },
              nameTextStyle: { color: foreground },
              splitLine: { lineStyle: { color: foreground, opacity: 0.12 } },
            }
          : undefined,
      },
      { notMerge: true },
    );
    const savedZoom = zoom.current;
    savedZoom.forEach((value, dataZoomIndex) => {
      instance.dispatchAction({ type: 'dataZoom', dataZoomIndex, ...value });
    });
    updatePlotMarkers(instance);
  }, [option, interaction, theme]);
  const zoomBy = (factor: number) => {
    const current = zoom.current[0] ?? { start: 0, end: 100 };
    const center = (current.start + current.end) / 2,
      span = Math.min(100, Math.max(0.1, (current.end - current.start) * factor));
    const start = Math.max(0, Math.min(100 - span, center - span / 2));
    chart.current?.dispatchAction({ type: 'dataZoom', start, end: start + span });
  };
  const current = points[Math.min(focused, Math.max(0, points.length - 1))];
  return (
    <div className="group/plot min-w-0 max-w-full space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {cartesian && (
          <>
            <Button
              variant={interaction === 'select' ? 'default' : 'outline'}
              aria-pressed={interaction === 'select'}
              onClick={() => {
                setInteraction(interaction === 'select' ? null : 'select');
              }}
            >
              Select range
            </Button>
            {rectangular && (
              <Button
                variant={interaction === 'zoom' ? 'default' : 'outline'}
                aria-pressed={interaction === 'zoom'}
                onClick={() => {
                  setInteraction(interaction === 'zoom' ? null : 'zoom');
                }}
              >
                Zoom area
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                zoomBy(0.7);
              }}
            >
              Zoom in
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                zoomBy(1 / 0.7);
              }}
            >
              Zoom out
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                zoom.current = [];
                chart.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
              }}
            >
              Reset zoom
            </Button>
          </>
        )}
        <div className="ml-auto">{toolbarEnd}</div>
      </div>
      {cartesian && (
        <p className="text-description text-label-secondary">
          {interaction === 'select'
            ? 'Drag to replace selection; Shift-drag adds. Escape exits selection.'
            : interaction === 'zoom'
              ? 'Drag a rectangle to zoom. Escape cancels. Zoom does not change selection.'
              : 'Click to select. Ctrl + wheel zooms; ordinary scrolling moves the page.'}
        </p>
      )}
      {cartesian && emptyViewport && points.length > 0 && (
        <p role="status">
          No observations in this viewport.{' '}
          <Button
            variant="outline"
            onClick={() => {
              zoom.current = [];
              chart.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
            }}
          >
            Show full plot
          </Button>
        </p>
      )}
      {minimumWidth && (
        <p className="text-description text-label-secondary">
          Scroll horizontally if the complete chart does not fit.
        </p>
      )}
      <div
        className="max-w-full overflow-x-auto overscroll-x-contain"
        role="region"
        aria-label="Scrollable plot"
        tabIndex={0}
      >
        <div className="relative" style={{ minWidth: minimumWidth }}>
          {drag && (
            <div
              aria-hidden
              className="pointer-events-none absolute z-10 border border-focus bg-focus/10"
              style={drag}
            />
          )}
          <div
            ref={host}
            data-testid="plot-chart"
            role="application"
            aria-label="Plot. Use arrow keys to inspect, Enter to select, Shift to extend selection."
            tabIndex={0}
            className="w-full min-w-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            style={{
              height,
              minWidth: minimumWidth,
              cursor: interaction ? 'crosshair' : undefined,
            }}
            onBlur={() => {
              setInspection(null);
            }}
            onKeyDown={(event) => {
              if (
                calendars?.length &&
                ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
                  event.key,
                )
              ) {
                event.preventDefault();
                const [first, last] = calendars[0]?.range ?? ['', ''];
                const delta =
                  event.key === 'ArrowUp'
                    ? -7
                    : event.key === 'ArrowDown'
                      ? 7
                      : event.key === 'ArrowLeft'
                        ? -1
                        : 1;
                const next =
                  event.key === 'Home'
                    ? first
                    : event.key === 'End'
                      ? last
                      : new Date(
                          Date.parse((inspectedDate ?? first) + 'T00:00:00Z') + delta * 86400000,
                        )
                          .toISOString()
                          .slice(0, 10);
                setInspection({ range, date: next < first ? first : next > last ? last : next });
                return;
              }
              if (
                calendars?.length &&
                inspectedDate &&
                (event.key === 'Enter' || event.key === ' ')
              ) {
                event.preventDefault();
                const point = points.find((point) => point.key.slice(0, 10) === inspectedDate);
                if (point) onSelect([point.key], event.shiftKey, false);
                return;
              }
              if (event.key === 'Escape') {
                setInteraction(null);
                setInspection(null);
                return;
              }
              if (
                ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
                  event.key,
                )
              ) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? points.length - 1
                      : Math.max(
                          0,
                          Math.min(
                            points.length - 1,
                            focused + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1),
                          ),
                        );
                setFocused(next);
                const point = points[next];
                if (point && cartesian) {
                  const pixel = chart.current?.convertToPixel({ gridIndex: 0 }, [point.x, point.y]);
                  if (pixel)
                    chart.current?.dispatchAction({ type: 'showTip', x: pixel[0], y: pixel[1] });
                  const lines = chart.current?.getOption().series as
                    | { type: string; data: { selectionKey?: string }[] }[]
                    | undefined;
                  lines?.forEach((line, seriesIndex) => {
                    if (line.type !== 'line') return;
                    const dataIndex = line.data.findIndex(
                      (item) => item.selectionKey === point.key,
                    );
                    chart.current?.dispatchAction({ type: 'downplay', seriesIndex });
                    if (dataIndex >= 0)
                      chart.current?.dispatchAction({
                        type: 'highlight',
                        seriesIndex,
                        dataIndex,
                        notBlur: true,
                      });
                  });
                }
                if (chart.current) updatePlotMarkers(chart.current);
                if (event.shiftKey && points[next]) onSelect([points[next].key], true, false);
              } else if ((event.key === 'Enter' || event.key === ' ') && current) {
                event.preventDefault();
                onSelect([current.key], event.shiftKey, false);
              }
            }}
          />
          {inspectedDate &&
            calendars?.map((calendar, index) => {
              const series = (
                option.series as { data: { value: [string, number | null]; summary: string }[] }[]
              )[index];
              const point = series?.data.find((item) => item.value[0] === inspectedDate);
              const firstDay = Date.parse(calendar.range[0] + 'T00:00:00Z');
              const day =
                Math.round((Date.parse(inspectedDate + 'T00:00:00Z') - firstDay) / 86400000) +
                ((new Date(firstDay).getUTCDay() + 6) % 7);
              const pixel = [
                calendar.left + (Math.floor(day / 7) + 0.5) * calendar.cellSize[0],
                calendar.top + ((day % 7) + 0.5) * calendar.cellSize[1],
              ];
              const next = calendars[index + 1];
              const nextLeft = next?.top === calendar.top ? next.left : undefined;
              const width = nextLeft ? nextLeft - calendar.left - 12 : (minimumWidth ?? 360) - 77;
              return (
                <div key={index}>
                  {
                    <div
                      aria-hidden
                      className="pointer-events-none absolute border-2 border-focus"
                      style={{
                        left: (pixel[0] ?? 0) - 11,
                        top: (pixel[1] ?? 0) - 10,
                        width: 22,
                        height: 20,
                      }}
                    />
                  }
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute break-words rounded border border-surface-border bg-surface p-1 text-description"
                    style={{ left: calendar.left - 40, top: calendar.top + 145, width }}
                  >
                    {point
                      ? point.value[1] === null
                        ? `${inspectedDate} · No usable measurement`
                        : point.summary
                      : `${inspectedDate} · Outside the observed date range`}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
      {!cartesian && current && (
        <p
          data-testid="plot-inspection"
          aria-hidden="true"
          className="invisible break-words rounded border border-surface-border p-2 text-description group-focus-within/plot:visible"
        >
          {current.summary}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {current?.summary}
      </p>
    </div>
  );
}
