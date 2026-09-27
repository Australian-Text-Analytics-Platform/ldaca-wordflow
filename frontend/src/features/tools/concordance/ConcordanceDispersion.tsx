import { captureChart } from '../common/captureChart';
import { useRef, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useActiveTheme } from '@/features/theme/themeRuntime';
import { toNodeSurfaceColor } from '@/lib/nodeColor';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import type { ConcordanceInput, ConcordanceSearch } from '@/features/project/api';
import {
  buildChartExport,
  saveGeneratedExport,
  type ChartExportFormat,
} from '../common/chartExport';
import { showValue, type DocumentRow } from './concordanceRows';
import { ChartDownload } from '../common/components/DownloadControl';
import { ConcordanceChart } from './ConcordanceChart';
import {
  DISPLAY_BINS,
  dispersionSeries,
  dispersionOption,
  termKey,
  selectBin,
  selectBinRange,
  binLabel,
  type Density,
  type DispersionChartMode,
} from './concordanceDispersionModel';

interface Props {
  saved: boolean;
  dataKey: string;
  density: Density[];
  allTerms: string[];
  ready: boolean;
  outdated: boolean;
  onRetry: () => void;
  sourceIndices: number[];
  rows: DocumentRow[];
  metadata: string[];
  metadataHeader: (column: string) => ReactNode;
  inputs: ConcordanceInput[];
  search: ConcordanceSearch;
  binCount: number;
  onBinCount: (count: number) => void;
  uncased: boolean;
  onUncased: (value: boolean) => void;
  excluded: string[];
  onExcluded: (terms: string[]) => void;
  bins: number[];
  onBins: (bins: number[]) => void;
  proportional: boolean;
  chartMode: DispersionChartMode;
  onChartMode: (mode: DispersionChartMode) => void;
  onInspect: (row: DocumentRow, index: number) => void;
  color: (index: number) => string;
  footer: ReactNode;
  scope: string;
}

export function ConcordanceDispersion({
  saved,
  dataKey,
  density,
  allTerms,
  ready,
  outdated,
  onRetry,
  sourceIndices,
  rows,
  metadata,
  metadataHeader,
  inputs,
  search,
  binCount,
  onBinCount,
  uncased,
  onUncased,
  excluded,
  onExcluded,
  bins,
  onBins,
  proportional,
  chartMode,
  onChartMode,
  onInspect,
  color,
  footer,
  scope,
}: Props) {
  useActiveTheme();
  const styles = getComputedStyle(document.documentElement);
  const foreground = styles.getPropertyValue('--vscode-foreground').trim();
  const gridColor = styles.getPropertyValue('--vscode-panel-border').trim();
  const series = ready ? dispersionSeries(density, allTerms, binCount, uncased) : [];
  const colorsByTerm = new Map(series.map((term) => [term.key, term.color]));
  const visible = series.filter((term) => !excluded.includes(term.key));
  const option = dispersionOption(visible, chartMode, bins, binCount, foreground, gridColor);
  const chartHost = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ key: string; bin: number } | null>(null);
  const selectedCount = (counts: number[]) =>
    bins.reduce((sum, bin) => sum + (counts[bin] ?? 0), 0);
  const termLabel = (term: (typeof series)[number]) =>
    `${term.label} (${bins.length ? `${String(selectedCount(term.counts))}/` : ''}${String(term.total)})`;
  const download = useMutation({
    mutationFn: async (format: ChartExportFormat) => {
      const host = chartHost.current?.querySelector<HTMLDivElement>(
        '[aria-roledescription="interactive chart"]',
      );
      if (!host) throw new Error('The chart is not ready');
      // Capture synchronously before opening a native chooser, without live controls.
      const clone = captureChart(host);
      const width = Number(clone.getAttribute('width')) || 600;
      const height = Number(clone.getAttribute('height')) || 240;
      const namespace = 'http://www.w3.org/2000/svg';
      const group = document.createElementNS(namespace, 'g');
      while (clone.firstChild) group.append(clone.firstChild);
      const lines: { text: string; color: string; hidden?: boolean }[] = [];
      const appendLabel = (label: string, fill = foreground, hidden = false) => {
        const chars = Array.from(label);
        const maxChars = Math.max(12, Math.floor((width - 24) / 8));
        for (let start = 0; start < chars.length; start += maxChars)
          lines.push({ text: chars.slice(start, start + maxChars).join(''), color: fill, hidden });
      };
      appendLabel(`Concordance: ${search.query} · ${chartMode} · ${String(binCount)} bins`);
      appendLabel(
        sourceIndices.map((index) => inputs[index]?.source.name ?? 'Unavailable').join(' / '),
      );
      appendLabel(scope);
      const headerHeight = lines.length * 22 + 16;
      group.setAttribute('transform', `translate(0,${String(headerHeight)})`);
      clone.append(group);
      const headerLines = lines.length;
      series.forEach((term) => {
        appendLabel(termLabel(term), term.color, excluded.includes(term.key));
      });
      appendLabel(
        `Selected bins: ${bins.length ? bins.map((bin) => binLabel(bin, binCount)).join(', ') : 'all'}`,
      );
      lines.forEach((line, index) => {
        const text = document.createElementNS(namespace, 'text');
        text.setAttribute('x', '12');
        text.setAttribute('y', String(22 + index * 22 + (index >= headerLines ? height + 16 : 0)));
        text.setAttribute('fill', line.color);
        text.setAttribute('font-size', '14');
        text.setAttribute('font-family', 'sans-serif');
        if (line.hidden) {
          text.setAttribute('text-decoration', 'line-through');
          text.setAttribute('opacity', '0.5');
        }
        text.textContent = line.text;
        clone.append(text);
      });
      const fullHeight = height + 40 + lines.length * 22;
      clone.setAttribute('height', String(fullHeight));
      clone.setAttribute('viewBox', `0 0 ${String(width)} ${String(fullHeight)}`);
      return saveGeneratedExport(
        await buildChartExport(clone, format),
        `concordance-${chartMode}.${format}`,
      );
    },
  });
  const lengths = rows.map(
    (row) => Array.from(showValue(row.source[inputs[row.sourceIndex]?.column ?? ''] ?? '')).length,
  );
  const maxLength = Math.max(1, ...lengths);
  return (
    <div className="min-w-0 space-y-3" data-testid="concordance-dispersion">
      <div className="max-h-100 overflow-auto" data-testid="dispersion-documents">
        <table
          className="w-full table-fixed text-sm"
          style={
            metadata.length
              ? { minWidth: `calc(100% + ${String(metadata.length * 200)}px)` }
              : undefined
          }
        >
          <colgroup>
            <col
              style={
                metadata.length
                  ? { width: `calc(100% - ${String(metadata.length * 200)}px)` }
                  : undefined
              }
            />
            {metadata.map((column) => (
              <col key={column} style={{ width: 200 }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th className="p-2 text-left font-medium">Document · matches</th>
              {metadata.map((column) => (
                <th key={column} className="p-2 text-left font-medium">
                  {metadataHeader(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const length = Math.max(1, lengths[index] ?? 0);
              return (
                <tr
                  key={JSON.stringify([row.sourceIndex, row.documentId])}
                  style={
                    sourceIndices.length > 1
                      ? { background: toNodeSurfaceColor(color(row.sourceIndex)) }
                      : undefined
                  }
                >
                  <td className="p-2">
                    <button
                      className="flex w-full items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-focus-border"
                      onClick={() => {
                        onInspect(row, index);
                      }}
                      aria-label={`Inspect document ${row.documentId}${sourceIndices.length > 1 ? ` from ${inputs[row.sourceIndex]?.source.name ?? ''}` : ''}`}
                    >
                      <span
                        className="w-10 shrink-0 truncate text-description"
                        title={row.documentId}
                      >
                        {row.documentId}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="relative block h-7 bg-list-hover"
                          style={{
                            width: `${String(proportional ? ((lengths[index] ?? 0) / maxLength) * 100 : 100)}%`,
                          }}
                        >
                          {row.matches.map((hit) => {
                            const hitColor = colorsByTerm.get(termKey(hit.matched_text, uncased));
                            return (
                              <Tooltip key={hit.match_order}>
                                <TooltipTrigger asChild>
                                  <span
                                    className="absolute top-0 h-full w-3 -translate-x-1/2"
                                    style={{ left: `${String((hit.start_idx / length) * 100)}%` }}
                                  >
                                    <span
                                      className="absolute left-1/2 h-full w-0.5"
                                      style={{ background: hitColor ?? foreground }}
                                    />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-80 whitespace-pre-wrap break-words">
                                  {hit.left_context}
                                  <strong style={{ color: hitColor }}>{hit.matched_text}</strong>
                                  {hit.right_context}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </span>
                      </span>
                      <span className="w-8 shrink-0 text-right text-description">
                        {row.matches.length}
                      </span>
                    </button>
                  </td>
                  {metadata.map((column) => (
                    <td key={column} className="break-words p-2 align-top">
                      {showValue(row.source[column])}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={metadata.length + 1} className="p-3 text-description">
                  No matches in {saved ? 'this selection' : 'this document page'}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {footer}
      {(!ready || outdated) && (
        <p role={outdated ? 'alert' : 'status'} className="text-description">
          {outdated
            ? 'The chart is outdated. Refresh is pending or failed.'
            : 'Loading complete density…'}{' '}
          <Button variant="ghost" onClick={onRetry}>
            Retry
          </Button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2" aria-label="Matched terms">
        {series.map((term) => (
          <Button
            key={term.key}
            variant="ghost"
            size="sm"
            disabled={!saved || !ready || outdated}
            aria-pressed={excluded.includes(term.key)}
            title={`${excluded.includes(term.key) ? 'Show' : 'Hide'} ${term.label}`}
            className={excluded.includes(term.key) ? 'opacity-50 line-through' : ''}
            onClick={() => {
              onExcluded(
                excluded.includes(term.key)
                  ? excluded.filter((item) => item !== term.key)
                  : [...excluded, term.key],
              );
            }}
          >
            <span className="h-0.5 w-4 shrink-0" style={{ background: term.color }} />
            {termLabel(term)}
          </Button>
        ))}
        <label className="flex items-center gap-2">
          <Checkbox
            checked={uncased}
            onCheckedChange={(value) => {
              onUncased(value === true);
            }}
          />
          Uncased
        </label>
        {saved && (
          <Button
            variant="ghost"
            size="sm"
            disabled={!bins.length}
            onClick={() => {
              anchor.current = null;
              onBins([]);
            }}
          >
            Clear selection
          </Button>
        )}
      </div>
      {!proportional && ready && (
        <div ref={chartHost}>
          <p className="text-description">{scope}</p>
          <ConcordanceChart
            option={option}
            height={240}
            pointCount={binCount}
            dataResetKey={dataKey}
            ariaLabel={`Concordance ${chartMode} distribution`}
            selectedIndices={new Set(bins)}
            onSelect={
              saved && !outdated
                ? (bin, shift) => {
                    onBins(
                      selectBin(
                        bins,
                        bin,
                        anchor.current?.key === dataKey ? anchor.current.bin : null,
                        shift,
                      ),
                    );
                    anchor.current = { key: dataKey, bin };
                  }
                : undefined
            }
            onSelectRange={
              saved && !outdated
                ? (start, end, shift) => {
                    onBins(selectBinRange(bins, start, end, shift));
                    anchor.current = { key: dataKey, bin: end };
                  }
                : undefined
            }
            getPointSummary={(bin) =>
              `${binLabel(bin, binCount)}. ${bins.includes(bin) ? 'Selected.' : 'Not selected.'} ${visible.map((term) => `${term.label}: ${String(term.counts[bin] ?? 0)}`).join(', ')}`
            }
            toolbarEnd={
              <ChartDownload
                disabled={outdated || download.isPending}
                onExport={download.mutateAsync}
              />
            }
            toolbarStart={
              <>
                <Select
                  value={chartMode}
                  onValueChange={(value) => {
                    onChartMode(value as DispersionChartMode);
                  }}
                >
                  <SelectTrigger className="w-36" aria-label="Chart type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['line', 'bar', 'area', 'cumulative'] as const).map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === 'cumulative' ? 'Cumulative' : `Density: ${value}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2">
                  Bins
                  <Select
                    value={String(binCount)}
                    onValueChange={(value) => {
                      onBinCount(Number(value));
                    }}
                  >
                    <SelectTrigger className="w-20" aria-label="Bins">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DISPLAY_BINS.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </>
            }
          />
        </div>
      )}
    </div>
  );
}
