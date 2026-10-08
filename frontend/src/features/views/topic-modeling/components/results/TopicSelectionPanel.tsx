import { cn } from '@/lib/utils';
import { ResultFrame } from '@/features/views/common/components/ResultFrame';
import type { TopicModelingTopic } from '@/api';
import { Eye } from 'lucide-react';
import { matchChecklistOption } from '@/features/views/common/checklistSearch';
import { matchedTopicWords, matchTopicWords } from '../../topicModelingAdapters';
import { TopicWordsLine } from './TopicWords';
import { TopicSizeComposition, type TopicCorpusPresentation } from './TopicSizeComposition';
import { TopicExamplesPane, type TopicExamplesContext } from './TopicExamplesPane';

interface Props {
  topics: TopicModelingTopic[];
  selectedTopicIds: Set<number>;
  onToggleTopicSelection: (id: number) => void;
  onClearSelection: () => void;
  topicSearchQuery: string;
  lassoTopicIds: Set<number>;
  corpusPresentation: TopicCorpusPresentation;
  hoveredTopicId: number | null;
  onHoveredTopicChange: (topicId: number | null) => void;
  /** The Topic whose examples are shown on the right (issue 353). */
  shownTopicId: number | null;
  /** The shown bubble's base colour, used for its words in the examples. */
  shownTopicColor?: string;
  onToggleShownTopic: (id: number) => void;
  onClearFilters: () => void;
  /** Omitted when the run cannot list examples, for example in tests of the list alone. */
  examples?: TopicExamplesContext;
}

interface TopicCardProps {
  topic: TopicModelingTopic;
  selected: boolean;
  dimmed: boolean;
  hovered: boolean;
  shown: boolean;
  topicSearchQuery: string;
  corpusPresentation: TopicCorpusPresentation;
  onToggleSelection: () => void;
  onToggleShown: () => void;
  onHoverChange: (hovered: boolean) => void;
}

/**
 * One Topic in the list: a click selects it; the eye strip at its tail shows
 * its examples (issue 353).
 */
function TopicCard({
  topic,
  selected,
  dimmed,
  hovered,
  shown,
  topicSearchQuery,
  corpusPresentation,
  onToggleSelection,
  onToggleShown,
  onHoverChange,
}: TopicCardProps) {
  const words = topic.representative_words.map((term) => term.word);
  const label = `Topic ${String(topic.id)}`;
  return (
    <li
      data-topic-id={topic.id}
      className={cn(
        'flex overflow-hidden rounded-lg border transition-colors',
        selected
          ? 'border-l-[3px] border-[var(--vscode-charts-green)] border-l-green-500 bg-[color-mix(in_srgb,var(--vscode-charts-green)_12%,transparent)]'
          : 'border-surface-border/60 bg-surface',
        hovered && !selected && 'bg-list-hover/70',
        dimmed && 'opacity-50',
      )}
      onMouseEnter={() => {
        onHoverChange(true);
      }}
      onMouseLeave={() => {
        onHoverChange(false);
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={selected ? `Deselect ${label}` : `Select ${label}`}
        className="min-w-0 flex-1 cursor-pointer p-2 focus-visible:outline-1 focus-visible:outline-focus"
        onClick={onToggleSelection}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggleSelection();
          }
        }}
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-body font-medium text-foreground">{label}</span>
          <TopicSizeComposition
            sizes={topic.size}
            total={topic.total_size}
            topicId={topic.id}
            {...corpusPresentation}
          />
        </div>
        <div className="mt-0.5">
          <TopicWordsLine
            words={words}
            matched={matchedTopicWords(words, topicSearchQuery, matchChecklistOption)}
          />
        </div>
      </div>
      <button
        type="button"
        aria-pressed={shown}
        aria-label={shown ? `Stop showing ${label}` : `Show examples of ${label}`}
        title={shown ? 'Stop showing examples' : 'Show examples'}
        className={cn(
          'flex w-8 shrink-0 items-center justify-center border-l border-surface-border/60 transition-colors focus-visible:outline-1 focus-visible:outline-focus',
          shown
            ? 'bg-button text-button-foreground'
            : 'text-description hover:bg-list-hover hover:text-foreground',
        )}
        onClick={onToggleShown}
      >
        <Eye className="size-4" />
      </button>
    </li>
  );
}

/**
 * The Topic list beside the shown Topic's examples (issue 353).
 * Rendered by: TopicModelingBubbleChartSection, which shares list hover,
 * selection, search, lasso, and shown-Topic state with the chart.
 * Flow: one list in two groups that scroll separately. Selected Topics are
 * always listed, dimmed when the search or lasso hides them; Others lists
 * the rest that match. The right two thirds show the shown Topic's examples.
 */
export function TopicSelectionPanel({
  topics,
  selectedTopicIds,
  onToggleTopicSelection,
  onClearSelection,
  topicSearchQuery,
  lassoTopicIds,
  corpusPresentation,
  hoveredTopicId,
  onHoveredTopicChange,
  shownTopicId,
  shownTopicColor,
  onToggleShownTopic,
  onClearFilters,
  examples,
}: Props) {
  const sortedTopics = topics.toSorted((a, b) => b.total_size - a.total_size);
  const hasLassoFilter = lassoTopicIds.size > 0;
  const hasSearch = topicSearchQuery.trim() !== '';
  const matches = (topic: TopicModelingTopic) => {
    if (hasLassoFilter && !lassoTopicIds.has(topic.id)) return false;
    if (!hasSearch) return true;
    return matchTopicWords(
      topic.representative_words.map((term) => term.word),
      topicSearchQuery,
      matchChecklistOption,
    );
  };
  const matchingIds = new Set(sortedTopics.filter(matches).map((topic) => topic.id));
  const filtered = hasLassoFilter || hasSearch;
  const selectedTopics = sortedTopics.filter((topic) => selectedTopicIds.has(topic.id));
  const otherTopics = sortedTopics.filter(
    (topic) => !selectedTopicIds.has(topic.id) && matchingIds.has(topic.id),
  );
  const shownTopic = topics.find((topic) => topic.id === shownTopicId) ?? null;

  const card = (topic: TopicModelingTopic) => (
    <TopicCard
      key={topic.id}
      topic={topic}
      selected={selectedTopicIds.has(topic.id)}
      dimmed={!matchingIds.has(topic.id)}
      hovered={hoveredTopicId === topic.id}
      shown={shownTopicId === topic.id}
      topicSearchQuery={topicSearchQuery}
      corpusPresentation={corpusPresentation}
      onToggleSelection={() => {
        onToggleTopicSelection(topic.id);
      }}
      onToggleShown={() => {
        onToggleShownTopic(topic.id);
      }}
      onHoverChange={(hovered) => {
        onHoveredTopicChange(hovered ? topic.id : null);
      }}
    />
  );

  return (
    <ResultFrame storageKey="topic-modeling.topic-lists" minHeight={420}>
      {(height) => (
        // Side by side from 700px; narrower, the list stacks above the
        // examples and the frame scrolls (issue 353).
        <div
          data-result-frame-scroll=""
          className="@container h-full overflow-y-auto @min-[700px]:overflow-hidden"
        >
          <div
            className={cn(
              'grid grid-cols-1 gap-4 @min-[700px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]',
              height !== null && '@min-[700px]:h-full @min-[700px]:grid-rows-1',
            )}
          >
            <section
              aria-label="Topics"
              className="flex max-h-96 min-h-0 flex-col gap-2 @min-[700px]:max-h-none"
            >
              <h4 className="text-body font-medium text-foreground">
                Topics{' '}
                <span className="tabular-nums text-description">
                  {filtered
                    ? `${String(matchingIds.size)} / ${String(topics.length)}`
                    : String(topics.length)}
                </span>
              </h4>
              {selectedTopics.length > 0 ? (
                <div className="flex max-h-[40%] min-h-0 shrink-0 flex-col gap-1">
                  <div className="flex items-center justify-between text-label-secondary text-description">
                    <span>Selected {selectedTopics.length}</span>
                    <button
                      type="button"
                      onClick={onClearSelection}
                      aria-label="Clear selected topics"
                      className="hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                  <ul aria-label="Selected topics" className="min-h-0 space-y-1 overflow-y-auto">
                    {selectedTopics.map(card)}
                  </ul>
                </div>
              ) : null}
              <div className="flex min-h-0 flex-1 flex-col gap-1">
                {selectedTopics.length > 0 ? (
                  <span className="text-label-secondary text-description">
                    Others {otherTopics.length}
                  </span>
                ) : null}
                <ul
                  aria-label="Other topics"
                  className={cn(
                    'space-y-1 overflow-y-auto',
                    height !== null ? 'min-h-0 flex-1' : 'max-h-80',
                  )}
                >
                  {otherTopics.map(card)}
                </ul>
                {otherTopics.length === 0 ? (
                  <p className="py-4 text-center text-label-secondary text-description italic">
                    {matchingIds.size === 0
                      ? 'No topics match the current filters.'
                      : 'Every matching topic is selected.'}
                  </p>
                ) : null}
              </div>
            </section>
            {examples ? (
              <TopicExamplesPane
                key={`${examples.analysisId}:${String(examples.clusterCount)}`}
                {...examples}
                topic={shownTopic}
                wordColor={shownTopicColor}
                filteredOut={shownTopic !== null && !matchingIds.has(shownTopic.id)}
                onClose={() => {
                  if (shownTopicId !== null) onToggleShownTopic(shownTopicId);
                }}
                onClearFilters={onClearFilters}
              />
            ) : null}
          </div>
        </div>
      )}
    </ResultFrame>
  );
}
