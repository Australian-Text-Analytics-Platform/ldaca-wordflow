import { decodeAnalysisRequest, matchesAnalysisRequest } from '../common/analysisRequest';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { toast } from 'sonner';
import { AnalysisPublishMenu } from '../common/components/AnalysisPublishMenu';
import { inspectAnalysisRow } from '../common/components/inspectAnalysisRow';
import { VIZ_PALETTE, GREY } from '../common/vizPalette';
import HelpIcon from '@/components/help/HelpIcon';
import { useEffect, useId, useRef, useState } from 'react';
import { keepPreviousData, useQueries, useQueryClient, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RowDetailPanel } from '../common/components/RowDetailPanel';
import { useRowDetailDialog } from '../common/components/useRowDetailDialog';
import { TablePaginationFooter } from '../common/components/TablePaginationFooter';
import { objectDependencies } from '@/features/project/projectChanges';
import * as api from '@/features/project/api';
import {
  decodeConcordanceRows,
  interleave,
  showValue,
  type DocumentRow,
  type Match,
} from './concordanceRows';
import { toNodeSurfaceColor } from '@/lib/nodeColor';
import {
  previewDensity,
  type Density,
  type DispersionChartMode,
} from './concordanceDispersionModel';
import { ConcordanceDispersion } from './ConcordanceDispersion';
import { ConcordancePublishDialog } from './ConcordancePublishDialog';
interface Props {
  onCancelPreview?: () => void;
  base: string;
  tab: api.Tab;
  result?: api.ConcordanceAnalysisResult;
  submitted: { request: api.ConcordanceRequest; generation: number } | null;
  draft: api.ConcordanceRequest;
  active: boolean;
  stopped: boolean;
  view: 'preview' | 'saved';
  colors: Record<string, string>;
  editing: boolean;
  onSettings: (patch: Record<string, unknown>) => void;
}
type Page = Awaited<ReturnType<typeof api.previewConcordance>>;
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
  const request =
    saved && result
      ? decodeAnalysisRequest('concordance', result.request).request
      : submitted?.request;
  const [presentation, setPresentation] = useState(
    tab.settings.presentation === 'dispersion' ? 'dispersion' : 'table',
  );
  const [combined, setCombined] = useState(false);
  const panelId = useId();
  const [pageSize, setPageSize] = useState(20);
  const [pages, setPages] = useState<number[]>([]);
  const [sorts, setSorts] = useState<(api.ConcordanceSort | null)[]>([]);
  const [highlightContext, setHighlightContext] = useState(true);
  const [metadata, setMetadata] = useState<string[]>([]);
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
  const cache = useQueryClient();
  const filter = (index: number): api.ConcordanceFilter => ({
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
      const query: api.ConcordanceQuery = {
        source_index: index,
        projection: presentation === 'table' ? 'matches' : 'documents',
        filter: filter(index),
        page: (pages[index] ?? 0) + 1,
        page_size: pageSize,
        sort,
      };
      const preview: api.ConcordancePreviewRequest = {
        input,
        search: (request ?? draft).search,
        page: (pages[index] ?? 0) + 1,
        page_size: pageSize,
        sort: sort?.metadata ? { column: sort.field, descending: sort.descending } : null,
      };
      return {
        queryKey: saved
          ? ['native', base, 'analyses', result?.id, 'concordance', query]
          : ['native', base, 'analysis-preview', tab.id, preview],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          saved
            ? api.queryConcordance(base, result?.id ?? '', query, signal)
            : api.previewConcordance(base, tab.id, preview, signal),
        enabled: active && Boolean(saved ? result : submitted) && (!stopped || saved),
        meta: saved ? undefined : objectDependencies(input.source),
        placeholderData: saved ? undefined : keepPreviousData,
        staleTime: Infinity,
      };
    }),
  });
  const generation = useRef(submitted);
  useEffect(() => {
    const previous = generation.current;
    generation.current = submitted;
    if (
      previous?.generation !== submitted?.generation &&
      JSON.stringify(previous?.request) === JSON.stringify(submitted?.request)
    ) {
      void cache.invalidateQueries({ queryKey: ['native', base, 'analysis-preview', tab.id] });
    }
  }, [submitted, cache, base, tab.id]);
  const submission = saved ? result?.id : submitted?.generation;
  const [displayedSubmission, setDisplayedSubmission] = useState(submission);
  if (displayedSubmission !== submission) {
    setDisplayedSubmission(submission);
    setPages([]);
  }
  // Retain the last successful page when a refresh fails, visibly marked below.
  const [retained, setRetained] = useState<Record<string, Page>>({});
  const fresh = queries.flatMap((query, index) => {
    const key = JSON.stringify([
      view,
      saved ? result?.id : null,
      saved ? presentation : null,
      request?.inputs[index]?.source,
    ]);
    return query.data && !query.isPlaceholderData && retained[key] !== query.data
      ? [[key, query.data] as const]
      : [];
  });
  if (fresh.length) setRetained({ ...retained, ...Object.fromEntries(fresh) });
  const data = queries.map(
    (query, index) =>
      query.data ??
      retained[
        JSON.stringify([
          view,
          saved ? result?.id : null,
          saved ? presentation : null,
          request?.inputs[index]?.source,
        ])
      ],
  );
  const rawRows = data.map((page, index) => (page ? decodeConcordanceRows(page.table, index) : []));
  const rows = rawRows.map((group) => group.filter((row) => row.matches.length > 0));
  const groups = combined ? [interleave(rows)] : rows;
  const densityQueries = useQueries({
    queries:
      saved && result
        ? result.result.payload.corpora.map((_, source_index) => ({
            queryKey: ['native', base, 'analyses', result.id, 'density', source_index],
            queryFn: ({ signal }: { signal: AbortSignal }) =>
              api.concordanceDensity(
                base,
                result.id,
                { source_index, bin_count: 100, uncased: false },
                signal,
              ),
            enabled: active && presentation === 'dispersion',
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
  const outdated = Boolean(request && !matchesAnalysisRequest('concordance', draft, request));
  const color = (index: number) => {
    const input = request?.inputs[index];
    return input
      ? (colors[api.targetKey(input.source)] ?? VIZ_PALETTE[index] ?? GREY)
      : 'currentColor';
  };
  const sourceColumns = (request?.inputs ?? []).map((_, index) =>
    saved
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
        table={{
          setPageIndex: (page) => {
            changePage(index, page);
          },
          setPageSize: (size) => {
            setPageSize(size);
            setPages([]);
          },
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
          {outdated && (
            <p role="status" className="text-description">
              Displayed results use the previously submitted search. Preview or Run to apply your
              draft.
            </p>
          )}
          {queries.some(
            (query) => query.isFetching || query.isError || query.isPlaceholderData,
          ) && (
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
                      {group.fields.map((column) => (
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
                                checked ? [...old, column] : old.filter((item) => item !== column),
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
                          key={api.targetKey(input.source)}
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
                        <TableHead>Left context</TableHead>
                        <TableHead>{sortButton(index, 'matched_text', 'Match')}</TableHead>
                        <TableHead>Right context</TableHead>
                        <TableHead>{sortButton(index, 'l1', 'L1')}</TableHead>
                        {saved && (
                          <TableHead>{sortButton(index, 'l1_frequency', 'L1 frequency')}</TableHead>
                        )}
                        <TableHead>{sortButton(index, 'r1', 'R1')}</TableHead>
                        {saved && (
                          <TableHead>{sortButton(index, 'r1_frequency', 'R1 frequency')}</TableHead>
                        )}
                        <TableHead>{sortButton(index, 'start_idx', 'Start')}</TableHead>
                        <TableHead>{sortButton(index, 'end_idx', 'End')}</TableHead>
                        {blockMetadata.map((column) => (
                          <TableHead key={column}>
                            {sortButton(index, column, column, true)}
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
                            <TableCell className="text-right whitespace-pre-wrap">
                              <Context
                                text={match.left_context}
                                word={highlightContext ? match.l1 : ''}
                                last
                              />
                            </TableCell>
                            <TableCell>
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
                            </TableCell>
                            <TableCell className="whitespace-pre-wrap">
                              <Context
                                text={match.right_context}
                                word={highlightContext ? match.r1 : ''}
                              />
                            </TableCell>
                            <TableCell>{match.l1}</TableCell>
                            {saved && <TableCell>{showValue(match.l1_frequency)}</TableCell>}
                            <TableCell>{match.r1}</TableCell>
                            {saved && <TableCell>{showValue(match.r1_frequency)}</TableCell>}
                            <TableCell>{showValue(match.start_idx)}</TableCell>
                            <TableCell>{showValue(match.end_idx)}</TableCell>
                            {blockMetadata.map((column) => (
                              <TableCell key={column}>{showValue(row.source[column])}</TableCell>
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
      <span className="rounded bg-list-hover px-0.5">{text.slice(at, at + word.length)}</span>
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
  inputs: api.ConcordanceInput[];
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
  const detailQuery: api.ConcordanceQuery = {
    source_index: selected?.sourceIndex ?? 0,
    projection: 'documents',
    filter: {
      document_id: selected?.documentId,
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
    queryFn: ({ signal }) => api.queryConcordance(base, analysisId ?? '', detailQuery, signal),
    enabled: Boolean(analysisId && selected),
    staleTime: Infinity,
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
          <HighlightedDocument
            text={text}
            matches={matches ?? controller.selectedItem?.matches ?? []}
          />
        ),
      }}
      navigation={controller.navigation}
    />
  );
}
