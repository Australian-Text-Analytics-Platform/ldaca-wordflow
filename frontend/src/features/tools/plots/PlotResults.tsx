import { decodeArrowData } from '@/lib/arrow/decodeArrowTable';
import { useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import * as api from '@/features/project/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import {
  buildChartExport,
  saveGeneratedExport,
  type ChartExportFormat,
} from '../common/chartExport';
import { decodeAnalysisRequest } from '../common/analysisRequest';
import { ChartDownload } from '../common/components/DownloadControl';
import { PlotChart } from './PlotChart';
import { captureChart } from '../common/captureChart';
import {
  buildPlot,
  categoryLabel,
  wrapPlotLabel,
  type PlotRow,
  type PlotDisplay,
} from './plotModel';
import { plotExportContext, plotPublicationScope, plotSelectionKeys } from './plotContext';
import { PlotPublishDialog } from './PlotPublishDialog';
const emptySelection = (): api.PlotSelection => ({
  hidden: [],
  intervals: [],
  cells: [],
  rows: [],
  transitions: [],
});
export function PlotResults({
  base,
  mode,
  result,
  active,
  editing,
  settings,
  onSettings,
}: {
  base: string;
  mode: api.PlotMode;
  result: api.PlotAnalysis;
  active: boolean;
  editing: boolean;
  settings: Record<string, unknown>;
  onSettings: (patch: Record<string, unknown>) => void;
}) {
  const [selection, setSelection] = useState(emptySelection);
  const [publish, setPublish] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const anchor = useRef<string | null>(null);
  const request = decodeAnalysisRequest(mode, result.request).request;
  const uncased = settings.uncased === true;
  const minimum_rows =
    typeof settings.minimum_rows === 'number' ? Math.max(0, Math.floor(settings.minimum_rows)) : 0;
  const query = { uncased, minimum_rows };
  const data = useQuery({
    queryKey: ['native', base, 'analyses', result.id, mode, query],
    queryFn: ({ signal }) => api.queryPlot(base, result.id, mode, query, signal),
    enabled: active,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
  const rows: PlotRow[] = data.data ? decodeArrowData(data.data).rows : [];
  const eligible =
    'measure' in request &&
    (request.measure === 'count' ||
      (request.measure === 'sum' && result.result.payload.nonnegative));
  const calendar =
    'interval' in request &&
    request.interval.type === 'time' &&
    request.interval.unit === 'day' &&
    request.interval.step === 1;
  const requestedStyle = settings.style;
  const style: PlotDisplay['style'] =
    requestedStyle === 'calendar' && calendar
      ? 'calendar'
      : requestedStyle === 'bar'
        ? 'bar'
        : requestedStyle === 'area' && eligible
          ? 'area'
          : 'line';
  const years = [
    ...new Set(
      rows
        .map((r) => (typeof r.interval_key === 'string' ? r.interval_key : '').slice(0, 4))
        .filter((v) => /^\d{4}$/.test(v)),
    ),
  ].sort();
  const display: PlotDisplay = {
    nonnegative: result.result.payload.nonnegative,
    timezone:
      'axis' in request &&
      result.result.payload.columns.some(
        (column) => column[0] === request.axis && column[1].includes('WITH TIME ZONE'),
      )
        ? request.timezone
        : undefined,
    style,
    smooth: settings.smooth !== false,
    normalize: (mode === 'trends' || mode === 'compare') && eligible && settings.normalize === true,
    uncased,
    minimum_rows,
    order: settings.order === 'category' ? 'category' : 'total',
    orientation:
      settings.orientation === 'horizontal' || settings.orientation === 'vertical'
        ? settings.orientation
        : rows.some(
              (row) =>
                typeof row.category_key === 'string' && categoryLabel(row.category_key).length > 24,
            )
          ? 'horizontal'
          : 'vertical',
    year: year ?? Number(years[0] ?? new Date().getFullYear()),
  };
  const model = buildPlot(mode, request, rows, display, selection, chartWidth);
  const scope = plotPublicationScope(mode, request, rows, selection);
  const selectedKeys = plotSelectionKeys(mode, selection);
  const allHidden =
    model.legend.length > 0 && model.legend.every((item) => selection.hidden.includes(item.key));
  const select = (keys: string[], add: boolean, range: boolean) => {
    const field =
      mode === 'trends'
        ? 'intervals'
        : mode === 'scatter'
          ? 'rows'
          : mode === 'sankey'
            ? 'transitions'
            : 'cells';
    let chosen = keys;
    if (mode === 'trends' && add && !range && anchor.current && keys[0]) {
      const ordered = [
        ...new Set(rows.map((r) => (typeof r.interval_key === 'string' ? r.interval_key : ''))),
      ];
      const a = ordered.indexOf(anchor.current),
        b = ordered.indexOf(keys[0]);
      if (a >= 0 && b >= 0) chosen = ordered.slice(Math.min(a, b), Math.max(a, b) + 1);
    }
    if (keys[0]) anchor.current = keys[0];
    setSelection((old) => ({
      ...old,
      [field]: range
        ? add
          ? [...new Set([...old[field], ...chosen])]
          : chosen
        : add
          ? [...new Set([...old[field], ...chosen])]
          : chosen.reduce(
              (values, key) =>
                values.includes(key) ? values.filter((v) => v !== key) : [...values, key],
              old[field],
            ),
    }));
  };
  const outdated = data.isPlaceholderData || data.isFetching || data.isError;
  const download = useMutation({
    mutationFn: async (format: ChartExportFormat) => {
      const host = frame.current?.querySelector<HTMLDivElement>('[data-testid="plot-chart"]');
      if (!host) throw new Error('Chart is not ready');
      const clone = captureChart(host);
      const width = Number(clone.getAttribute('width')) || 800,
        height = Number(clone.getAttribute('height')) || 500;
      const context = [
        ...plotExportContext(mode, request, display),
        `Publication: ${scope.summary}`,
        ...(mode === 'scatter' ? [] : scope.details),
        'Zoom restricts this image, not publication.',
      ];
      const legendLines = model.legend.flatMap((l) => {
        const label = `${selection.hidden.includes(l.key) ? 'Hidden · ' : ''}${l.label}: ${selectedKeys.length ? `${String(l.selected)}/` : ''}${String(l.count)} rows`;
        return wrapPlotLabel(label, (width - 24) * 0.9)
          .split('\n')
          .map((text) => ({ text, color: l.color }));
      });
      const lines = context.flatMap((line) => wrapPlotLabel(line, (width - 24) * 0.9).split('\n'));
      const exportLines = [
        ...lines.map((text) => ({
          text,
          color: getComputedStyle(frame.current ?? document.body).color,
        })),
        ...legendLines,
      ];
      const exportHeight = height + exportLines.length * 22 + 20;
      clone.setAttribute('height', String(exportHeight));
      if (clone.hasAttribute('viewBox'))
        clone.setAttribute('viewBox', `0 0 ${String(width)} ${String(exportHeight)}`);
      exportLines.forEach((line, i) => {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '12');
        text.setAttribute('y', String(height + 22 + i * 22));
        text.setAttribute('fill', line.color);
        text.setAttribute('font-size', '13');
        text.setAttribute(
          'font-family',
          getComputedStyle(frame.current ?? document.body).fontFamily,
        );
        text.textContent = line.text;
        clone.append(text);
      });
      return saveGeneratedExport(
        await buildChartExport(clone, format),
        `${result.result.payload.source.name}_${mode}.${format}`,
      );
    },
  });
  if (!data.data && !data.isError)
    return <AnalysisProgress name="Plot" message="Loading results…" />;
  return (
    <section
      aria-label="Plot results"
      className="min-w-0 max-w-full space-y-3 rounded-lg border border-surface-border p-3"
    >
      <h2 className="font-semibold">Results</h2>
      <p className="text-description text-label-secondary">
        {result.result.payload.source.name} · {result.result.payload.usable_rows.toLocaleString()}{' '}
        usable of {result.result.payload.row_count.toLocaleString()} rows ·{' '}
        {(result.result.payload.row_count - result.result.payload.usable_rows).toLocaleString()}{' '}
        rows excluded from the plot
        {mode !== 'scatter' &&
          ` · ${result.result.payload.omitted_measurements.toLocaleString()} unusable measurements`}
        {mode === 'scatter' && ' (missing or unusable coordinates/size)'}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {mode === 'trends' && (
          <label>
            Presentation
            <SearchableSelect
              ariaLabel="Plot presentation"
              value={display.style}
              options={[
                'line',
                ...(eligible ? ['area'] : []),
                'bar',
                ...(calendar ? ['calendar'] : []),
              ].map((value) => ({ value }))}
              onChange={(style) => {
                onSettings({ style });
              }}
            />
          </label>
        )}
        <label className="flex items-center gap-2">
          <Checkbox
            checked={uncased}
            onCheckedChange={(checked) => {
              onSettings({ uncased: checked === true });
              setSelection((old) => ({ ...old, hidden: [], cells: [], transitions: [] }));
            }}
          />
          Uncased
        </label>
        {mode === 'trends' && (
          <>
            {(display.style === 'line' || display.style === 'area') && (
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={display.smooth}
                  onCheckedChange={(value) => {
                    onSettings({ smooth: value === true });
                  }}
                />
                Smooth curves
              </label>
            )}
            <label>
              Minimum rows per group
              <Input
                aria-label="Minimum rows per group"
                type="number"
                min={0}
                value={minimum_rows}
                onChange={(e) => {
                  onSettings({ minimum_rows: Number(e.target.value) });
                }}
              />
            </label>
          </>
        )}
        {(mode === 'trends' || mode === 'compare') && eligible && (
          <label className="flex items-center gap-2">
            <Checkbox
              checked={display.normalize}
              onCheckedChange={(value) => {
                onSettings({ normalize: value === true });
              }}
            />
            Normalize to 100%
          </label>
        )}
        {mode === 'compare' && (
          <label>
            Orientation
            <SearchableSelect
              ariaLabel="Bar orientation"
              value={display.orientation ?? 'vertical'}
              options={[
                { value: 'horizontal', label: 'Horizontal' },
                { value: 'vertical', label: 'Vertical' },
              ]}
              onChange={(orientation) => {
                onSettings({ orientation });
              }}
            />
          </label>
        )}
        {mode === 'compare' && (
          <label>
            Order
            <SearchableSelect
              ariaLabel="Category order"
              value={display.order}
              options={[
                { value: 'total', label: 'Total descending' },
                { value: 'category', label: 'Category' },
              ]}
              onChange={(order) => {
                onSettings({ order });
              }}
            />
          </label>
        )}
        {display.style === 'calendar' && (
          <label>
            Year
            <SearchableSelect
              ariaLabel="Calendar year"
              value={String(display.year)}
              options={years.map((value) => ({ value }))}
              onChange={(v) => {
                setYear(Number(v));
              }}
            />
          </label>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            setSelection((old) => ({ ...emptySelection(), hidden: old.hidden }));
            anchor.current = null;
          }}
        >
          Clear Selection
        </Button>
      </div>
      {display.normalize && (
        <p className="text-description text-label-secondary">
          Percentages include all eligible groups, including hidden groups. Zero totals have no
          percentage.
        </p>
      )}
      {data.isError ? (
        <p role="alert">
          {data.data ? 'The displayed plot is outdated.' : 'Could not display the plot.'}{' '}
          {data.error instanceof Error ? data.error.message : ''}{' '}
          <Button
            variant="outline"
            onClick={() => {
              void data.refetch();
            }}
          >
            Retry
          </Button>
        </p>
      ) : outdated ? (
        <p role="status">Updating plot…</p>
      ) : null}
      <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
        {model.legend.map((item) => (
          <Button
            key={item.key}
            variant="ghost"
            aria-pressed={!selection.hidden.includes(item.key)}
            className={selection.hidden.includes(item.key) ? 'line-through opacity-50' : ''}
            onClick={() => {
              setSelection((old) => ({
                ...old,
                hidden: old.hidden.includes(item.key)
                  ? old.hidden.filter((k) => k !== item.key)
                  : [...old.hidden, item.key],
              }));
            }}
          >
            <span className="size-2 rounded-full" style={{ background: item.color }} />
            {item.label} ·{' '}
            {selection.intervals.length || selection.rows.length || selection.cells.length
              ? `${String(item.selected)}/`
              : ''}
            {item.count.toLocaleString()}
          </Button>
        ))}
      </div>
      <div
        ref={(element) => {
          frame.current = element;
          if (!element) return;
          const measure = () => {
            setChartWidth(element.clientWidth);
          };
          measure();
          const observer = new ResizeObserver(measure);
          observer.observe(element);
          return () => {
            observer.disconnect();
          };
        }}
        className="min-w-0 max-w-full"
      >
        {rows.length ? (
          <>
            {allHidden && (
              <div
                role="status"
                className="flex min-h-40 flex-col items-center justify-center gap-3"
              >
                <p>All groups are hidden.</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelection((old) => ({ ...old, hidden: [] }));
                  }}
                >
                  Show all groups
                </Button>
              </div>
            )}
            <div hidden={allHidden}>
              <PlotChart
                option={model.option}
                minimumWidth={model.minimumWidth}
                toolbarEnd={
                  <ChartDownload
                    disabled={outdated || !model.points.length || download.isPending}
                    onExport={download.mutateAsync}
                  />
                }
                points={
                  mode === 'trends'
                    ? [...new Map(model.points.map((p) => [p.key, p])).values()].sort(
                        (a, b) => a.x - b.x,
                      )
                    : model.points
                }
                intervals={mode === 'trends'}
                height={model.height ?? 460}
                rectangular={mode === 'scatter' || mode === 'heatmap'}
                horizontal={mode === 'compare' && display.orientation === 'horizontal'}
                cartesian={mode !== 'sankey' && display.style !== 'calendar'}
                onSelect={select}
              />
            </div>
          </>
        ) : (
          <p>
            {data.isError
              ? 'Adjust the settings above or retry to display this result.'
              : 'No usable observations match these settings.'}
          </p>
        )}
      </div>
      {mode === 'heatmap' && (
        <p className="text-description text-label-secondary">
          Blank cells have no usable measurement or no observations; zero is a measured value.
          Outlines mark selected cells.
        </p>
      )}
      {mode === 'sankey' && (
        <p className="text-description text-label-secondary">
          Select bands to include rows matching any selected transition, not necessarily a complete
          path. Each original row is included once.
        </p>
      )}
      <p aria-label="Publication scope" className="text-description text-label-secondary">
        {scope.summary}. Zoom does not restrict publication.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={editing || outdated || allHidden}
          onClick={() => {
            setPublish(true);
          }}
        >
          Add to Project
        </Button>
      </div>
      {publish && (
        <PlotPublishDialog
          base={base}
          mode={mode}
          result={result}
          request={request}
          query={query}
          selection={selection}
          scope={scope}
          onClose={() => {
            setPublish(false);
          }}
        />
      )}
    </section>
  );
}
