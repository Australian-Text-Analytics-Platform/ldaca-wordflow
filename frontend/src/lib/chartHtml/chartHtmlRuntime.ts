/** What the downloaded HTML file needs besides the ECharts library (issue 278). */
export interface ChartHtmlPayload {
  /** The chart option as shown, with formatter markers in place of functions. */
  option: unknown;
  /** Tooltip text per data row; each group's colour dot is a placeholder. */
  tooltips: string[] | null;
  /** The groups whose colour dots appear in `tooltips`. */
  tooltipSeriesIds: string[];
  width: number;
  height: number;
}

export const FORMATTER_MARKER = '__wordflowFormatter';
export const TOOLTIP_MARKER_START = '\u0001';
export const TOOLTIP_MARKER_END = '\u0002';

interface EChartsLike {
  init: (
    element: HTMLElement,
    theme: null,
    options: { renderer: 'svg'; width: number; height: number },
  ) => {
    setOption: (option: unknown) => void;
    on: (event: string, handler: () => void) => void;
  };
}

/**
 * Draws the chart inside the downloaded file. Self-contained on purpose: the
 * download embeds this function's source and calls it with the ECharts
 * library, the payload, and the embedded `formatterFromSpec` and
 * `formatChartDate`, so it must not use anything outside its body.
 */
export function runChartHtml(
  echartsLib: EChartsLike,
  element: HTMLElement,
  payload: ChartHtmlPayload,
  makeFormatter: (
    spec: never,
    formatDate: (wallClockMs: number, unit: never) => string,
  ) => (value: unknown) => string,
  formatDate: (wallClockMs: number, unit: never) => string,
): void {
  const markerKey = '__wordflowFormatter';
  const tooltipIds = payload.tooltipSeriesIds;
  const tooltipFormatter = (rawParams: unknown): string => {
    const params = (Array.isArray(rawParams) ? rawParams : [rawParams]) as {
      seriesId?: string;
      dataIndex?: number;
      marker?: string;
    }[];
    const row = params.find(
      (param) => typeof param.dataIndex === 'number' && tooltipIds.includes(param.seriesId ?? ''),
    );
    if (!row || typeof row.dataIndex !== 'number') return '';
    let text = payload.tooltips?.[row.dataIndex] ?? '';
    for (const id of tooltipIds) {
      const marker = params.find((param) => param.seriesId === id)?.marker ?? '';
      text = text.split(`\u0001${id}\u0002`).join(marker);
    }
    return text;
  };
  const toFormatter = (spec: { kind: string; labels?: Record<string, string> }) => {
    if (spec.kind === 'tooltip') return tooltipFormatter;
    if (spec.kind === 'lookup') {
      const labels = spec.labels ?? {};
      return (value: unknown) => labels[String(value)] ?? String(value);
    }
    return makeFormatter(spec as never, formatDate);
  };
  const revive = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(revive);
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const spec = record[markerKey];
      if (spec && typeof spec === 'object') return toFormatter(spec as { kind: string });
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(record)) out[key] = revive(entry);
      return out;
    }
    return value;
  };
  const chart = echartsLib.init(element, null, {
    renderer: 'svg',
    width: payload.width,
    height: payload.height,
  });
  // Safari keeps a stale clip on SVG lines and areas unless each clipPath is
  // re-inserted after a render (issue 213); the app does the same.
  chart.on('rendered', () => {
    for (const clip of element.querySelectorAll('clipPath')) {
      const parent = clip.parentNode;
      if (!parent) continue;
      const next = clip.nextSibling;
      parent.removeChild(clip);
      parent.insertBefore(clip, next);
    }
  });
  chart.setOption(revive(payload.option));
}
