import { getInstanceByDom } from 'echarts/core';

import { formatChartDate } from '@/lib/chartDates';
import { toChartFilename, type ChartExportHeaderItem } from '@/lib/chartExport';
import { saveBlob } from '@/lib/download';
import {
  FORMATTER_MARKER,
  TOOLTIP_MARKER_END,
  TOOLTIP_MARKER_START,
  runChartHtml,
  type ChartHtmlPayload,
} from './chartHtmlRuntime';
import { formatterFromSpec, portableFormatterSpec } from './portableFormatter';

/**
 * Interactive HTML chart download (issue 278). What you see is what you get:
 * the file redraws the chart exactly as shown (groups, selection, zoom,
 * colours of the current theme) with ECharts' own interactions: tooltips,
 * legend toggles and zoom. No Wordflow features and no server: it is one
 * self-contained file that works offline.
 */

type OptionRecord = Record<string, unknown>;

interface EChartsInstanceLike {
  getOption: () => OptionRecord;
  getWidth: () => number;
  getHeight: () => number;
  getDom: () => HTMLElement;
}

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value];

const isRecord = (value: unknown): value is OptionRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The ECharts chart inside a chart container, if one is drawn. */
function findChartInstance(container: HTMLElement): EChartsInstanceLike | undefined {
  const element = container.hasAttribute('_echarts_instance_')
    ? container
    : container.querySelector<HTMLElement>('[_echarts_instance_]');
  if (!element) return undefined;
  return getInstanceByDom(element);
}

/** Replaces `var(--name)` colours with the current theme's values. */
const resolveCssVariables = (text: string, style: CSSStyleDeclaration): string =>
  text.replace(
    /var\((--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,
    (_match, name: string, fallback?: string) => {
      // An unset variable reads as '', which must fall through to the fallback.
      const resolved = style.getPropertyValue(name).trim();
      if (resolved !== '') return resolved;
      return fallback?.trim() ?? '';
    },
  );

/** The data rows behind the chart and its x dimension, when it draws from a dataset. */
const datasetRows = (option: OptionRecord): { rows: OptionRecord[]; xKey: string | null } => {
  const dataset = asArray(option.dataset)[0];
  if (!isRecord(dataset)) return { rows: [], xKey: null };
  const rows = Array.isArray(dataset.source) ? dataset.source.filter(isRecord) : [];
  const dimensions = Array.isArray(dataset.dimensions) ? dataset.dimensions : [];
  const first: unknown = dimensions[0];
  const xKey =
    typeof first === 'string'
      ? first
      : isRecord(first) && typeof first.name === 'string'
        ? first.name
        : null;
  return { rows, xKey };
};

/**
 * Tooltip text per data row from the chart's own formatter, so the file shows
 * the same lines. Each group's colour dot is left as a placeholder that the
 * file fills with the dot ECharts draws there.
 */
const precomputeTooltips = (
  formatter: (params: unknown) => unknown,
  rows: OptionRecord[],
  seriesIds: string[],
): string[] =>
  rows.map((row, dataIndex) => {
    const params = seriesIds.map((seriesId) => ({
      seriesId,
      dataIndex,
      value: row,
      marker: `${TOOLTIP_MARKER_START}${seriesId}${TOOLTIP_MARKER_END}`,
    }));
    const text = formatter(params);
    return typeof text === 'string' ? text : '';
  });

/** Builds the payload the file needs: the option as shown, with functions replaced. */
export function buildChartHtmlPayload(chart: EChartsInstanceLike): ChartHtmlPayload {
  const option = chart.getOption();
  const style = getComputedStyle(chart.getDom());
  const { rows, xKey } = datasetRows(option);
  const datasetKeys = new Set(
    (() => {
      const dataset = asArray(option.dataset)[0];
      const dimensions =
        isRecord(dataset) && Array.isArray(dataset.dimensions) ? dataset.dimensions : [];
      return dimensions.map((dimension) =>
        isRecord(dimension) ? String(dimension.name) : String(dimension),
      );
    })(),
  );
  const series = asArray(option.series).filter(isRecord);
  const dataSeries = series.filter(
    (item) => typeof item.id === 'string' && datasetKeys.has(item.id),
  );
  const dataSeriesIds = dataSeries.map((item) => String(item.id));

  let tooltips: string[] | null = null;
  const portable = (value: unknown, path: string[]): unknown => {
    if (typeof value === 'function') {
      const key = path.at(-1);
      const component = path[0];
      if (component === 'tooltip' && key === 'formatter' && path.length === 3) {
        tooltips = precomputeTooltips(value as (params: unknown) => unknown, rows, dataSeriesIds);
        return { [FORMATTER_MARKER]: { kind: 'tooltip' } };
      }
      const spec = portableFormatterSpec(value);
      if (spec) return { [FORMATTER_MARKER]: spec };
      const axis = (component === 'xAxis' || component === 'yAxis') && key === 'formatter';
      if (axis) {
        const axisOption = asArray(option[component])[Number(path[1])];
        if (isRecord(axisOption) && axisOption.type === 'category') {
          const values = Array.isArray(axisOption.data)
            ? axisOption.data
            : xKey && component === 'xAxis'
              ? rows.map((row) => row[xKey])
              : [];
          const labels: Record<string, string> = {};
          values.forEach((entry, index) => {
            const text = (value as (v: unknown, i: number) => unknown)(entry, index);
            labels[String(entry)] = String(text);
          });
          return { [FORMATTER_MARKER]: { kind: 'lookup', labels } };
        }
      }
      // Any other function (none today) falls back to ECharts' default.
      return undefined;
    }
    if (typeof value === 'string') return resolveCssVariables(value, style);
    if (Array.isArray(value))
      return value.map((entry, index) => portable(entry, [...path, String(index)]));
    if (isRecord(value)) {
      const out: OptionRecord = {};
      for (const [key, entry] of Object.entries(value)) {
        const next = portable(entry, [...path, key]);
        if (next !== undefined) out[key] = next;
      }
      return out;
    }
    return value;
  };
  const portableOption = portable(option, []) as OptionRecord;

  // The app draws its legend outside the chart; the file gets ECharts' own
  // legend so groups can be hidden and shown there.
  const foreground = style.getPropertyValue('--vscode-charts-foreground').trim() || style.color;
  portableOption.legend = [
    {
      type: 'scroll',
      top: 0,
      data: dataSeries.map((item) => String(item.name ?? item.id)),
      textStyle: { color: foreground },
    },
  ];
  portableOption.grid = asArray(portableOption.grid).map((grid) =>
    isRecord(grid) ? { ...grid, top: Number(grid.top ?? 20) + 32 } : grid,
  );

  return {
    option: portableOption,
    tooltips,
    tooltipSeriesIds: dataSeriesIds,
    width: chart.getWidth(),
    height: chart.getHeight() + 32,
  };
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Script text that cannot close its <script> element early. */
const scriptSafe = (text: string): string => text.replace(/<\/(script)/gi, '<\\/$1');

const jsonForScript = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

interface ChartHtmlDocumentOptions {
  title: string;
  header: ChartExportHeaderItem[];
  background: string;
  foreground: string;
  echartsSource: string;
  generatedAt: string;
}

/** The complete, self-contained HTML document for one chart. */
export function buildChartHtmlDocument(
  payload: ChartHtmlPayload,
  options: ChartHtmlDocumentOptions,
): string {
  const items = options.header
    .map(
      (item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`,
    )
    .join('');
  const run = `(${runChartHtml.toString()})(window.echarts, document.getElementById('chart'), ${jsonForScript(payload)}, (${formatterFromSpec.toString()}), (${formatChartDate.toString()}));`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<style>
body{margin:0;padding:24px;background:${escapeHtml(options.background)};color:${escapeHtml(options.foreground)};font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
h1{font-size:18px;margin:0 0 8px}
dl{display:flex;flex-wrap:wrap;gap:4px 20px;margin:0 0 16px}
dl div{display:flex;gap:6px}
dt{opacity:.7}
dd{margin:0}
#chart{max-width:100%;overflow-x:auto}
footer{margin-top:12px;font-size:12px;opacity:.7}
</style>
</head>
<body>
<h1>${escapeHtml(options.title)}</h1>
<dl>${items}</dl>
<div id="chart"></div>
<footer>Made with Wordflow on ${escapeHtml(options.generatedAt)}. Hover for values, click legend entries to hide or show groups, and drag the slider to zoom.</footer>
<script>${scriptSafe(options.echartsSource)}</script>
<script>${scriptSafe(run)}</script>
</body>
</html>
`;
}

/** Colours of the page behind the chart, so the file matches the app's theme. */
function chartPageColours(element: HTMLElement): { background: string; foreground: string } {
  const style = getComputedStyle(element);
  const body = getComputedStyle(document.body);
  const background =
    style.getPropertyValue('--vscode-editor-background').trim() || body.backgroundColor;
  const foreground =
    style.getPropertyValue('--vscode-editor-foreground').trim() ||
    style.getPropertyValue('--vscode-charts-foreground').trim() ||
    body.color;
  return { background, foreground };
}

interface DownloadChartHtmlOptions {
  nodeName: string;
  toolSuffix: string;
  title: string;
  header: ChartExportHeaderItem[];
}

/**
 * Saves the chart in `container` as an interactive HTML file (issue 278).
 * Used by: the Trends and Concordance density chart downloads.
 */
export async function downloadChartAsHtml(
  container: HTMLElement,
  options: DownloadChartHtmlOptions,
): Promise<void> {
  const chart = findChartInstance(container);
  if (!chart) throw new Error('Chart not available for export.');
  const payload = buildChartHtmlPayload(chart);
  // Loaded only when someone downloads, so the app itself stays small.
  const { default: echartsSource } = await import('echarts/dist/echarts.min.js?raw');
  const html = buildChartHtmlDocument(payload, {
    title: options.title,
    header: options.header,
    ...chartPageColours(chart.getDom()),
    echartsSource,
    generatedAt: new Date().toLocaleString(),
  });
  await saveBlob(
    new Blob([html], { type: 'text/html' }),
    toChartFilename(options.nodeName, options.toolSuffix, 'html'),
  );
}
