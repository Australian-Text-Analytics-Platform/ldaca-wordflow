import { type ReactNode, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { queryTopicSegments, type TopicModelingTopic, type TopicSegmentItem } from '@/api';
import { ErrorNotice } from '@/components/errors/ErrorNotice';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { TopicDocumentDialog } from './TopicDocumentDialog';
import {
  splitTopicWords,
  typicalityBand,
  typicalityLabel,
  type TypicalityBand,
} from './topicExamplesModel';
import type { TopicColorScheme } from './topicModelingGraph';

export interface TopicExamplesContext {
  workspaceId: string;
  analysisId: string;
  clusterCount: number;
  /** Data Block names, in the run's order (two for a comparison run). */
  nodeNames: string[];
  /** Each Data Block's colour, as in the chart, for its name on the cards. */
  corpusColors?: string[];
  colorScheme: TopicColorScheme | null;
}

interface TopicExamplesPaneProps extends TopicExamplesContext {
  topic: TopicModelingTopic | null;
  /** The shown bubble's base colour, without its transparency, for the Topic's words. */
  wordColor?: string;
  /** The shown Topic is hidden from the chart and list by the search or lasso. */
  filteredOut: boolean;
  onClose: () => void;
  onClearFilters: () => void;
}

const PAGE_SIZE = 5;
const ALL = '__all__';
const NO_LABEL = '__none__';

const BAND_CLASS: Record<TypicalityBand, string> = {
  high: 'border-[var(--vscode-charts-green)] bg-[color-mix(in_srgb,var(--vscode-charts-green)_15%,transparent)] text-foreground',
  middle:
    'border-[var(--vscode-charts-yellow)] bg-[color-mix(in_srgb,var(--vscode-charts-yellow)_15%,transparent)] text-foreground',
  low: 'border-surface-border bg-panel text-description',
};

/** One example segment with the Topic's words picked out (issue 353). */
function SegmentCard({
  item,
  words,
  wordColor,
  label,
  onOpen,
}: {
  item: TopicSegmentItem;
  words: readonly string[];
  wordColor?: string;
  label: ReactNode;
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="rounded-lg border border-surface-border bg-surface p-2.5">
      <p
        className={cn('whitespace-pre-wrap text-body text-foreground', !expanded && 'line-clamp-3')}
      >
        {splitTopicWords(item.text, words).map((piece, index) =>
          piece.word ? (
            <strong
              key={index}
              className={cn('font-semibold', !wordColor && 'text-chart-4')}
              style={wordColor ? { color: wordColor } : undefined}
            >
              {piece.text}
            </strong>
          ) : (
            <span key={index}>{piece.text}</span>
          ),
        )}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-label-secondary text-description">
        <span className="min-w-0 truncate">{label}</span>
        {item.typicality !== null && item.typicality !== undefined ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  'rounded-sm border px-1.5 py-0.5 tabular-nums',
                  BAND_CLASS[typicalityBand(item.typicality)],
                )}
              >
                {typicalityLabel(item.typicality)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              How typical of this topic: similarity to its centre{' '}
              {item.similarity?.toFixed(2) ?? '—'}
            </TooltipContent>
          </Tooltip>
        ) : null}
        <span className="ml-auto flex items-center gap-3">
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => {
              setExpanded((value) => !value);
            }}
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
          <button type="button" className="text-link hover:underline" onClick={onOpen}>
            Open document
          </button>
        </span>
      </div>
    </li>
  );
}

/**
 * The right two thirds of the Topic results (issue 353): one shown Topic's
 * example segments, most typical or random, one per document by default,
 * with a Top N% badge and the full document on request.
 */
export function TopicExamplesPane({
  workspaceId,
  analysisId,
  clusterCount,
  nodeNames,
  corpusColors = [],
  colorScheme,
  topic,
  wordColor,
  filteredOut,
  onClose,
  onClearFilters,
}: TopicExamplesPaneProps) {
  const [order, setOrder] = useState<'typical' | 'random'>('typical');
  const [onePerDocument, setOnePerDocument] = useState(true);
  const [group, setGroup] = useState<string>(ALL);
  const [corpus, setCorpus] = useState<string>(ALL);
  const [labelColumn, setLabelColumn] = useState<string>(NO_LABEL);
  const topicId = topic?.id ?? null;
  // The page and the open document belong to one Topic; the order and
  // filters carry over when another Topic is shown.
  const [pageState, setPageState] = useState({ topicId, page: 1 });
  const page = pageState.topicId === topicId ? pageState.page : 1;
  const setPage = (next: number | ((current: number) => number)) => {
    setPageState({ topicId, page: typeof next === 'function' ? next(page) : next });
  };
  const [documentState, setDocumentState] = useState<{
    topicId: number | null;
    item: TopicSegmentItem | null;
  }>({ topicId, item: null });
  const openDocument = documentState.topicId === topicId ? documentState.item : null;
  const setOpenDocument = (item: TopicSegmentItem | null) => {
    setDocumentState({ topicId, item });
  };
  const groupColumn = colorScheme && group !== ALL ? colorScheme.column : null;

  const segmentsQuery = useQuery({
    queryKey: [
      'workspaces',
      workspaceId,
      'analyses',
      analysisId,
      'topic-segments',
      clusterCount,
      topicId,
      order,
      onePerDocument,
      groupColumn,
      group,
      corpus,
      page,
    ],
    enabled: topicId !== null,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const { data } = await queryTopicSegments({
        path: { workspace_id: workspaceId, analysis_id: analysisId },
        body: {
          cluster_count: clusterCount,
          topic_id: topicId ?? 0,
          order,
          one_per_document: onePerDocument,
          corpus_index: corpus === ALL ? null : Number(corpus),
          group_column: groupColumn,
          group_value: groupColumn ? group : null,
          page,
          page_size: PAGE_SIZE,
        },
        signal,
        throwOnError: true,
      });
      return data;
    },
  });

  if (topic === null) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-surface-border p-6 text-center text-body text-description">
        Click the eye on a topic, or right-click a bubble, to see example texts for that topic.
      </div>
    );
  }

  const data = segmentsQuery.data;
  const words = topic.representative_words.map((term) => term.word);
  const pageCount = data ? Math.max(1, Math.ceil(data.matching_count / PAGE_SIZE)) : 1;
  const resetPage = () => {
    setPage(1);
  };
  // Each card names its Data Block, in the Data Block's colour as in the
  // chart, then the row or the chosen Label column's value; an empty value
  // says so (Chao, 2026-10-08).
  const itemLabel = (item: TopicSegmentItem): ReactNode => {
    const blockName = nodeNames[item.corpus_index] ?? 'Data Block';
    let detail: ReactNode = `row ${String(item.row_index + 1)}`;
    if (labelColumn !== NO_LABEL) {
      const value = item.metadata[labelColumn];
      if (value) detail = value;
      else detail = <span className="italic">(no {labelColumn})</span>;
    }
    return (
      <>
        <span className="font-medium" style={{ color: corpusColors[item.corpus_index] }}>
          {blockName}
        </span>
        , {detail}
      </>
    );
  };

  return (
    <section
      aria-label={`Examples of Topic ${String(topic.id)}`}
      className="flex h-full min-h-[28rem] flex-col gap-2 rounded-lg border border-surface-border bg-panel/40 p-3 @min-[700px]:min-h-0"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="text-body font-medium text-foreground">Topic {topic.id} examples</h4>
        {data ? (
          <span className="text-label-secondary text-description">
            {data.segment_count.toLocaleString()} segments in {data.document_count.toLocaleString()}{' '}
            documents
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          aria-label="Stop showing examples"
          title="Stop showing examples"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      {filteredOut ? (
        <p className="flex flex-wrap items-center gap-2 text-label-secondary text-description">
          Topic {topic.id} is hidden by the current search or lasso.
          <button type="button" className="text-link hover:underline" onClick={onClearFilters}>
            Clear filters
          </button>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-label-secondary">
        <div role="radiogroup" aria-label="Examples order" className="flex rounded-md border">
          {(['typical', 'random'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={order === value}
              className={cn(
                'px-2 py-1 first:rounded-l-md last:rounded-r-md',
                order === value ? 'bg-list-active text-foreground' : 'text-description',
              )}
              onClick={() => {
                setOrder(value);
                resetPage();
              }}
            >
              {value === 'typical' ? 'Most typical' : 'Random'}
            </button>
          ))}
        </div>
        <Label className="flex items-center gap-1.5 font-normal">
          <Checkbox
            checked={onePerDocument}
            onCheckedChange={(checked) => {
              setOnePerDocument(checked === true);
              resetPage();
            }}
          />
          One per document
        </Label>
        {colorScheme ? (
          <Select
            value={group}
            onValueChange={(value) => {
              setGroup(value);
              resetPage();
            }}
          >
            <SelectTrigger
              aria-label={`Filter by ${colorScheme.column}`}
              className="h-7 w-auto max-w-56"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All {colorScheme.column}</SelectItem>
              {colorScheme.groups.map((option) => (
                <SelectItem key={option.label} value={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {nodeNames.length > 1 ? (
          <Select
            value={corpus}
            onValueChange={(value) => {
              setCorpus(value);
              resetPage();
            }}
          >
            <SelectTrigger aria-label="Filter by Data Block" className="h-7 w-auto max-w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Both Data Blocks</SelectItem>
              {nodeNames.map((name, index) => (
                <SelectItem key={name} value={String(index)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {data && data.metadata_columns.length > 0 ? (
          <Select value={labelColumn} onValueChange={setLabelColumn}>
            <SelectTrigger aria-label="Label each example by" className="h-7 w-auto max-w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LABEL}>Label: row</SelectItem>
              {data.metadata_columns.map((column) => (
                <SelectItem key={column} value={column}>
                  Label: {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {data && !data.has_similarity && order === 'typical' ? (
        <p className="text-label-secondary text-description">
          This run is from before Wordflow 0.7.11, so examples are not ranked by how typical they
          are. Run Topic Modelling again to rank them.
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {segmentsQuery.isError ? (
          <ErrorNotice error={segmentsQuery.error} fallback="Couldn't load the examples." />
        ) : data ? (
          data.items.length > 0 ? (
            <ul className="space-y-2" aria-busy={segmentsQuery.isFetching}>
              {data.items.map((item) => (
                <SegmentCard
                  key={item.segment_index}
                  item={item}
                  words={words}
                  wordColor={wordColor}
                  label={itemLabel(item)}
                  onOpen={() => {
                    setOpenDocument(item);
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-label-secondary text-description italic">
              No examples match these filters.
            </p>
          )
        ) : (
          <p className="py-4 text-center text-label-secondary text-description" aria-live="polite">
            Loading examples…
          </p>
        )}
      </div>
      {data && data.matching_count > PAGE_SIZE ? (
        <div className="flex items-center justify-end gap-2 text-label-secondary text-description">
          <span className="tabular-nums">
            {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–
            {Math.min(page * PAGE_SIZE, data.matching_count).toLocaleString()} of{' '}
            {data.matching_count.toLocaleString()}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            aria-label="Previous examples"
            disabled={page <= 1}
            onClick={() => {
              setPage((value) => Math.max(1, value - 1));
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            aria-label="More examples"
            disabled={page >= pageCount}
            onClick={() => {
              setPage((value) => Math.min(pageCount, value + 1));
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
      {openDocument ? (
        <TopicDocumentDialog
          workspaceId={workspaceId}
          analysisId={analysisId}
          clusterCount={clusterCount}
          topicId={topic.id}
          documentIndex={openDocument.document_index}
          startAt={openDocument.start}
          topicWords={words}
          topicColor={wordColor}
          onClose={() => {
            setOpenDocument(null);
          }}
        />
      ) : null}
    </section>
  );
}
