import { useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import * as api from '@/features/project/api';
import { objectDependencies } from '@/features/project/projectChanges';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AnalysisNumberInput } from '../common/components/AnalysisNumberInput';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { DownloadButton, DownloadDialog } from '../common/components/DownloadControl';
import {
  buildChartExport,
  CHART_FORMATS,
  saveGeneratedExport,
  type ChartExportFormat,
} from '../common/chartExport';
import { StopwordControl } from '../common/stopwords/StopwordControl';
import {
  completeStopwordSource,
  stopwordSource as decodeStopwordSource,
} from '../common/stopwords/stopwordData';
import { useStopwords } from '../common/stopwords/useStopwords';
import { GREY, VIZ_PALETTE } from '../common/vizPalette';
import { TopicModelingFlowChart } from './TopicModelingFlowChart';
import { TopicSelectionPanel } from './TopicSelectionPanel';
import { buildTopicBubbleModels } from './topicModelingGraph';
import type { TopicModelingTopic } from './topicPresentation';
import { TopicDocuments } from './TopicDocuments';
import { TopicPublishDialog } from './TopicPublishDialog';
import { topicDownload } from './topicExport';

export function TopicResults({
  base,
  tab,
  owner,
  summary,
  request,
  settings,
  onSettings,
  nodes,
  active,
  editing,
  outdated,
}: {
  base: string;
  tab: api.Tab;
  owner: { analysis: string } | { tab: string; preview: string };
  summary: api.TopicSummary;
  request: api.TopicRequest;
  settings: Record<string, unknown>;
  onSettings: (patch: Record<string, unknown>) => void;
  nodes: api.ProjectNode[];
  active: boolean;
  editing: boolean;
  outdated: boolean;
}) {
  const isSaved = 'analysis' in owner;
  const modelId = isSaved ? owner.analysis : owner.preview;
  const preference = settings.topic_projection as
    | { analysis?: string; topic_count?: number; top_n?: number }
    | undefined;
  const [count, setCount] = useState(() =>
    isSaved && preference?.analysis === modelId && typeof preference.topic_count === 'number'
      ? Math.max(
          summary.natural_topic_count ? 1 : 0,
          Math.min(summary.natural_topic_count, preference.topic_count),
        )
      : summary.natural_topic_count,
  );
  const [sliderValue, setSliderValue] = useState<number | null>(null);
  const [topN, setTopN] = useState(() =>
    isSaved && preference?.analysis === modelId && typeof preference.top_n === 'number'
      ? Math.max(count ? 1 : 0, Math.min(count, preference.top_n))
      : Math.min(2, count),
  );
  const wordLimit =
    typeof settings.topic_word_limit === 'number'
      ? Math.min(100, Math.max(3, settings.topic_word_limit))
      : 15;
  const stopwordSource = decodeStopwordSource(settings.stopword_source);
  const stopwordsEnabled = settings.stopwords_enabled === true;
  const appliedStopwords = stopwordsEnabled ? completeStopwordSource(stopwordSource) : null;
  const selectStopwords = (selected: api.StopwordSource | null) => {
    onSettings({ stopword_source: selected, stopwords_enabled: selected !== null });
    return Promise.resolve();
  };
  const stopwords = useStopwords({
    base,
    selected: stopwordSource,
    inputs: summary.sources.map((s) => s.input),
    active,
    onSelect: selectStopwords,
  });
  const root = isSaved
    ? ['native', base, 'analyses', modelId, 'topic-modeling']
    : ['native', base, 'analysis-preview', tab.id, modelId];
  const map = useQuery({
    queryKey: [...root, 'map', base, owner, count],
    queryFn: ({ signal }) =>
      api.queryTopicModel(base, owner, { projection: 'map', topic_count: count }, signal),
    enabled: active,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
  const words = useQuery({
    queryKey: [...root, 'words', base, owner, count, appliedStopwords],
    queryFn: ({ signal }) =>
      api.queryTopicModel(
        base,
        owner,
        {
          projection: 'words',
          topic_count: count,
          stopword_source: appliedStopwords,
        },
        signal,
      ),
    enabled: active,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    meta: objectDependencies(...(appliedStopwords ? [appliedStopwords.source] : [])),
  });
  const [applied, setApplied] = useState<{
    count: number;
    basis: api.TopicBasis;
    words: api.TopicWords;
  } | null>(null);
  if (
    map.data?.projection === 'map' &&
    words.data?.projection === 'words' &&
    !map.isPlaceholderData &&
    !words.isPlaceholderData &&
    !map.isFetching &&
    !words.isFetching &&
    (applied?.basis !== map.data || applied.words !== words.data)
  )
    setApplied({ count, basis: map.data, words: words.data });
  const [inspectedTopic, setInspectedTopic] = useState<number | null>(null);
  const [selection, setSelection] = useState(new Set<number>());
  const [lasso, setLasso] = useState(new Set<number>());
  const [lassoMode, setLassoMode] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [csv, setCsv] = useState(true);
  const [publication, setPublication] = useState<api.TopicPublish | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const colors = (settings.colors ?? {}) as Record<string, string>;
  const sourceIds = summary.sources.map((s) => api.targetKey(s.input.source));
  const nodeColors = Object.fromEntries(
    summary.sources.map((s, i) => [
      sourceIds[i] ?? '',
      colors[api.targetKey(s.input.source)] ??
        nodes.find((node) => node.table_name === s.input.source.name)?.color ??
        VIZ_PALETTE[i] ??
        GREY,
    ]),
  );
  const corpusPresentation = {
    corpusCount: summary.sources.length,
    panelNodeIds: sourceIds,
    nodeColors,
    defaultPalette: VIZ_PALETTE,
  };
  const memberships = new Map<number, number[]>();
  for (const [source, topic, rank, rows] of applied?.basis.activations ?? []) {
    if (rank > topN) continue;
    const counts = memberships.get(topic) ?? summary.sources.map(() => 0);
    counts[source] = (counts[source] ?? 0) + rows;
    memberships.set(topic, counts);
  }
  const allTopics: TopicModelingTopic[] = (applied?.basis.topics ?? []).map((topic) => {
    const size = memberships.get(topic.id) ?? summary.sources.map(() => 0);
    return {
      ...topic,
      representative_words: applied?.words.words[topic.id] ?? [],
      size,
      total_size: size.reduce((a, b) => a + b, 0),
    };
  });
  const topics = allTopics.map((topic) => ({
    ...topic,
    representative_words: topic.representative_words.slice(0, wordLimit),
  }));
  const bubbles = buildTopicBubbleModels({
    topics,
    corpusSizes: summary.sources.map((s) => s.document_count),
    ...corpusPresentation,
    selectedTopicIds: selection,
    lassoTopicIds: lasso,
    hoveredTopicId: hover,
    topicSearchQuery: search,
  });
  const failed = map.isError || words.isError;
  const unresolved =
    outdated ||
    failed ||
    map.isFetching ||
    words.isFetching ||
    map.isPlaceholderData ||
    words.isPlaceholderData ||
    !applied;
  const scope = isSaved
    ? 'Full data'
    : `Sampled Preview · ${summary.sources.map((s) => `${s.document_count.toLocaleString()} of ${s.total_count.toLocaleString()} ${s.input.source.name}`).join(' · ')}`;
  const download = useMutation({
    mutationFn: async (format: ChartExportFormat) => {
      let svg = frame.current?.querySelector<SVGSVGElement>(
        'svg[data-topic-modeling-export="true"]',
      );
      if (!svg && applied?.basis.topics.length === 0) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '800');
        svg.setAttribute('height', '120');
        const label = document.createElementNS(svg.namespaceURI, 'text');
        label.setAttribute('x', '24');
        label.setAttribute('y', '60');
        label.setAttribute('fill', 'currentColor');
        label.textContent = 'No topics were found.';
        svg.append(label);
      }
      if (!svg || unresolved) throw new Error('The displayed model is not ready to download.');
      const snapshot = topicDownload(svg, {
        scope,
        sources: summary.sources.map((s) => s.input.source.name),
        model: request.embedding_model,
        count: applied.count,
        topN,
        seed: request.seed,
        wordLimit,
        search,
        lasso: [...lasso],
        documentCounts: summary.sources.map((s) => s.document_count),
        topics: allTopics,
        selected: selection,
        colors: summary.sources.map((s) => nodeColors[api.targetKey(s.input.source)] ?? GREY),
      });
      const image = await buildChartExport(snapshot.svg, format);
      const stem = `${tab.name}${isSaved ? '' : '_sample'}`;
      if (!csv) return saveGeneratedExport(image, `${stem}.${format}`);
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      zip.file(`${stem}.${format}`, await image.arrayBuffer());
      zip.file(`${stem}_topics.csv`, snapshot.csv);
      return saveGeneratedExport(await zip.generateAsync({ type: 'blob' }), `${stem}.zip`);
    },
  });
  const toggle = (id: number) => {
    setSelection((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const changeCount = (next: number) => {
    if (next === count) return;
    setCount(next);
    setInspectedTopic(null);
    setTopN((old) => Math.min(next, old));
    setSelection(new Set());
    setLasso(new Set());
    setHover(null);
    setLassoMode(false);
    if (isSaved)
      onSettings({
        topic_projection: { analysis: modelId, topic_count: next, top_n: Math.min(next, topN) },
      });
  };
  if (!applied)
    return (
      <AnalysisProgress
        name={tab.name}
        message={failed ? 'Could not load the model projection.' : 'Loading results…'}
        error={failed}
        onRetry={
          failed
            ? () => {
                void map.refetch();
                void words.refetch();
              }
            : undefined
        }
      />
    );
  return (
    <section
      aria-label="Topic Modelling results"
      className="space-y-3 rounded-lg border border-surface-border p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{isSaved ? 'Results' : 'Preview'}</h2>
        <div className="flex items-center gap-2">
          {isSaved && (
            <Button
              variant="outline"
              disabled={editing || unresolved}
              onClick={() => {
                setPublication({
                  topic_count: applied.count,
                  top_n: topN,
                  selected_topics: [...selection],
                  sources: summary.sources.map((s, i) => ({
                    source: i,
                    name: `${s.input.source.name}_topics`,
                    columns: [s.input.column],
                    coverage: true,
                  })),
                  dictionary_name: `${tab.name}_dictionary`,
                  words: allTopics.map((topic) =>
                    topic.representative_words.map((word) => word.word),
                  ),
                });
              }}
            >
              Add to Project
            </Button>
          )}
          <DownloadButton
            disabled={unresolved || download.isPending}
            onClick={() => {
              setDownloadOpen(true);
            }}
          />
        </div>
      </div>
      <p className="text-description text-label-secondary">
        {scope} · {summary.segment_count.toLocaleString()} segments.{' '}
        {isSaved
          ? 'Saved model is independent of current source data.'
          : 'Sample topics may differ from a full Run.'}
      </p>
      <div className="flex flex-wrap gap-3">
        {summary.sources.map((source, i) => (
          <span key={i} className="inline-flex min-w-0 items-center gap-2 break-words">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ background: nodeColors[sourceIds[i] ?? ''] }}
            />
            {source.input.source.name} · {source.document_count.toLocaleString()} documents
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-3">
        <div className="space-y-2">
          <label className="flex items-center justify-between gap-2">
            Number of topics
            <AnalysisNumberInput
              aria-label="Number of topics"
              className="w-24"
              value={count}
              min={summary.natural_topic_count ? 1 : 0}
              max={summary.natural_topic_count}
              disabled={summary.natural_topic_count < 2}
              onCommit={changeCount}
            />
          </label>
          <input
            type="range"
            aria-label="Number of topics slider"
            className="w-full accent-primary"
            min={1}
            max={Math.max(1, summary.natural_topic_count)}
            value={sliderValue ?? count}
            disabled={summary.natural_topic_count < 2}
            onChange={(event) => {
              setSliderValue(Number(event.target.value));
            }}
            onPointerUp={(event) => {
              changeCount(Number(event.currentTarget.value));
              setSliderValue(null);
            }}
            onKeyUp={(event) => {
              changeCount(Number(event.currentTarget.value));
              setSliderValue(null);
            }}
          />
        </div>
        <label className="space-y-1">
          <span>Top topics per document</span>
          <AnalysisNumberInput
            aria-label="Top topics per document"
            value={topN}
            min={count ? 1 : 0}
            max={count}
            disabled={count < 2}
            onCommit={(value) => {
              setTopN(value);
              if (isSaved)
                onSettings({
                  topic_projection: { analysis: modelId, topic_count: count, top_n: value },
                });
            }}
          />
        </label>
        <label className="space-y-1">
          <span>Words per topic</span>
          <AnalysisNumberInput
            aria-label="Words per topic"
            value={wordLimit}
            min={3}
            max={100}
            onCommit={(value) => {
              onSettings({ topic_word_limit: value });
            }}
          />
        </label>
      </div>
      <StopwordControl
        base={base}
        nodes={nodes}
        selected={stopwordSource}
        enabled={stopwordsEnabled}
        disabled={editing}
        controller={stopwords}
        onSelect={selectStopwords}
        onEnabledChange={(enabled) => {
          onSettings({ stopwords_enabled: enabled });
        }}
      />
      {unresolved && (
        <div role="status" className="flex flex-wrap items-center gap-2 text-description">
          <span>
            {outdated
              ? 'This Preview is outdated. Click Preview to fit a fresh sample.'
              : failed
                ? 'Could not refresh the projection. The displayed chart is outdated.'
                : 'Updating projection…'}
          </span>
          {failed && (
            <Button
              variant="outline"
              onClick={() => {
                void map.refetch();
                void words.refetch();
              }}
            >
              Retry
            </Button>
          )}
        </div>
      )}
      {applied.basis.topics.length === 0 ? (
        <p>
          No topics were found. The model may have insufficient usable text or all segments may be
          outliers.
        </p>
      ) : (
        <>
          <div
            ref={frame}
            className="relative h-[440px] min-h-[300px] overflow-hidden rounded-md border border-surface-border"
          >
            <TopicModelingFlowChart
              bubbles={bubbles}
              corpusPresentation={corpusPresentation}
              projectionKey={`${modelId}-${String(applied.count)}`}
              lassoMode={lassoMode}
              lassoFilterActive={lasso.size > 0}
              onToggleLassoMode={() => {
                setLassoMode((old) => !old);
              }}
              onClearLassoFilter={() => {
                setLasso(new Set());
              }}
              onAddLassoTopics={(ids) => {
                setLasso((old) => new Set([...old, ...ids]));
              }}
              onViewReady={() => undefined}
              onToggleTopicSelection={toggle}
            />
          </div>
          <TopicSelectionPanel
            canPublish={isSaved}
            onInspect={setInspectedTopic}
            inspectionDisabled={unresolved}
            topics={topics}
            selectedTopicIds={selection}
            onToggleTopicSelection={toggle}
            onClearSelection={() => {
              setSelection(new Set());
            }}
            topicSearchQuery={search}
            onTopicSearchQueryChange={setSearch}
            lassoTopicIds={lasso}
            corpusPresentation={corpusPresentation}
            hoveredTopicId={hover}
            onHoveredTopicChange={setHover}
          />
        </>
      )}
      {inspectedTopic !== null && (
        <TopicDocuments
          key={`${modelId}-${String(applied.count)}-${String(topN)}`}
          base={base}
          owner={owner}
          summary={summary}
          topic={inspectedTopic}
          count={applied.count}
          topN={topN}
          onClose={() => {
            setInspectedTopic(null);
          }}
        />
      )}
      <DownloadDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        title="Download Topic Modelling"
        description="Includes the displayed map, source counts and model settings. CSV includes every topic and up to 100 filtered representative words."
        formats={CHART_FORMATS}
        defaultFormat="png"
        disabled={unresolved}
        onExport={download.mutateAsync}
      >
        {(pending) => (
          <label className="flex items-center gap-2">
            <Checkbox
              checked={csv}
              disabled={pending}
              onCheckedChange={(value) => {
                setCsv(value === true);
              }}
            />
            Include representative words (CSV ZIP)
          </label>
        )}
      </DownloadDialog>
      {publication && isSaved && (
        <TopicPublishDialog
          base={base}
          id={owner.analysis}
          summary={summary}
          initial={publication}
          onClose={() => {
            setPublication(null);
          }}
        />
      )}
    </section>
  );
}
