import { Input } from '@/components/ui/input';
import { orderedResultColumns, readColumnOrder, resultColumnKey } from '../common/resultColumns';
import { ResultColumnOrder } from '../common/components/ResultColumnOrder';
import { ResultDownloadMenu } from '../common/components/ResultDownloadMenu';
import { OperationError } from '@/features/project/OperationError';
import HelpIcon from '@/components/help/HelpIcon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import * as objectsApi from '@/features/project/objects';
import { objectDependencies } from '@/features/project/projectChanges';
import * as analysesApi from '@/features/tools/common/analysisApi';
import * as concordanceApi from '@/features/tools/concordance/api';
import { toNodeSurfaceColor } from '@/lib/nodeColor';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { ResetSortButton } from '../common/components/ResetSortButton';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { decodeAnalysisRequest, matchesAnalysisRequest } from '../common/analysisRequest';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { AnalysisPublishMenu } from '../common/components/AnalysisPublishMenu';
import { inspectAnalysisRow } from '../common/components/inspectAnalysisRow';
import { RowDetailPanel } from '../common/components/RowDetailPanel';
import { TablePaginationFooter } from '../common/components/TablePaginationFooter';
import { useRowDetailDialog } from '../common/components/useRowDetailDialog';
import { useRetainedPages } from '../common/useRetainedPages';
import { GREY, VIZ_PALETTE } from '../common/vizPalette';
import { ConcordanceDispersion } from './ConcordanceDispersion';
import {
  previewDensity,
  type Density,
  type DispersionChartMode,
} from './concordanceDispersionModel';
import { ConcordancePublishDialog } from './ConcordancePublishDialog';
import {
  decodeConcordanceRows,
  interleave,
  showValue,
  type DocumentRow,
  type Match,
} from './concordanceRows';
interface Props {
  onCancelPreview?: () => void;
  base: string;
  tab: analysesApi.Tab;
  result?: concordanceApi.ConcordanceAnalysisResult;
  submitted: { request: concordanceApi.ConcordanceRequest; generation: number } | null;
  draft: concordanceApi.ConcordanceRequest;
  active: boolean;
  stopped: boolean;
  view: 'preview' | 'saved';
  colors: Record<string, string>;
  editing: boolean;
  onSettings: (patch: Record<string, unknown>) => void;
}
export function ConcordanceResults({
  base,
  tab,
  result,
  submitted,
  draft,
  active,
  stopped,
  view,
  colors,
  editing,
  onSettings,
  onCancelPreview,
}: Props) {
  const saved = view === 'saved';
  const savedRequest =
    saved && result
      ? decodeAnalysisRequest('concordance', result.request_status).request
      : undefined;
  const request =
    savedRequest && result
      ? result.result.version === 1
        ? { ...savedRequest, inputs: result.result.payload.corpora.map((source) => source.input) }
        : savedRequest
      : submitted?.request;
  const [presentation, setPresentation] = useState(
    tab.settings.presentation === 'dispersion' ? 'dispersion' : 'table',
  );
  const [combined, setCombined] = useState(false);
  const panelId = useId();
  const [pageSize, setPageSize] = useState(20);
  const [pages, setPages] = useState<number[]>([]);
  const [sorts, setSorts] = useState<(concordanceApi.ConcordanceSort | null)[]>([]);
  const [highlightContext, setHighlightContext] = useState(true);
  const [metadata, setMetadata] = useState<string[]>([]);
  const [columnSearch, setColumnSearch] = useState('');
  const [detail, setDetail] = useState<{ row: DocumentRow; index: number; group: number } | null>(
    null,
  );
  const [proportional, setProportional] = useState(false);
  const [chartMode, setChartMode] = useState<DispersionChartMode>('line');
  const [binCount, setBinCount] = useState(20);
  const [uncased, setUncased] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [bins, setBins] = useState<Record<string, number[]>>({});
  const [publish, setPublish] = useState<'matches' | 'documents' | null>(null);
  const filter = (index: number): concordanceApi.ConcordanceFilter => ({
    excluded_terms: saved && presentation === 'dispersion' ? excluded : [],
    uncased,
    bins:
      saved && presentation === 'dispersion'
        ? (bins[combined ? 'combined' : String(index)] ?? [])
        : [],
    bin_count: binCount,
  });
  const queries = useQueries({
    queries: (request?.inputs ?? []).map((input, index) => {
      const sort = combined ? null : (sorts[index] ?? null);
      const query: concordanceApi.ConcordanceQuery = {
        source_index: index,
        projection: presentation === 'table' ? 'matches' : 'documents',
        filter: filter(index),
        page: (pages[index] ?? 0) + 1,
        page_size: pageSize,
        sort,
      };
      const preview: concordanceApi.ConcordancePreviewRequest = {
        input,
        search: (request ?? draft).search,
        page: (pages[index] ?? 0) + 1,
        page_size: pageSize,
        sort: sort?.metadata ? { column: sort.field, descending: sort.descending } : null,
      };
      return {
        queryKey: saved
          ? ['native', base, 'analyses', result?.id, 'concordance', query]
          : ['native', base, 'analysis-preview', tab.id, submitted?.generation, preview],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          saved
            ? concordanceApi.queryConcordance(base, result?.id ?? '', query, signal)
            : concordanceApi.previewConcordance(base, tab.id, preview, signal),
        enabled: active && Boolean(saved ? result : submitted) && (!stopped || saved),
        meta: {
          ...(!saved || result?.result.version === 2 ? objectDependencies(input.source) : {}),
          reportError: false,
        },
        placeholderData: saved ? undefined : keepPreviousData,
        staleTime: Infinity,
      };
    }),
  });
  const submission = saved ? result?.id : submitted?.generation;
  const [displayedSubmission, setDisplayedSubmission] = useState(submission);
  if (displayedSubmission !== submission) {
    setDisplayedSubmission(submission);
    setPages([]);
  }
  // Retain the last successful page when a refresh fails, visibly marked below.
  const retained = useRetainedPages(
    (request?.inputs ?? []).map((input) =>
      JSON.stringify([view, saved ? result?.id : null, saved ? presentation : null, input.source]),
    ),
    queries,
  );
  const data = retained.pages;
  const rawRows = data.map((page, index) => (page ? decodeConcordanceRows(page.table, index) : []));
  const rows = rawRows.map((group) => group.filter((row) => row.matches.length > 0));
  const groups = combined ? [interleave(rows)] : rows;
  const densityQueries = useQueries({
    queries:
      saved && result
        ? result.result.payload.corpora.map((_, source_index) => ({
            queryKey: ['native', base, 'analyses', result.id, 'density', source_index],
            queryFn: ({ signal }: { signal: AbortSignal }) =>
              concordanceApi.concordanceDensity(
                base,
                result.id,
                { source_index, bin_count: 100, uncased: false },
                signal,
              ),
            enabled: active && presentation === 'dispersion',
            meta: {
              ...(result.result.version === 2
                ? objectDependencies(
                    request?.inputs[source_index]?.source ??
                      result.result.payload.corpora[source_index]!.input.source,
                  )
                : {}),
              reportError: false,
            },
            staleTime: Infinity,
          }))
        : [],
  });
  const densities: Density[][] = saved
    ? densityQueries.map(
        (query) =>
          query.data?.toArray().map((value) => {
            const row = (value as { toJSON: () => Record<string, unknown> }).toJSON();
            return { term: showValue(row.term), bin: Number(row.bin), count: Number(row.count) };
          }) ?? [],
      )
    : rawRows.map((group) => previewDensity(group, request?.inputs ?? []));
  const allTerms = [...new Set(densities.flat().map((item) => item.term))];
  const [filterResult, setFilterResult] = useState(result?.id);
  if (filterResult !== result?.id) {
    setFilterResult(result?.id);
    setBins({});
    setExcluded([]);
    setPages([]);
  }
  const outdated = Boolean(
    request &&
    !matchesAnalysisRequest(
      'concordance',
      draft,
      saved
        ? result?.request_status
        : { status: 'supported', request: { kind: 'concordance', request } },
    ),
  );
  const color = (index: number) => {
    const input = request?.inputs[index];
    return input
      ? (colors[objectsApi.targetKey(input.source)] ?? VIZ_PALETTE[index] ?? GREY)
      : 'currentColor';
  };
  const sourceColumns = (request?.inputs ?? []).map((_, index) =>
    saved && result?.result.version === 1
      ? (result?.result.payload.corpora[index]?.columns.map(([name]) => name) ?? [])
      : (data[index]?.table.schema.fields
          .find((field) => field.name === 'source')
          ?.type.children.map((field) => field.name) ?? []),
  );
  const columns = [...new Set(sourceColumns.flat())];
  const commonColumns = columns.filter((column) =>
    sourceColumns.every((fields) => fields.includes(column)),
  );
  const visibleMetadata = combined
    ? metadata.filter((column) => commonColumns.includes(column))
    : metadata;
  const changePage = (index: number, page: number) => {
    setPages((old) => {
      const next = [...old];
      if (combined) return (request?.inputs ?? []).map(() => page);
      next[index] = page;
      return next;
    });
  };
  const chooseSort = (index: number, field: string, isMetadata: boolean) => {
    setSorts((old) => {
      const next = [...old];
      const previous = old[index];
      next[index] = {
        field,
        metadata: isMetadata,
        descending: previous?.field === field && !previous.descending,
      };
      return next;
    });
    changePage(index, 0);
  };
  const sortButton = (index: number, field: string, label: string, isMetadata = false) =>
    combined || (!saved && !isMetadata) ? (
      <>{label}</>
    ) : (
      <button
        className="flex items-center gap-1 whitespace-nowrap"
        onClick={() => {
          chooseSort(index, field, isMetadata);
        }}
      >
        {label}
        {sorts[index]?.field === field ? (
          sorts[index].descending ? (
            <ArrowDown className="size-3" />
          ) : (
            <ArrowUp className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3" />
        )}
      </button>
    );
  const pagination = (index: number) => (
    <>
      <p className="text-description">
        {saved ? (
          <>
            {presentation === 'dispersion' &&
            (excluded.length || (bins[combined ? 'combined' : String(index)]?.length ?? 0))
              ? 'Filtered saved result'
              : 'Saved result'}{' '}
            ·{' '}
            {(combined ? data : [data[index]])
              .reduce((sum, page) => sum + (page?.documentCount ?? 0), 0)
              .toLocaleString()}{' '}
            documents ·{' '}
            {(combined ? data : [data[index]])
              .reduce((sum, page) => sum + (page?.matchCount ?? 0), 0)
              .toLocaleString()}{' '}
            matches
          </>
        ) : (
          <>
            {(combined ? data : [data[index]])
              .reduce((sum, page) => sum + (page?.matchCount ?? 0), 0)
              .toLocaleString()}{' '}
            matches in {groups[index]?.length ?? 0} of{' '}
            {(combined ? data : [data[index]]).reduce(
              (sum, page) => sum + (page?.documentCount ?? 0),
              0,
            )}{' '}
            inspected documents
          </>
        )}
      </p>
      <TablePaginationFooter
        pageIndex={pages[index] ?? 0}
        pageSize={pageSize}
        onPageChange={(page) => {
          changePage(index, page);
        }}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPages([]);
        }}
        rowCount={
          saved
            ? combined
              ? Math.max(0, ...data.map((page) => page?.totalRows ?? 0))
              : data[index]?.totalRows
            : undefined
        }
        hasNext={combined ? data.some((page) => page?.hasNext) : data[index]?.hasNext}
        pageSizeLabel={
          !saved
            ? combined
              ? 'Documents per source per page'
              : 'Documents per page'
            : presentation === 'table'
              ? combined
                ? 'Matches per source per page'
                : 'Matches per page'
              : combined
                ? 'Documents per source per page'
                : 'Documents per page'
        }
        loading={queries.some((query) => query.isFetching)}
      />
    </>
  );
  const [displayedOutput, setDisplayedOutput] = useState<string>();
  const outputKey = saved ? result?.id : 'preview';
  const outputReady =
    data.every((page) => Boolean(page)) &&
    (!saved ||
      presentation !== 'dispersion' ||
      densityQueries.every((query) => Boolean(query.data)));
  if (request && outputReady && displayedOutput !== outputKey) setDisplayedOutput(outputKey);
  if (!request) return null;
  const displayedDensity = saved && presentation === 'dispersion' ? densityQueries : [];
  if (displayedOutput !== outputKey && !outputReady) {
    const failed =
      queries.some((query) => query.isError) || displayedDensity.some((query) => query.isError);
    return (
      <AnalysisProgress
        name={tab.name}
        message={
          failed ? 'Could not load output.' : saved ? 'Loading results…' : 'Calculating Preview…'
        }
        error={failed}
        diagnostic={[...queries, ...displayedDensity].find((query) => query.error)?.error}
        onRetry={
          failed
            ? () => {
                queries.forEach((query) => {
                  void query.refetch();
                });
                displayedDensity.forEach((query) => {
                  void query.refetch();
                });
              }
            : undefined
        }
        onCancel={!saved ? onCancelPreview : undefined}
      />
    );
  }
  return (
    <Tabs
      role="region"
      aria-label="Concordance results"
      value={presentation}
      onValueChange={(value) => {
        setPresentation(value);
        if (saved) setPages([]);
        if (value === 'dispersion') setSorts([]);
        onSettings({ presentation: value });
      }}
      className="min-w-0 gap-3 rounded-lg border border-surface-border p-3"
    >
      <h2 className="flex items-center gap-2 text-body font-semibold">
        {saved ? 'Results' : 'Preview'}
        <HelpIcon targetKey="analysis.concordance.results" label="Concordance results help" />
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <TabsList aria-label="Concordance presentation">
          <TabsTrigger value="table" aria-controls={panelId}>
            Table
          </TabsTrigger>
          <TabsTrigger value="dispersion" aria-controls={panelId}>
            Dispersion
          </TabsTrigger>
        </TabsList>
        {request.inputs.length === 2 && (
          <Tabs
            className="ml-auto"
            value={combined ? 'combined' : 'separated'}
            onValueChange={(value) => {
              setCombined(value === 'combined');
              setPages([]);
              setSorts([]);
            }}
          >
            <TabsList aria-label="Concordance source layout">
              <TabsTrigger value="separated" aria-controls={panelId}>
                Separated
              </TabsTrigger>
              <TabsTrigger value="combined" aria-controls={panelId}>
                Combined
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      <TabsContent id={panelId} value={presentation} className="min-w-0 flex flex-col gap-3">
        <>
          {[...queries, ...displayedDensity]
            .filter((query) => query.isError)
            .slice(0, 1)
            .map((query) => (
              <OperationError
                key="projection-error"
                title="Could not update Concordance results"
                error={query.error}
                onRetry={() => {
                  void query.refetch();
                }}
              />
            ))}
          {outdated && (
            <p role="status" className="text-description">
              Displayed results use the previously submitted search. Preview or Run to apply your
              draft.
            </p>
          )}
          {queries.some((_, index) => retained.stale[index]) && (
            <p role={queries.some((query) => query.isError) ? 'alert' : 'status'}>
              {queries.some((query) => query.isError)
                ? 'Refresh failed. The previous page is outdated.'
                : 'Refreshing… The previous page remains visible.'}{' '}
              <Button
                variant="ghost"
                onClick={() => {
                  queries.forEach((query) => {
                    void query.refetch();
                  });
                }}
              >
                Retry
              </Button>
            </p>
          )}
          {stopped && !saved && <p role="status">Preview stopped.</p>}
          {presentation === 'table' && (
            <label className="flex items-center gap-2">
              <Checkbox
                checked={highlightContext}
                onCheckedChange={(value) => {
                  setHighlightContext(value === true);
                }}
              />
              Highlight L1 / R1
            </label>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="self-start">
                Metadata ({metadata.length}) <ChevronDown data-icon="inline-end" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              aria-label="Concordance metadata columns"
              className="max-h-[min(24rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
            >
              <div className="flex flex-col gap-3">
                <Input
                  aria-label="Find Concordance metadata"
                  value={columnSearch}
                  placeholder="Find a column…"
                  onChange={(event) => setColumnSearch(event.target.value)}
                />
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMetadata(combined ? commonColumns : columns);
                  }}
                >
                  Select all
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMetadata([]);
                  }}
                >
                  Select none
                </Button>
                {[
                  { label: 'Shared metadata', fields: commonColumns },
                  ...sourceColumns.map((fields, index) => ({
                    label: request.inputs[index]?.source.name ?? '',
                    fields: fields.filter((field) => !commonColumns.includes(field)),
                  })),
                ]
                  .filter((group) => group.fields.length)
                  .map((group) => (
                    <fieldset key={group.label} className="flex min-w-0 flex-col gap-2">
                      <legend className="mb-2 break-all text-description text-label-secondary">
                        {group.label}
                      </legend>
                      {group.fields
                        .filter((column) =>
                          column.toLocaleLowerCase().includes(columnSearch.toLocaleLowerCase()),
                        )
                        .map((column) => (
                          <label key={column} className="flex items-center gap-2">
                            <Checkbox
                              checked={metadata.includes(column)}
                              aria-disabled={combined && !commonColumns.includes(column)}
                              onCheckedChange={(checked) => {
                                if (combined && !commonColumns.includes(column)) {
                                  toast.info(
                                    'Combined results can show only metadata shared by both sources. Switch to Separated to use this column.',
                                  );
                                  return;
                                }
                                setMetadata((old) =>
                                  checked
                                    ? [...old, column]
                                    : old.filter((item) => item !== column),
                                );
                              }}
                            />
                            <span className="min-w-0 break-all">{column}</span>
                          </label>
                        ))}
                    </fieldset>
                  ))}
              </div>
            </PopoverContent>
          </Popover>
          {presentation === 'dispersion' && (
            <label className="flex items-center gap-2">
              <Checkbox
                checked={proportional}
                onCheckedChange={(value) => {
                  setProportional(value === true);
                }}
              />
              Bar length proportional to text length
            </label>
          )}
          {groups.map((group, index) => {
            const blockMetadata = visibleMetadata.filter(
              (column) => combined || sourceColumns[index]?.includes(column),
            );
            const displayColumns = orderedResultColumns(
              [
                ...[
                  'left_context',
                  'matched_text',
                  'right_context',
                  'l1',
                  ...(saved ? ['l1_frequency'] : []),
                  'r1',
                  ...(saved ? ['r1_frequency'] : []),
                ].map((column) => ({ column, metadata: false })),
                ...blockMetadata.map((column) => ({ column, metadata: true })),
              ],
              readColumnOrder(tab.settings.column_order),
            );
            return (
              <section
                key={index}
                className="min-w-0 space-y-3 border-t border-surface-border pt-3"
              >
                <div
                  className="flex flex-wrap gap-3 rounded px-3 py-2"
                  style={combined ? undefined : { background: toNodeSurfaceColor(color(index)) }}
                >
                  {(combined ? request.inputs : [request.inputs[index]]).map(
                    (input, sourceIndex) =>
                      input && (
                        <h3
                          key={objectsApi.targetKey(input.source)}
                          className="flex min-w-0 items-center gap-2 break-all font-semibold"
                        >
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: color(combined ? sourceIndex : index) }}
                          />
                          {input.source.name}
                        </h3>
                      ),
                  )}
                </div>
                {!combined && presentation !== 'dispersion' && (
                  <ResetSortButton
                    sorted={Boolean(sorts[index])}
                    onReset={() => {
                      setSorts((old) => old.map((sort, i) => (i === index ? null : sort)));
                      changePage(index, 0);
                    }}
                  />
                )}
                {(combined ? queries : [queries[index]]).some(
                  (query) =>
                    query && (query.isError || query.isPlaceholderData || query.isFetching),
                ) && (
                  <p role="status" className="text-description">
                    This source is refreshing or outdated. The previous page remains visible.
                  </p>
                )}
                {presentation === 'dispersion' ? (
                  <ConcordanceDispersion
                    saved={saved}
                    dataKey={JSON.stringify([
                      saved ? result?.id : submitted?.generation,
                      combined,
                      index,
                      binCount,
                    ])}
                    density={combined ? densities.flat() : (densities[index] ?? [])}
                    allTerms={allTerms}
                    ready={
                      !saved ||
                      (combined ? densityQueries : [densityQueries[index]]).every(
                        (query) => query?.data,
                      )
                    }
                    outdated={
                      saved
                        ? (combined ? densityQueries : [densityQueries[index]]).some((query) =>
                            Boolean(query && (query.isError || query.isFetching)),
                          )
                        : queries.some(
                            (query) => query.isError || query.isFetching || query.isPlaceholderData,
                          ) || stopped
                    }
                    onRetry={() => {
                      (saved ? densityQueries : queries).forEach((query) => {
                        void query.refetch();
                      });
                    }}
                    proportional={proportional}
                    chartMode={chartMode}
                    onChartMode={setChartMode}
                    onBinCount={(value) => {
                      setBinCount(value);
                      setBins({});
                      if (saved) setPages([]);
                    }}
                    onUncased={(value) => {
                      setUncased(value);
                      setExcluded([]);
                      if (saved) setPages([]);
                    }}
                    footer={pagination(index)}
                    scope={
                      saved
                        ? 'Complete saved result'
                        : `Preview document page ${String((pages[index] ?? 0) + 1)}`
                    }
                    metadataHeader={(column) => sortButton(index, column, column, true)}
                    sourceIndices={combined ? request.inputs.map((_, i) => i) : [index]}
                    rows={group}
                    metadata={blockMetadata}
                    inputs={request.inputs}
                    search={request.search}
                    binCount={binCount}
                    uncased={uncased}
                    excluded={saved ? excluded : []}
                    onExcluded={(next) => {
                      setExcluded(next);
                      setPages([]);
                    }}
                    bins={saved ? (bins[combined ? 'combined' : String(index)] ?? []) : []}
                    onBins={(next) => {
                      setBins((old) => ({
                        ...old,
                        [combined ? 'combined' : String(index)]: next,
                      }));
                      setPages([]);
                    }}
                    onInspect={(row, rowIndex) => {
                      setDetail({ row, index: rowIndex, group: index });
                    }}
                    color={color}
                  />
                ) : (
                  <Table containerClassName="max-h-96">
                    <TableHeader className="sticky top-0 z-10 bg-panel">
                      <TableRow>
                        {combined && <TableHead>Source</TableHead>}
                        {displayColumns.map((column) => (
                          <TableHead key={resultColumnKey(column)}>
                            {column.metadata
                              ? sortButton(index, column.column, column.column, true)
                              : column.column === 'left_context'
                                ? highlightContext
                                  ? sortButton(index, 'l1', 'Left context')
                                  : 'Left context'
                                : column.column === 'right_context'
                                  ? highlightContext
                                    ? sortButton(index, 'r1', 'Right context')
                                    : 'Right context'
                                  : sortButton(
                                      index,
                                      column.column,
                                      (
                                        {
                                          matched_text: 'Match',
                                          l1: 'L1',
                                          r1: 'R1',
                                          l1_frequency: 'L1 frequency',
                                          r1_frequency: 'R1 frequency',
                                        } as Record<string, string>
                                      )[column.column] ?? column.column,
                                    )}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.flatMap((row, rowIndex) =>
                        row.matches.map((match) => (
                          <TableRow
                            key={`${String(row.sourceIndex)}:${row.documentId}:${String(match.match_order)}`}
                            className="cursor-pointer"
                            style={
                              combined
                                ? { background: toNodeSurfaceColor(color(row.sourceIndex)) }
                                : row.documentBand === 1
                                  ? { background: 'var(--vscode-list-hoverBackground)' }
                                  : undefined
                            }
                            onClick={(event) => {
                              inspectAnalysisRow(event, () => {
                                setDetail({ row, index: rowIndex, group: index });
                              });
                            }}
                          >
                            {combined && (
                              <TableCell className="max-w-40 break-words text-description">
                                {request.inputs[row.sourceIndex]?.source.name}
                              </TableCell>
                            )}
                            {displayColumns.map((column) => (
                              <TableCell
                                key={resultColumnKey(column)}
                                className={
                                  column.column === 'left_context' && !column.metadata
                                    ? 'text-right whitespace-pre-wrap'
                                    : 'whitespace-pre-wrap'
                                }
                              >
                                {column.metadata ? (
                                  showValue(row.source[column.column])
                                ) : column.column === 'left_context' ? (
                                  <Context
                                    text={match.left_context}
                                    word={highlightContext ? match.l1 : ''}
                                    last
                                  />
                                ) : column.column === 'right_context' ? (
                                  <Context
                                    text={match.right_context}
                                    word={highlightContext ? match.r1 : ''}
                                  />
                                ) : column.column === 'matched_text' ? (
                                  <button
                                    className="font-semibold underline-offset-2 hover:underline"
                                    style={{ color: color(row.sourceIndex) }}
                                    onClick={() => {
                                      if (!window.getSelection()?.toString())
                                        setDetail({ row, index: rowIndex, group: index });
                                    }}
                                  >
                                    {match.matched_text}
                                  </button>
                                ) : (
                                  showValue(match[column.column as keyof Match])
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        )),
                      )}
                      {!group.length && (
                        <TableRow>
                          <TableCell colSpan={20}>
                            No matches in {saved ? 'this selection' : 'this document page'}.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
                {presentation === 'table' && (
                  <div className="flex flex-wrap gap-2">
                    <ResultColumnOrder
                      columns={displayColumns}
                      onChange={(column_order) => onSettings({ column_order })}
                    />
                    {saved &&
                      result &&
                      (combined ? request.inputs.map((_, source) => source) : [index]).map(
                        (source) => (
                          <div key={source}>
                            {combined && (
                              <span className="text-description">
                                {request.inputs[source]?.source.name}
                              </span>
                            )}
                            <ResultDownloadMenu
                              base={base}
                              id={result.id}
                              selection={{
                                kind: 'concordance',
                                query: {
                                  source_index: source,
                                  projection: 'matches',
                                  page: 1,
                                  page_size: pageSize,
                                  sort: combined ? null : (sorts[source] ?? null),
                                  filter: filter(source),
                                },
                              }}
                              columns={displayColumns.filter(
                                (column) =>
                                  !column.metadata ||
                                  sourceColumns[source]?.includes(column.column),
                              )}
                              document={{
                                column: request.inputs[source]?.column ?? '',
                                metadata: true,
                              }}
                              optionalColumns={['extraction', 'start_idx', 'end_idx'].map(
                                (column) => ({ column, metadata: false }),
                              )}
                              disabled={editing || Boolean(retained.stale[source])}
                            />
                          </div>
                        ),
                      )}
                  </div>
                )}
                {!saved &&
                  presentation === 'table' &&
                  (combined ? request.inputs.map((_, source) => source) : [index]).map((source) =>
                    data[source] ? (
                      <ResultDownloadMenu
                        key={source}
                        base={base}
                        captured={data[source]?.table}
                        columns={displayColumns.filter(
                          (column) =>
                            !column.metadata || sourceColumns[source]?.includes(column.column),
                        )}
                        document={{ column: request.inputs[source]?.column ?? '', metadata: true }}
                        optionalColumns={['extraction', 'start_idx', 'end_idx'].map((column) => ({
                          column,
                          metadata: false,
                        }))}
                        disabled={editing || Boolean(retained.stale[source])}
                      />
                    ) : null,
                  )}
                {presentation === 'table' && pagination(index)}
              </section>
            );
          })}
          {saved && (
            <AnalysisPublishMenu disabled={editing} matchesLabel="Matches" onSelect={setPublish} />
          )}
        </>
      </TabsContent>
      {detail && (
        <Inspection
          base={base}
          analysisId={saved ? result?.id : undefined}
          key={JSON.stringify([detail.group, detail.row.documentId, detail.index])}
          initialIndex={detail.index}
          rows={groups[detail.group] ?? []}
          inputs={request.inputs}
          sequenceKey={JSON.stringify([
            view,
            result?.id,
            submitted?.generation,
            presentation,
            sorts,
            combined,
            excluded,
            bins,
          ])}
          page={(pages[detail.group] ?? 0) + 1}
          hasNext={Boolean(
            combined ? data.some((page) => page?.hasNext) : data[detail.group]?.hasNext,
          )}
          loading={queries.some((query) => query.isFetching || query.isPlaceholderData)}
          error={queries.find((query) => query.error)?.error}
          onPageChange={(page) => {
            changePage(detail.group, page - 1);
          }}
          onClose={() => {
            setDetail(null);
          }}
        />
      )}
      {publish && result && (
        <ConcordancePublishDialog
          base={base}
          result={result}
          sources={
            result.result.version === 2
              ? request?.inputs.map((input, index) => ({
                  input,
                  columns: sourceColumns[index] ?? [],
                }))
              : undefined
          }
          projection={publish}
          filters={result.result.payload.corpora.map((_, index) => filter(index))}
          onClose={() => {
            setPublish(null);
          }}
        />
      )}
    </Tabs>
  );
}
export function HighlightedDocument({ text, matches }: { text: string; matches: Match[] }) {
  const chars = Array.from(text);
  let after = 0;
  const fragments: React.ReactNode[] = [];
  for (const match of [...matches].sort((a, b) => a.start_idx - b.start_idx)) {
    if (match.start_idx < after) continue;
    fragments.push(chars.slice(after, match.start_idx).join(''));
    fragments.push(
      <mark key={`${String(match.start_idx)}:${String(match.end_idx)}`}>
        {chars.slice(match.start_idx, match.end_idx).join('')}
      </mark>,
    );
    after = match.end_idx;
  }
  fragments.push(chars.slice(after).join(''));
  return <div className="whitespace-pre-wrap break-words">{fragments}</div>;
}

function Context({ text, word, last = false }: { text: string; word: string; last?: boolean }) {
  const at = word ? (last ? text.lastIndexOf(word) : text.indexOf(word)) : -1;
  return at < 0 ? (
    <>{text}</>
  ) : (
    <>
      {text.slice(0, at)}
      <span className="font-medium text-link">{text.slice(at, at + word.length)}</span>
      {text.slice(at + word.length)}
    </>
  );
}

function Inspection({
  base,
  analysisId,
  initialIndex,
  rows,
  inputs,
  sequenceKey,
  page,
  hasNext,
  loading,
  error,
  onPageChange,
  onClose,
}: {
  base: string;
  analysisId?: string;
  initialIndex: number;
  rows: DocumentRow[];
  inputs: concordanceApi.ConcordanceInput[];
  sequenceKey: string;
  page: number;
  hasNext: boolean;
  loading: boolean;
  error: unknown;
  onPageChange: (page: number) => void;
  onClose: () => void;
}) {
  const controller = useRowDetailDialog({
    sequenceKey,
    items: rows,
    page,
    hasPreviousPage: page > 1,
    hasNextPage: hasNext,
    loading,
    error,
    onPageChange,
    toPayload: (row) => ({ record: row.source, textColumn: inputs[row.sourceIndex]?.column }),
  });
  const selected = controller.selectedItem;
  const capturedText = controller.detailPayload?.textColumn
    ? controller.detailPayload.record[controller.detailPayload.textColumn]
    : undefined;

  const detailQuery: concordanceApi.ConcordanceQuery = {
    source_index: selected?.sourceIndex ?? 0,
    projection: 'documents',
    filter: {
      document_id: selected?.documentId,
      expected_text: typeof capturedText === 'string' ? capturedText : undefined,
      excluded_terms: [],
      uncased: false,
      bins: [],
      bin_count: 20,
    },
    page: 1,
    page_size: 1,
    sort: null,
  };
  const full = useQuery({
    queryKey: ['native', base, 'analyses', analysisId, 'concordance', detailQuery],
    queryFn: ({ signal }) =>
      concordanceApi.queryConcordance(base, analysisId ?? '', detailQuery, signal),
    enabled: Boolean(analysisId && selected),
    staleTime: Infinity,
    meta: { reportError: false },
  });
  const matches = full.data
    ? decodeConcordanceRows(full.data.table, selected?.sourceIndex ?? 0)[0]?.matches
    : undefined;
  const opened = useRef(false);
  const { openDetailAt } = controller;
  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      openDetailAt(initialIndex);
    }
  }, [openDetailAt, initialIndex]);
  return (
    <RowDetailPanel
      open={controller.detailOpen}
      onOpenChange={(open) => {
        controller.setDetailOpen(open);
        if (!open) onClose();
      }}
      payload={controller.detailPayload}
      customization={{
        label: 'Concordance',
        renderDocumentText: (text) => (
          <>
            {full.error && (
              <OperationError title="Could not refresh document details" error={full.error} />
            )}
            <HighlightedDocument
              text={text}
              matches={matches ?? controller.selectedItem?.matches ?? []}
            />
          </>
        ),
      }}
      navigation={controller.navigation}
    />
  );
}
