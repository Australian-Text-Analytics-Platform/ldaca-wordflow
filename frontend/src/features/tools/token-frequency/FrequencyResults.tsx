import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { toast } from 'sonner';
import { buildChartExport, saveGeneratedExport } from '../common/chartExport';
import { emptyConcordance, useConcordanceState } from '../concordance/concordanceState';
import { objectDependencies } from '@/features/project/projectChanges';
import { useDeferredValue, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import type { Table, TypeMap } from 'apache-arrow';
import { Button } from '@/components/ui/button';
import HelpIcon from '@/components/help/HelpIcon';
import { Input } from '@/components/ui/input';
import type { NodeInputsPanelProps } from '@/features/tools/common/components/NodeInputsPanel';
import { GREY } from '@/features/tools/common/vizPalette';
import { TablePaginationFooter } from '../common/components/TablePaginationFooter';
import { FrequencyCorpusLegend } from './FrequencyCorpusLegend';
import { reportProjectError } from '@/features/project/projectErrors';
import * as api from '@/features/project/api';
import { FrequencyCorpusCloud, FrequencyJuxtorpusCloud } from './FrequencyCharts';
import { FrequencyRankedList, FREQUENCY_LIST_CHUNK_SIZE } from './FrequencyRankedList';
import { FrequencyComparison } from './FrequencyComparison';
import { DownloadButton } from '../common/components/DownloadControl';
import { FrequencyDownload } from './FrequencyDownload';
import { buildFrequencyBundle, type DownloadFormat } from './frequencyExport';
import { exactCount, useFrequencySettings, corpusColor } from './frequencySettings';
import { StopwordControl } from '../common/stopwords/StopwordControl';
import { useStopwords } from '../common/stopwords/useStopwords';
import { completeStopwordSource, type StopwordSource } from '../common/stopwords/stopwordData';

const NO_STOPWORDS: string[] = [];
type RecordRow = Record<string, unknown>;
const records = (table: Table<TypeMap> | undefined): RecordRow[] =>
  table
    ? Array.from({ length: table.numRows }, (_, row) =>
        Object.fromEntries(
          table.schema.fields.map((field) => [
            field.name,
            table.getChild(field.name)?.get(row) as unknown,
          ]),
        ),
      )
    : [];
// Query selection retains decoded rows across observer/status and interaction updates.
const projectionRows = (page: Awaited<ReturnType<typeof api.queryFrequency>>) => ({
  ...page,
  rows: records(page.table),
});
const NO_ROWS: RecordRow[] = [];
interface DownloadTarget {
  label: string;
  kind: 'chart' | 'table';
  analysisId: string;
  query: api.FrequencyQuery;
  stopwords: string[];
  svg?: SVGSVGElement;
}

export function FrequencyResults({
  base,
  tab,
  result,
  outdated,
  active,
  editing,
  nodes,
  inputs,
  inputRequests,
  onOpenConcordance,
}: {
  onOpenConcordance?: () => void;
  base: string;
  tab: api.Tab;
  result: api.FrequencyAnalysisResult;
  outdated: boolean;
  active: boolean;
  editing: boolean;
  nodes: api.ProjectNode[];
  inputs: StopwordSource[];
  inputRequests?: Pick<NodeInputsPanelProps, 'pendingInputRequest' | 'consumeInputRequest'>;
}) {
  const cache = useQueryClient();
  const handoff = useMutation({
    mutationFn: async (token: string) => {
      const request = {
        inputs: result.result.payload.corpora.map(({ source, column, tokenizer }) => ({
          source,
          column,
          tokenizer,
        })),
        search: { ...emptyConcordance.search, query: token },
      };
      const created = await api.createTab(base, 'concordance');
      await cache.cancelQueries({ queryKey: ['native', base, 'tabs', 'concordance'] });
      cache.setQueryData<api.Tab[]>(['native', base, 'tabs', 'concordance'], (old) => [
        ...(old ?? []).filter((tab) => tab.id !== created.id),
        created,
      ]);
      useConcordanceState.getState().handoff(base, created.id, request);
      onOpenConcordance?.();
    },
  });
  const openToken = (token: string) => {
    if (!editing && !handoff.isPending) handoff.mutate(token);
  };
  const { settings, persist, change } = useFrequencySettings(
    base,
    tab,
    editing,
    result.result.payload.corpora,
  );
  const filterText = settings.filter;
  const [download, setDownload] = useState<DownloadTarget | null>(null);
  const svgs = useRef(new Map<string, SVGSVGElement>());
  const synchronized = useRef(new WeakMap<HTMLDivElement, number>());
  const scrolls = useRef(new Map<number, HTMLDivElement>());
  const stopwordController = useStopwords({
    base,
    selected: settings.stopwordSource,
    inputs,
    active,
    onSelect: (selected) => persist({ stopwordSource: selected, stopwordsEnabled: true }),
  });
  const liveWords = stopwordController.words;
  const appliedStopwords = settings.stopwordsEnabled
    ? completeStopwordSource(settings.stopwordSource)
    : null;
  const stopwordsUnavailable =
    appliedStopwords !== null &&
    (liveWords.isPending ||
      liveWords.isFetching ||
      liveWords.isError ||
      liveWords.isPlaceholderData);
  const filter = useDeferredValue(filterText);
  const candidateWords =
    appliedStopwords !== null ? (liveWords.data ?? NO_STOPWORDS) : NO_STOPWORDS;
  const candidateSource = appliedStopwords ?? undefined;
  const [resolved, setResolved] = useState({
    filter,
    source: candidateSource,
    words: candidateWords,
  });
  // Preserve the last resolved filter when a replacement list cannot be read.
  if (
    !stopwordsUnavailable &&
    (resolved.filter !== filter ||
      resolved.words !== candidateWords ||
      JSON.stringify(resolved.source) !== JSON.stringify(candidateSource))
  ) {
    setResolved({ filter, source: candidateSource, words: candidateWords });
  }
  const common = { filter: resolved.filter, stopword_source: resolved.source };
  const stopwords = resolved.words;
  const corpusQueries: api.FrequencyQuery[] = result.result.payload.corpora.map(
    (_, corpus_index) => ({
      ...common,
      view: 'corpus',
      corpus_index,
      page: 1,
      page_size: settings.display === 'cloud' ? settings.cloudLimit : FREQUENCY_LIST_CHUNK_SIZE,
      ...(settings.display === 'cloud'
        ? { limit: settings.cloudLimit }
        : settings.listLimit !== null
          ? { limit: settings.listLimit }
          : {}),
    }),
  );
  const pageKey = JSON.stringify([
    common,
    liveWords.dataUpdatedAt,
    settings.comparisonSort,
    settings.comparisonDescending,
    settings.comparisonRows,
  ]);
  const [pagination, setPagination] = useState({ key: pageKey, page: 1 });
  const page = pagination.key === pageKey ? pagination.page : 1;
  const comparisonQuery: api.FrequencyQuery = {
    ...common,
    view: 'comparison',
    sort: settings.comparisonSort,
    descending: settings.comparisonDescending,
    page,
    page_size: settings.comparisonRows,
  };
  const juxtorpusQuery: api.FrequencyQuery = {
    ...common,
    view: 'juxtorpus',
    limit: settings.cloudLimit,
    page_size: settings.cloudLimit * 2,
  };
  const projectionOptions = (query: api.FrequencyQuery, enabled: boolean) => ({
    queryKey: ['native', base, 'analyses', result.id, 'rows', query],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      api.queryFrequency(base, result.id, query, signal),
    select: projectionRows,
    enabled: active && enabled && !stopwordsUnavailable,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    meta: {
      ...objectDependencies(...(query.stopword_source ? [query.stopword_source.source] : [])),
      reportError: false,
    },
  });
  const first = useQuery(
    projectionOptions(corpusQueries[0] ?? { view: 'corpus', corpus_index: 0 }, true),
  );
  const second = useQuery(
    projectionOptions(
      corpusQueries[1] ?? { view: 'corpus', corpus_index: 1 },
      result.result.payload.corpora.length === 2,
    ),
  );
  const hasComparison = Boolean(result.result.payload.comparison_artifact_id);
  const juxtaposed = useQuery(
    projectionOptions(juxtorpusQuery, hasComparison && settings.display === 'cloud'),
  );
  const compared = useQuery(
    projectionOptions(comparisonQuery, hasComparison && settings.display === 'list'),
  );
  const corpusData = result.result.payload.corpora.length === 2 ? [first, second] : [first];
  const projections = [...corpusData, juxtaposed, compared];
  const colors = result.result.payload.corpora.map((corpus, index) =>
    corpusColor(settings, corpus.source, corpus.color, index),
  );
  const addStopword = editing
    ? undefined
    : (token: string) => {
        stopwordController.add.mutate(token);
      };
  const capture = (
    label: string,
    kind: 'chart' | 'table',
    query: api.FrequencyQuery,
    chartKey?: string,
  ) => {
    const svg = chartKey ? svgs.current.get(chartKey) : undefined;
    if (kind === 'chart' && !svg) return;
    setDownload({
      label,
      kind,
      query: structuredClone(query),
      analysisId: result.id,
      stopwords: [...stopwords],
      ...(svg ? { svg: svg.cloneNode(true) as SVGSVGElement } : {}),
    });
  };
  const exportCaptured = async (format: DownloadFormat, includeStopwords: boolean) => {
    if (!download) return null;
    const filename = `${download.label.replace(/[/\\]/g, '_')}.${format === 'markdown' ? 'md' : format}`;
    if (
      download.kind === 'table' &&
      (format === 'csv' || format === 'markdown') &&
      !includeStopwords
    )
      return api.exportFrequency(base, download.analysisId, download.query, format, filename);
    let blob: Blob;
    let exportedWords = download.stopwords;
    if (format === 'csv' || format === 'markdown') {
      if (includeStopwords) {
        const parts = await api.downloadFrequencyParts(
          base,
          download.analysisId,
          download.query,
          format,
        );
        blob = parts.table;
        exportedWords = parts.stopwords;
      } else blob = await api.downloadFrequency(base, download.analysisId, download.query, format);
    } else {
      if (!download.svg) throw new Error('The selected cloud is unavailable.');
      blob = await buildChartExport(download.svg, format);
    }
    return saveGeneratedExport(
      includeStopwords ? await buildFrequencyBundle(blob, filename, exportedWords) : blob,
      includeStopwords ? `${download.label}.zip` : filename,
    );
  };
  const bindSvg = (key: string, element: SVGSVGElement | null) => {
    if (element) svgs.current.set(key, element);
    else svgs.current.delete(key);
  };
  const juxtorpusRows = juxtaposed.data?.rows ?? NO_ROWS;
  const comparisonRows = compared.data?.rows ?? NO_ROWS;
  const querying = projections.some((projection) => projection.isFetching);
  const queryError = projections.find((projection) => projection.isError);
  const [displayedOutput, setDisplayedOutput] = useState(false);
  const initial = [
    ...corpusData,
    ...(hasComparison ? [settings.display === 'cloud' ? juxtaposed : compared] : []),
  ];
  if (!displayedOutput && initial.every((query) => Boolean(query.data))) setDisplayedOutput(true);
  if (!displayedOutput && initial.some((query) => !query.data) && !stopwordsUnavailable)
    return (
      <AnalysisProgress
        name={tab.name}
        message={queryError ? 'Could not load results.' : 'Loading results…'}
        error={Boolean(queryError)}
        onRetry={
          queryError
            ? () => {
                initial.forEach((query) => {
                  void query.refetch();
                });
              }
            : undefined
        }
      />
    );
  return (
    <section
      aria-label="Frequency results"
      className="min-w-0 space-y-3 rounded-lg border border-surface-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-body font-semibold">Results</h2>
          <HelpIcon targetKey="analysis.token-frequency.results" label="Frequency results help" />
        </div>
        <span className="text-label-secondary text-description">
          Saved {new Date(result.result.finished_at).toLocaleString()}
        </span>
      </div>
      {outdated && (
        <p role="status" className="text-description">
          Inputs have changed. These results show the last successful run.
        </p>
      )}
      <StopwordControl
        inputRequests={inputRequests}
        base={base}
        nodes={nodes}
        selected={settings.stopwordSource}
        enabled={settings.stopwordsEnabled}
        disabled={editing}
        controller={stopwordController}
        onSelect={(selected) =>
          persist({ stopwordSource: selected, stopwordsEnabled: selected !== null })
        }
        onEnabledChange={(stopwordsEnabled) => {
          change({ stopwordsEnabled });
        }}
      />
      {stopwordsUnavailable && (
        <p role="status" className="text-body-secondary text-description">
          The display is outdated while stopwords are unavailable or updating. Choose a valid list,
          retry, or turn filtering off.
        </p>
      )}
      <fieldset className="flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 space-y-1">
          <span className="text-label-secondary">Filter tokens</span>
          <Input
            aria-label="Filter tokens"
            placeholder="* and ? wildcards"
            value={filterText}
            onChange={(event) => {
              change({ filter: event.target.value });
            }}
          />
        </label>
        {filterText && (
          <Button
            variant="ghost"
            onClick={() => {
              change({ filter: '' });
            }}
          >
            Clear token filter
          </Button>
        )}
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-2">
        <Button
          variant={settings.display === 'cloud' ? 'secondary' : 'ghost'}
          aria-pressed={settings.display === 'cloud'}
          onClick={() => {
            change({ display: 'cloud' });
          }}
        >
          Word clouds
        </Button>
        <Button
          variant={settings.display === 'list' ? 'secondary' : 'ghost'}
          aria-pressed={settings.display === 'list'}
          onClick={() => {
            change({ display: 'list' });
          }}
        >
          Ranked lists
        </Button>
      </fieldset>
      <fieldset className="flex flex-wrap items-end gap-3">
        <label className="w-32 space-y-1">
          <span className="text-label-secondary">
            {settings.display === 'cloud' ? 'Words per cloud' : 'List limit'}
          </span>
          <NumberPreferenceInput
            key={settings.display}
            label={settings.display === 'cloud' ? 'Words per cloud' : 'List limit'}
            min={settings.display === 'cloud' ? 10 : 1}
            max={settings.display === 'cloud' ? 100 : undefined}
            allowEmpty={settings.display === 'list'}
            value={settings.display === 'cloud' ? settings.cloudLimit : settings.listLimit}
            onCommit={(value) => {
              if (settings.display === 'cloud' && value !== null) change({ cloudLimit: value });
              else if (settings.display === 'list') change({ listLimit: value });
            }}
          />
        </label>
      </fieldset>
      {querying && (
        <p role="status" className="text-label-secondary text-description">
          Updating display…
        </p>
      )}
      {queryError && (
        <p role="alert" className="text-description">
          The display could not be updated. Saved results are retained.{' '}
          <Button
            variant="link"
            onClick={() => {
              void queryError.refetch();
            }}
          >
            Retry
          </Button>
        </p>
      )}
      <div className="grid min-w-0 grid-cols-1 gap-4 @xl/frequency:grid-cols-2">
        {result.result.payload.corpora.map((corpus, index) => {
          const rows = corpusData[index]?.data?.rows ?? NO_ROWS;
          const label = corpus.label;
          return (
            <section key={index} aria-label={`${label} frequencies`} className="min-w-0 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words font-semibold">{label}</h3>
                  {filterText && corpusData[index]?.data && (
                    <p className="text-description text-label-secondary">
                      {corpusData[index].data.totalRows.toLocaleString()} matching tokens
                    </p>
                  )}
                  {result.result.payload.corpora.length === 2 && (
                    <p className="text-description">
                      {index === 0 ? 'Reference corpus' : 'Study corpus'}
                    </p>
                  )}
                </div>
                <DownloadButton
                  label={`Export ${label} ${settings.display === 'cloud' ? 'cloud' : 'list'}`}
                  disabled={
                    stopwordsUnavailable ||
                    !rows.length ||
                    corpusData[index]?.isFetching === true ||
                    corpusData[index]?.isPlaceholderData === true ||
                    filterText !== filter
                  }
                  onClick={() => {
                    capture(
                      label,
                      settings.display === 'cloud' ? 'chart' : 'table',
                      { ...common, view: 'corpus', corpus_index: index },
                      `corpus-${String(index)}`,
                    );
                  }}
                />
              </div>
              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-label-secondary text-description">
                <div>
                  <dt>Documents</dt>
                  <dd className="tabular-nums">{exactCount(corpus.document_count)}</dd>
                </div>
                <div>
                  <dt>Total tokens</dt>
                  <dd className="tabular-nums">{exactCount(corpus.total_tokens)}</dd>
                </div>
                <div>
                  <dt>Vocabulary</dt>
                  <dd className="tabular-nums">{exactCount(corpus.vocabulary_size)}</dd>
                </div>
              </dl>
              {!rows.length && !corpusData[index]?.isPending ? (
                <p className="py-4 text-description">No matching tokens.</p>
              ) : settings.display === 'cloud' ? (
                <FrequencyCorpusCloud
                  label={`${label} word cloud`}
                  rows={rows}
                  color={colors[index]}
                  onTokenContextMenu={addStopword}
                  onTokenClick={openToken}
                  svgRef={(element) => {
                    bindSvg(`corpus-${String(index)}`, element);
                  }}
                />
              ) : (
                <FrequencyRankedList
                  key={JSON.stringify([corpusQueries[index], liveWords.dataUpdatedAt])}
                  base={base}
                  analysisId={result.id}
                  query={corpusQueries[index] ?? { ...common, view: 'corpus', corpus_index: index }}
                  firstPage={corpusData[index]?.data}
                  active={active && !stopwordsUnavailable && !corpusData[index]?.isPlaceholderData}
                  label={`${label} ranked frequencies`}
                  color={colors[index] ?? GREY}
                  onTokenContextMenu={addStopword}
                  onTokenClick={openToken}
                  registerScrollElement={(element) => {
                    if (element) scrolls.current.set(index, element);
                    else scrolls.current.delete(index);
                  }}
                  onScroll={(event) => {
                    const source = event.currentTarget;
                    const expected = synchronized.current.get(source);
                    synchronized.current.delete(source);
                    if (expected !== undefined && Math.abs(expected - source.scrollTop) <= 1)
                      return;
                    for (const [other, element] of scrolls.current) {
                      if (other === index) continue;
                      const position = Math.min(
                        source.scrollTop,
                        Math.max(0, element.scrollHeight - element.clientHeight),
                      );
                      if (Math.abs(element.scrollTop - position) > 1) {
                        synchronized.current.set(element, position);
                        element.scrollTop = position;
                      }
                    }
                  }}
                />
              )}
            </section>
          );
        })}
      </div>
      {result.result.payload.comparison_artifact_id &&
        (settings.display === 'cloud' ? (
          <section aria-label="Juxtorpus" className="space-y-2 border-t border-surface-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Juxtorpus</h3>
                <HelpIcon
                  targetKey="analysis.token-frequency.unified-word-cloud"
                  label="Juxtorpus help"
                />
              </div>
              <DownloadButton
                label="Export Juxtorpus cloud"
                disabled={
                  stopwordsUnavailable ||
                  !juxtorpusRows.length ||
                  juxtaposed.isFetching ||
                  juxtaposed.isPlaceholderData ||
                  filterText !== filter
                }
                onClick={() => {
                  capture('Juxtorpus', 'chart', juxtorpusQuery, 'juxtorpus');
                }}
              />
            </div>
            <p className="text-label-secondary text-description">
              Size shows combined frequency; colour shows relative representation in the reference
              and study corpora.
            </p>
            <FrequencyCorpusLegend
              corpora={result.result.payload.corpora}
              colors={colors}
              gradient
            />
            <FrequencyJuxtorpusCloud
              label="Juxtorpus word cloud"
              rows={juxtorpusRows}
              referenceColor={colors[0] ?? GREY}
              studyColor={colors[1] ?? GREY}
              onTokenContextMenu={addStopword}
              onTokenClick={openToken}
              svgRef={(element) => {
                bindSvg('juxtorpus', element);
              }}
            />
          </section>
        ) : (
          <section
            aria-label="Keyness statistics"
            className="space-y-2 border-t border-surface-border pt-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Keyness statistics</h3>
                {filterText && compared.data && (
                  <span className="text-description text-label-secondary">
                    {compared.data.totalRows.toLocaleString()} matching tokens
                  </span>
                )}
                <HelpIcon
                  targetKey="analysis.token-frequency.statistical-measures"
                  label="Keyness statistics help"
                />
              </div>
              <DownloadButton
                disabled={
                  stopwordsUnavailable ||
                  compared.isFetching ||
                  compared.isPlaceholderData ||
                  filterText !== filter
                }
                label="Export comparison table"
                onClick={() => {
                  capture('Frequency comparison', 'table', {
                    ...comparisonQuery,
                    limit: undefined,
                    page: undefined,
                    page_size: undefined,
                  });
                }}
              />
            </div>
            <p className="text-label-secondary text-description">
              Download includes every matching row, across all pages.
            </p>
            <FrequencyCorpusLegend corpora={result.result.payload.corpora} colors={colors} />
            <FrequencyComparison
              colors={colors}
              rows={comparisonRows}
              label="Frequency comparison"
              sort={settings.comparisonSort}
              descending={settings.comparisonDescending}
              onSort={(sort) => {
                change({
                  comparisonSort: sort,
                  comparisonDescending:
                    sort === settings.comparisonSort ? !settings.comparisonDescending : true,
                });
              }}
              onTokenContextMenu={addStopword}
              onTokenClick={openToken}
            />
            <TablePaginationFooter
              pageIndex={page - 1}
              pageSize={settings.comparisonRows}
              rowCount={compared.data?.totalRows ?? 0}
              loading={compared.isFetching}
              table={{
                setPageIndex: (index) => {
                  setPagination({ key: pageKey, page: index + 1 });
                },
                setPageSize: (size) => {
                  change({ comparisonRows: size });
                },
              }}
            />
          </section>
        ))}
      <FrequencyDownload
        open={download !== null}
        onOpenChange={(open) => {
          if (!open) setDownload(null);
        }}
        label={download?.label ?? ''}
        kind={download?.kind ?? 'table'}
        hasStopwords={Boolean(download?.stopwords.length)}
        onExport={exportCaptured}
        onError={reportProjectError}
      />
    </section>
  );
}

function NumberPreferenceInput({
  value,
  min,
  max,
  allowEmpty = false,
  disabled,
  label,
  className,
  onCommit,
}: {
  value: number | null;
  min: number;
  max?: number;
  allowEmpty?: boolean;
  disabled?: boolean;
  label: string;
  className?: string;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(String(value ?? ''));
  return (
    <Input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      step={1}
      placeholder={allowEmpty ? 'All' : undefined}
      disabled={disabled}
      className={className}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
      }}
      onBlur={() => {
        const number = Number(text);
        if (text === '' && allowEmpty) onCommit(null);
        else if (
          text !== '' &&
          Number.isInteger(number) &&
          number >= min &&
          (max === undefined || number <= max)
        )
          onCommit(number);
        else {
          setText(String(value ?? ''));
          toast.info(
            `Enter a whole number of at least ${String(min)}${max === undefined ? '' : ` and at most ${String(max)}`}${allowEmpty ? ', or leave it blank for all' : ''}.`,
          );
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
