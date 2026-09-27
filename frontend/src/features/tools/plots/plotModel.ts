import { format, type EChartsCoreOption } from 'echarts/core';
import type { PlotMode, PlotRequest, PlotSelection } from '@/features/project/api';
import { VIZ_PALETTE } from '../common/vizPalette';
import { showValue } from '../common/analysisValue';
export type PlotRow = Record<string, unknown>;
export interface PlotDisplay {
  timezone?: string;
  style: 'line' | 'area' | 'bar' | 'calendar';
  smooth: boolean;
  normalize: boolean;
  uncased: boolean;
  minimum_rows: number;
  order: 'category' | 'total';
  year: number;
  nonnegative: boolean;
  orientation?: 'horizontal' | 'vertical';
}
export interface PlotPoint {
  key: string;
  x: number;
  y: number;
  summary: string;
}
export interface PlotLegend {
  key: string;
  label: string;
  count: number;
  selected: number;
  color: string;
}
export const categoryLabel = (key: string): string => {
  const values: unknown = JSON.parse(key);
  const label = (v: unknown): string =>
    v === null
      ? '(Missing)'
      : v === ''
        ? '(empty)'
        : typeof v === 'string'
          ? ['(Missing)', '(empty)'].includes(v)
            ? JSON.stringify(v)
            : v
          : showValue(v);
  return Array.isArray(values)
    ? values.length
      ? values.map(label).join(' · ')
      : 'All rows'
    : label(values);
};
const text = (r: PlotRow, key: string) => showValue(r[key]);
const number = (r: PlotRow, key: string) =>
  r[key] === null || r[key] === undefined ? null : Number(r[key]);
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
export function plotMeasure(request: PlotRequest): string {
  if (!('measure' in request)) return 'Individual rows';
  return request.measure === 'count'
    ? 'Rows'
    : `${request.measure.slice(0, 1).toUpperCase()}${request.measure.slice(1)} of ${request.value ?? ''}`;
}
/** Keep category names complete; zoom/scroll supplies space instead of skipping labels. */
export function wrapPlotLabel(label: string, width = 150): string {
  const lines: string[] = [];
  let line = '';
  for (const word of label.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (format.getTextRect(candidate, '12px sans-serif').width <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const char of Array.from(word)) {
      if (line && format.getTextRect(line + char, '12px sans-serif').width > width) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

const insideZoom = {
  type: 'inside',
  filterMode: 'none',
  zoomOnMouseWheel: 'ctrl',
  moveOnMouseWheel: false,
};
/** DuckDB prints short UTC offsets; normalize them for both Chromium and WebKit. */
function timeCoordinate(value: string): number {
  const iso =
    value.includes(' ') || value.includes('T')
      ? value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
      : value;
  return Date.parse(
    iso.includes('T') ? (/(?:Z|[+-]\d{2}:\d{2})$/.test(iso) ? iso : iso + 'Z') : iso + 'T00:00:00Z',
  );
}
/** Offset unsafe exact axes before converting to renderer doubles, preserving small differences. */
function numericAxis(values: unknown[]) {
  const strings = values.map(String);
  const unsafe = strings.some(
    (v) => /^-?\d+(?:\.\d+)?$/.test(v) && !Number.isSafeInteger(Number(v.split('.')[0])),
  );
  if (!unsafe || !strings.every((v) => /^-?\d+(?:\.\d+)?$/.test(v)))
    return { coordinate: (v: unknown) => Number(v), suffix: '' };
  const scale = strings.reduce((n, v) => Math.max(n, v.split('.')[1]?.length ?? 0), 0);
  const integer = (v: string) => {
    const [whole, fraction = ''] = v.split('.');
    return BigInt((whole ?? '0') + fraction.padEnd(scale, '0'));
  };
  const origin = strings[0] ?? '0',
    base = integer(origin);
  return {
    coordinate: (v: unknown) => Number(integer(String(v)) - base) / 10 ** scale,
    suffix: ` (offset from ${origin})`,
  };
}
export function buildPlot(
  mode: PlotMode,
  request: PlotRequest,
  rows: PlotRow[],
  display: PlotDisplay,
  selection: PlotSelection,
  availableWidth = 0,
): {
  option: EChartsCoreOption;
  points: PlotPoint[];
  legend: PlotLegend[];
  height?: number;
  minimumWidth?: number;
} {
  const keys = [
    ...new Set(rows.map((r) => (typeof r.group_key === 'string' ? r.group_key : '[]'))),
  ];
  const grouped = new Map<string, PlotRow[]>();
  for (const row of rows) {
    const key = typeof row.group_key === 'string' ? row.group_key : '[]';
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }
  const colors = new Map(keys.map((key, i) => [key, VIZ_PALETTE[i % VIZ_PALETTE.length]]));
  const color = (key: string) => colors.get(key);
  const selectedKeys = new Set(
    mode === 'trends'
      ? selection.intervals
      : mode === 'scatter'
        ? selection.rows
        : mode === 'sankey'
          ? selection.transitions
          : selection.cells,
  );
  const points: PlotPoint[] = [];
  const selected = (key: string) => selectedKeys.has(key);
  const base: EChartsCoreOption = {
    animation: false,
    aria: { enabled: true },
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (p: { data?: { summary?: string } }) => escape(p.data?.summary ?? ''),
    },
    grid: {
      left: 72,
      right: 24,
      top: 36,
      bottom: 108,
      outerBoundsMode: 'same',
      outerBoundsContain: 'all',
    },
    dataZoom: [
      { ...insideZoom, xAxisIndex: 0 },
      { type: 'slider', filterMode: 'none', bottom: 12 },
    ],
    xAxis: { type: 'value', nameLocation: 'middle' },
    yAxis: { type: 'value' },
  };
  const legend = keys.map((key) => ({
    key,
    label: categoryLabel(key),
    count: (grouped.get(key) ?? []).reduce(
      (total, r) => total + (mode === 'scatter' ? 1 : Number(r.row_count ?? 0)),
      0,
    ),
    selected: 0,
    color: color(key) ?? '',
  }));
  const visible = rows.filter(
    (r) => !selection.hidden.includes(typeof r.group_key === 'string' ? r.group_key : '[]'),
  );
  const mark = (key: string, summary: string, x: number, y: number) => {
    points.push({ key, summary, x, y });
    return {
      selectionKey: key,
      selected: selected(key),
      summary,
      itemStyle: { opacity: selectedKeys.size && !selected(key) ? 0.35 : 1 },
    };
  };
  if (mode === 'trends' && 'axis' in request) {
    const totals = new Map<string, number>();
    rows.forEach((r) => {
      const key = text(r, 'interval_key');
      totals.set(key, (totals.get(key) ?? 0) + (number(r, 'value') ?? 0));
    });
    const isTime = request.interval.type === 'time';
    const axis = numericAxis(rows.map((r) => r.axis_value));
    const x = (r: PlotRow) =>
      isTime ? timeCoordinate(text(r, 'axis_value')) : axis.coordinate(r.axis_value);
    const value = (r: PlotRow) => {
      const v = number(r, 'value');
      const total = totals.get(text(r, 'interval_key')) ?? 0;
      return v === null ? null : display.normalize ? (total === 0 ? null : (v / total) * 100) : v;
    };
    for (const item of legend)
      item.selected = (grouped.get(item.key) ?? [])
        .filter((r) => selected(text(r, 'interval_key')))
        .reduce((n, r) => n + Number(r.row_count ?? 0), 0);
    if (display.style === 'calendar') {
      const shown = keys.filter((k) => !selection.hidden.includes(k));
      // Keep a common viewport even when a legend hides an early/late group.
      const dates = [...new Set(rows.map((r) => text(r, 'interval_key').slice(0, 10)))]
        .filter((date) => date.startsWith(`${String(display.year)}-`))
        .sort();
      const first = dates[0] ?? `${String(display.year)}-01-01`;
      const last = dates.at(-1) ?? first;
      const start = `${first.slice(0, 7)}-01`;
      const end = new Date(Date.UTC(display.year, Number(last.slice(5, 7)), 0))
        .toISOString()
        .slice(0, 10);
      const dayMillis = 86400000;
      const startDay = new Date(`${start}T00:00:00Z`);
      const weeks = Math.ceil(
        ((Date.parse(`${end}T00:00:00Z`) - startDay.getTime()) / dayMillis +
          1 +
          ((startDay.getUTCDay() + 6) % 7)) /
          7,
      );
      const minimumWidth = Math.max(300, weeks * 22 + 85);
      const columns = Math.max(1, Math.floor(availableWidth / minimumWidth));
      let top = 8;
      const title = shown.map((key) => {
        const label = categoryLabel(key);
        const lines = wrapPlotLabel(label, (minimumWidth - 85) * 0.9).split('\n');
        const item = {
          text: lines.join('\n'),
          top,
          left: 65,
          textStyle: { fontSize: 13, lineHeight: 18 },
        };
        top += lines.length * 18 + 28 + 140 + 32;
        return item;
      });
      // A row reserves the tallest wrapped heading, so all its cells align.
      top = 8;
      for (let first = 0; first < title.length; first += columns) {
        const row = title.slice(first, first + columns);
        const heading = Math.max(...row.map((item) => item.text.split('\n').length * 18));
        row.forEach((item, column) => {
          item.left = column * minimumWidth + 65;
        });
        const rowTop = first === 0 ? 8 : top;
        row.forEach((item) => {
          item.top = rowTop;
        });
        top = rowTop + heading + 28 + 140 + 72;
      }
      const calendar = title.map((item, index) => ({
        top:
          item.top +
          Math.max(
            ...title
              .slice(
                Math.floor(index / columns) * columns,
                (Math.floor(index / columns) + 1) * columns,
              )
              .map((heading) => heading.text.split('\n').length * 18),
          ) +
          28,
        left: item.left,
        cellSize: [22, 20],
        range: [start, end],
        dayLabel: { firstDay: 1 },
        yearLabel: { show: false },
      }));
      const values = visible.map(value).filter((v): v is number => v !== null);
      return {
        legend,
        points,
        height: top + 55,
        minimumWidth,
        option: {
          ...base,
          dataZoom: [],
          xAxis: undefined,
          yAxis: undefined,
          grid: undefined,
          title,
          calendar,
          tooltip: { show: false },
          visualMap: {
            min: values.reduce((a, b) => Math.min(a, b), 0),
            max: values.reduce((a, b) => Math.max(a, b), 1),
            calculable: true,
            orient: 'horizontal',
            bottom: 0,
            left: 'center',
          },
          series: shown.map((key, i) => ({
            id: key,
            type: 'heatmap',
            coordinateSystem: 'calendar',
            calendarIndex: i,
            data: (grouped.get(key) ?? [])
              .filter((r) => text(r, 'interval_key').startsWith(String(display.year)))
              .map((r) => {
                const k = text(r, 'interval_key'),
                  v = value(r);
                return {
                  ...mark(
                    k,
                    `${k} · ${categoryLabel(key)}: ${display.normalize ? String(v) + '%' : text(r, 'value')} · ${text(r, 'row_count')} rows`,
                    x(r),
                    v ?? 0,
                  ),
                  value: [k.slice(0, 10), v],
                };
              }),
          })),
        },
      };
    }
    const stack =
      (request.measure === 'count' || (request.measure === 'sum' && display.nonnegative)) &&
      display.style !== 'line';
    const series = keys
      .filter((k) => !selection.hidden.includes(k))
      .map((key) => ({
        id: key,
        name: categoryLabel(key),
        type: display.style === 'bar' ? 'bar' : 'line',
        stack: stack ? 'total' : undefined,
        smooth: display.smooth,
        areaStyle: display.style === 'area' ? {} : undefined,
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 7,
        itemStyle: { color: color(key) },
        emphasis: { focus: 'series' },
        data: (grouped.get(key) ?? []).map((r) => {
          const k = text(r, 'interval_key'),
            v = value(r);
          return {
            ...mark(
              k,
              `${k} · ${categoryLabel(key)}: ${text(r, 'value')}${display.normalize ? ` (${String(v)}%)` : ''} · ${text(r, 'contributing_count')} contributing rows`,
              x(r),
              v ?? 0,
            ),
            value: [x(r), v],
            itemStyle: {
              color: display.style === 'bar' || selected(k) ? color(key) : 'transparent',
              borderColor: color(key),
              borderWidth: 2,
              opacity: selectedKeys.size && !selected(k) ? 0.35 : 1,
            },
          };
        }),
      }));
    return {
      legend,
      points,
      option: {
        ...base,
        useUTC: true,
        xAxis: {
          type: isTime ? 'time' : 'value',
          name:
            request.axis +
            (isTime ? (display.timezone ? ` (${display.timezone})` : '') : axis.suffix),
          nameLocation: 'middle',
          nameGap: 36,
          axisLabel: {
            hideOverlap: true,
            ...(isTime && display.timezone
              ? {
                  formatter: (value: number) =>
                    new Intl.DateTimeFormat(undefined, {
                      timeZone: display.timezone,
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      ...('interval' in request &&
                      request.interval.type === 'time' &&
                      ['second', 'minute', 'hour'].includes(request.interval.unit)
                        ? {
                            hour: '2-digit' as const,
                            minute: '2-digit' as const,
                            ...(request.interval.unit === 'second'
                              ? { second: '2-digit' as const }
                              : {}),
                          }
                        : {}),
                    }).format(value),
                }
              : {}),
          },
          scale: true,
        },
        yAxis: {
          type: 'value',
          name: display.normalize ? '%' : request.measure,
          axisLabel: { hideOverlap: true },
          ...(!display.normalize && request.measure === 'count' ? { minInterval: 1 } : {}),
        },
        series,
      },
    };
  }
  if (mode === 'compare' && 'category' in request) {
    const totals = new Map<string, number>();
    rows.forEach((r) => {
      const key = text(r, 'category_key');
      totals.set(key, (totals.get(key) ?? 0) + (number(r, 'value') ?? 0));
    });
    // DuckDB orders exact totals before transport; category presentation only reorders labels.
    const categories = [...totals.keys()];
    if (display.order === 'category') categories.sort();
    const categoryIndex = new Map(categories.map((key, i) => [key, i]));
    const horizontal = display.orientation === 'horizontal';
    const categoryAxis = {
      type: 'category',
      name: request.category,
      inverse: horizontal,
      data: categories.map(categoryLabel),
      axisLabel: {
        interval: 0,
        formatter: (label: string) => wrapPlotLabel(label, horizontal ? 180 : 92),
      },
      nameGap: horizontal ? 20 : 70,
      nameLocation: horizontal ? 'start' : 'middle',
    };
    const valueAxis = {
      type: 'value',
      name: display.normalize ? 'Percentage (%)' : plotMeasure(request),
      nameLocation: horizontal ? 'middle' : 'end',
      nameGap: horizontal ? 30 : 20,
      ...(!display.normalize && request.measure === 'count' ? { minInterval: 1 } : {}),
    };
    for (const item of legend)
      item.selected = (grouped.get(item.key) ?? [])
        .filter((r) => selected(text(r, 'cell_key')))
        .reduce((n, r) => n + Number(r.row_count ?? 0), 0);
    return {
      legend,
      points,
      height: horizontal ? Math.min(740, Math.max(460, categories.length * 52 + 130)) : 520,
      minimumWidth: horizontal ? 560 : Math.max(560, Math.min(12, categories.length) * 110 + 100),
      option: {
        ...base,
        grid: {
          ...(base.grid as object),
          left: horizontal ? 24 : 72,
          bottom: horizontal ? 70 : 180,
          right: horizontal ? 64 : 24,
        },
        dataZoom: [
          {
            ...insideZoom,
            ...(horizontal ? { yAxisIndex: 0 } : { xAxisIndex: 0 }),
            endValue: Math.min(11, categories.length - 1),
          },
          {
            type: 'slider',
            filterMode: 'none',
            ...(horizontal
              ? { yAxisIndex: 0, right: 8, orient: 'vertical' }
              : { xAxisIndex: 0, bottom: 12 }),
          },
        ],
        xAxis: horizontal ? valueAxis : categoryAxis,
        yAxis: horizontal ? categoryAxis : valueAxis,
        series: keys
          .filter((k) => !selection.hidden.includes(k))
          .map((key) => ({
            id: key,
            type: 'bar',
            name: categoryLabel(key),
            stack: 'total',
            itemStyle: { color: color(key) },
            data: (grouped.get(key) ?? []).map((r) => {
              const cat = text(r, 'category_key'),
                i = categoryIndex.get(cat) ?? 0;
              const v = number(r, 'value'),
                total = totals.get(cat) ?? 0,
                displayValue =
                  v === null
                    ? null
                    : display.normalize
                      ? total === 0
                        ? null
                        : (100 * v) / total
                      : v;
              return {
                ...mark(
                  text(r, 'cell_key'),
                  `${categoryLabel(cat)} · ${categoryLabel(key)}: ${text(r, 'value')}${display.normalize ? ` (${displayValue === null ? 'undefined' : displayValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}%)` : ''} · ${text(r, 'row_count')} rows`,
                  horizontal ? (displayValue ?? 0) : i,
                  horizontal ? i : (displayValue ?? 0),
                ),
                value: horizontal ? [displayValue, i] : [i, displayValue],
              };
            }),
          })),
      },
    };
  }
  if (mode === 'heatmap' && 'row' in request) {
    const x = [...new Set(rows.map((r) => text(r, 'column_key')))].sort(),
      y = [...new Set(rows.map((r) => text(r, 'category_key')))].sort();
    const xIndex = new Map(x.map((k, i) => [k, i])),
      yIndex = new Map(y.map((k, i) => [k, i]));
    const values = rows.map((r) => number(r, 'value')).filter((v): v is number => v !== null);
    return {
      legend: [],
      points,
      height: Math.min(740, Math.max(500, y.length * 44 + 220)),
      minimumWidth: Math.max(620, Math.min(12, x.length) * 100 + 250),
      option: {
        ...base,
        grid: { ...(base.grid as object), left: 24, right: 65, top: 65, bottom: 165 },
        title: [{ text: plotMeasure(request), left: 'center', top: 0 }],
        dataZoom: [
          { ...insideZoom, xAxisIndex: 0, endValue: Math.min(11, x.length - 1) },
          { type: 'slider', xAxisIndex: 0, filterMode: 'none', bottom: 65 },
          { ...insideZoom, yAxisIndex: 0, endValue: Math.min(11, y.length - 1) },
          { type: 'slider', yAxisIndex: 0, filterMode: 'none', right: 8, orient: 'vertical' },
        ],
        xAxis: {
          type: 'category',
          name: request.column,
          nameLocation: 'middle',
          nameGap: 50,
          data: x.map(categoryLabel),
          axisLabel: { interval: 0, formatter: (label: string) => wrapPlotLabel(label, 90) },
        },
        yAxis: {
          type: 'category',
          name: request.row,
          nameGap: 16,
          data: y.map(categoryLabel),
          axisLabel: { interval: 0, formatter: (label: string) => wrapPlotLabel(label, 180) },
        },
        visualMap: {
          min: values.reduce((a, b) => Math.min(a, b), 0),
          max: values.reduce((a, b) => Math.max(a, b), 1),
          calculable: true,
          orient: 'horizontal',
          bottom: 0,
          left: 'center',
        },
        series: [
          {
            type: 'heatmap',
            data: rows.map((r) => {
              const a = xIndex.get(text(r, 'column_key')) ?? 0,
                b = yIndex.get(text(r, 'category_key')) ?? 0;
              return {
                ...mark(
                  text(r, 'cell_key'),
                  `${categoryLabel(text(r, 'cell_key'))}: ${text(r, 'value')} · ${text(r, 'contributing_count')} contributing rows`,
                  a,
                  b,
                ),
                selectionOutline: selected(text(r, 'cell_key')),
                itemStyle: { opacity: 1, borderWidth: selected(text(r, 'cell_key')) ? 3 : 0 },
                value: [a, b, number(r, 'value')],
              };
            }),
          },
        ],
      },
    };
  }
  if (mode === 'scatter' && 'x' in request) {
    const xAxis = numericAxis(rows.map((r) => r.x)),
      yAxis = numericAxis(rows.map((r) => r.y));
    // Hiding a group must not change the area represented by the remaining bubbles.
    const largest = rows.reduce((m, r) => Math.max(m, Number(r.size)), 1);
    for (const item of legend)
      item.selected = (grouped.get(item.key) ?? []).filter((r) =>
        selected(text(r, 'row_id')),
      ).length;
    return {
      legend,
      points,
      option: {
        ...base,
        grid: { ...(base.grid as object), top: request.size ? 85 : 36 },
        graphic: request.size
          ? [
              {
                type: 'group',
                left: 15,
                top: 0,
                children: [
                  {
                    type: 'text',
                    style: { text: `Bubble area: ${request.size}`, font: '12px sans-serif' },
                  },
                  {
                    type: 'circle',
                    shape: { cx: 14, cy: 40, r: 14 },
                    style: { fill: VIZ_PALETTE[0], opacity: 0.6 },
                  },
                  {
                    type: 'text',
                    left: 36,
                    top: 33,
                    style: { text: String(largest), font: '12px sans-serif' },
                  },
                  {
                    type: 'circle',
                    shape: { cx: 150, cy: 40, r: 3 },
                    style: { fill: 'transparent', stroke: VIZ_PALETTE[0], lineWidth: 1 },
                  },
                  {
                    type: 'text',
                    left: 163,
                    top: 33,
                    style: { text: '0 (hollow)', font: '12px sans-serif' },
                  },
                ],
              },
            ]
          : undefined,
        xAxis: { type: 'value', name: request.x + xAxis.suffix, scale: true },
        yAxis: { type: 'value', name: request.y + yAxis.suffix, scale: true },
        dataZoom: [
          { ...insideZoom, xAxisIndex: 0 },
          { type: 'slider', xAxisIndex: 0, filterMode: 'none' },
          { ...insideZoom, yAxisIndex: 0 },
        ],
        series: keys
          .filter((k) => !selection.hidden.includes(k))
          .map((key) => ({
            id: key,
            type: 'scatter',
            name: categoryLabel(key),
            itemStyle: { color: color(key) },
            data: (grouped.get(key) ?? []).map((r) => {
              const size = Number(r.size);
              return {
                ...mark(
                  text(r, 'row_id'),
                  `${text(r, 'label')} · X: ${text(r, 'x')}, Y: ${text(r, 'y')} · Size: ${text(r, 'size')}`,
                  xAxis.coordinate(r.x),
                  yAxis.coordinate(r.y),
                ),
                value: [xAxis.coordinate(r.x), yAxis.coordinate(r.y)],
                itemStyle: {
                  opacity: selectedKeys.size && !selected(text(r, 'row_id')) ? 0.15 : 0.6,
                },
                symbol: size === 0 ? 'emptyCircle' : 'circle',
                symbolSize:
                  'size' in request && request.size
                    ? size === 0
                      ? 6
                      : Math.sqrt(size / largest) * 28
                    : 8,
              };
            }),
          })),
      },
    };
  }
  const stages = 'stages' in request ? request.stages : [];
  const nodes = new Map<
    string,
    {
      name: string;
      display: string;
      depth: number;
      summary: string;
      itemStyle: { color: string | undefined };
    }
  >();
  const categoryKeys = [
    ...new Set(
      rows.flatMap((r) =>
        (JSON.parse(text(r, 'transition_key')) as [number, unknown[]])[1].map((value) =>
          JSON.stringify(value),
        ),
      ),
    ),
  ].sort();
  const stageColor = (value: unknown) =>
    VIZ_PALETTE[categoryKeys.indexOf(JSON.stringify(value)) % VIZ_PALETTE.length];
  const links = rows.map((r, i) => {
    const key = text(r, 'transition_key');
    const [stage, pair] = JSON.parse(key) as [number, unknown[]];
    const source = JSON.stringify([stage, pair[0]]),
      target = JSON.stringify([stage + 1, pair[1]]);
    nodes.set(source, {
      name: source,
      display: categoryLabel(JSON.stringify([pair[0]])),
      depth: stage,
      summary: `${String(stages[stage])}: ${categoryLabel(JSON.stringify([pair[0]]))}`,
      itemStyle: { color: stageColor(pair[0]) },
    });
    nodes.set(target, {
      name: target,
      display: categoryLabel(JSON.stringify([pair[1]])),
      depth: stage + 1,
      summary: `${String(stages[stage + 1])}: ${categoryLabel(JSON.stringify([pair[1]]))}`,
      itemStyle: { color: stageColor(pair[1]) },
    });
    return {
      ...mark(
        key,
        `${String(stages[stage])} → ${String(stages[stage + 1])} · ${categoryLabel(JSON.stringify(pair))}: ${text(r, 'value')} · ${text(r, 'row_count')} rows`,
        i,
        0,
      ),
      source,
      target,
      value: Number(r.value ?? 0),
      lineStyle: { opacity: selectedKeys.size && !selected(key) ? 0.15 : 0.5 },
    };
  });
  return {
    legend: [],
    points,
    minimumWidth: Math.max(640, stages.length * 220),
    option: {
      ...base,
      dataZoom: [],
      xAxis: undefined,
      yAxis: undefined,
      grid: undefined,
      title: stages.map((name, index) => ({
        text: wrapPlotLabel(name, 130),
        left: `${String(8 + (76 * index) / Math.max(1, stages.length - 1))}%`,
        top: 0,
        textAlign: 'center',
      })),
      series: [
        {
          type: 'sankey',
          left: '8%',
          right: '16%',
          top: Math.max(
            55,
            ...stages.map((name) => wrapPlotLabel(name, 130).split('\n').length * 18 + 20),
          ),
          bottom: 25,
          nodeAlign: 'left',
          data: [...nodes.values()],
          links,
          label: { formatter: (p: { data: { display: string } }) => p.data.display },
          emphasis: { focus: 'adjacency' },
          lineStyle: { color: 'source', curveness: 0.5 },
        },
      ],
    },
  };
}
