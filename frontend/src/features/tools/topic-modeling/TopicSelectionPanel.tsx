import type { TopicModelingTopic } from './topicPresentation';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { matchChecklistOption } from './topicSearch';
import { topicRepresentativeText } from './topicPresentation';
import { TopicSizeComposition, type TopicCorpusPresentation } from './TopicSizeComposition';

interface Props {
  canPublish: boolean;
  onInspect?: (id: number) => void;
  inspectionDisabled?: boolean;
  topics: TopicModelingTopic[];
  selectedTopicIds: Set<number>;
  onToggleTopicSelection: (id: number) => void;
  onClearSelection: () => void;
  topicSearchQuery: string;
  onTopicSearchQueryChange: (query: string) => void;
  lassoTopicIds: Set<number>;
  corpusPresentation: TopicCorpusPresentation;
  hoveredTopicId: number | null;
  onHoveredTopicChange: (topicId: number | null) => void;
}

/**
 * Renders selected and available topic lists beneath the bubble chart.
 * Rendered by: TopicResults, which shares list hover,
 * selection, search, and lasso-filter state with the chart.
 * Flow: sort by size, intersect lasso and search filters, then project list hover
 * into bubble emphasis while keeping bubble hover local to the graph node.
 */
export function TopicSelectionPanel({
  topics,
  canPublish,
  onInspect,
  inspectionDisabled,
  selectedTopicIds,
  onToggleTopicSelection,
  onClearSelection,
  topicSearchQuery,
  onTopicSearchQueryChange,
  lassoTopicIds,
  corpusPresentation,
  hoveredTopicId,
  onHoveredTopicChange,
}: Props) {
  const sortedTopics = topics.toSorted((a, b) => b.total_size - a.total_size);
  const hasLassoFilter = lassoTopicIds.size > 0;

  const filteredTopics = sortedTopics.filter((topic) => {
    if (hasLassoFilter && !lassoTopicIds.has(topic.id)) return false;
    if (topicSearchQuery.trim()) {
      return matchChecklistOption(topicRepresentativeText(topic), topicSearchQuery);
    }
    return true;
  });

  const selectedTopics = sortedTopics.filter((t) => selectedTopicIds.has(t.id));

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4">
      {/* Left column: selected topics */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-body font-medium text-foreground">
            Selected Topics ({selectedTopics.length})
          </h4>
          {selectedTopics.length > 0 && (
            <button
              type="button"
              onClick={onClearSelection}
              className="text-label-secondary text-description hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
        {selectedTopics.length === 0 ? (
          <p className="text-label-secondary text-description italic">
            {canPublish
              ? 'Select topics to include their documents when publishing and prioritize them in downloads.'
              : 'Select topics to highlight them and prioritize them in downloads. Run on all data to publish annotated Tables.'}
          </p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {selectedTopics.map((topic) => {
              const isHovered = hoveredTopicId === topic.id;
              return (
                <div
                  key={topic.id}
                  className={`flex items-center justify-between rounded-lg border border-surface-border p-2 transition-colors ${isHovered ? 'bg-list-hover' : 'bg-panel/50'}`}
                  onMouseEnter={() => {
                    onHoveredTopicChange(topic.id);
                  }}
                  onMouseLeave={() => {
                    onHoveredTopicChange(null);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-body font-medium text-foreground">Topic {topic.id}</span>
                    <div
                      className="truncate text-label-secondary text-description"
                      title={topicRepresentativeText(topic)}
                    >
                      {topicRepresentativeText(topic)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ml-2 shrink-0 rounded-sm p-0.5 text-description hover:bg-error/10 hover:text-error"
                    onClick={() => {
                      onToggleTopicSelection(topic.id);
                    }}
                    aria-label={`Remove topic ${String(topic.id)}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right column: all topics (filtered) */}
      <div className="space-y-2">
        <h4 className="text-body font-medium text-foreground">
          All Topics (
          {hasLassoFilter
            ? `${String(filteredTopics.length)} of ${String(topics.length)}`
            : filteredTopics.length}
          )
        </h4>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-description" />
          <input
            type="text"
            value={topicSearchQuery}
            onChange={(e) => {
              onTopicSearchQueryChange(e.target.value);
            }}
            aria-label="Search representative words"
            placeholder="Search representative words…"
            className="h-8 w-full rounded-md border border-input-border bg-editor pl-8 pr-3 text-label-secondary placeholder:text-description focus:border-focus focus:ring-1 focus:ring-focus focus:outline-hidden"
          />
        </div>
        <div className="max-h-70 space-y-1 overflow-y-auto">
          {filteredTopics.map((topic) => {
            const isSelected = selectedTopicIds.has(topic.id);
            const isHovered = hoveredTopicId === topic.id;
            return (
              <div
                key={topic.id}
                className={`rounded-lg border p-2 transition-colors ${
                  isSelected
                    ? 'border-l-[3px] border-l-green-500 border-[var(--vscode-charts-green)] bg-[color-mix(in_srgb,var(--vscode-charts-green)_12%,transparent)]/60'
                    : 'border-surface-border/60 bg-surface'
                } ${isHovered ? (isSelected ? 'bg-[color-mix(in_srgb,var(--vscode-charts-green)_12%,transparent)]/80' : 'bg-list-hover/70') : ''}`}
                onFocus={() => {
                  onHoveredTopicChange(topic.id);
                }}
                onBlur={() => {
                  onHoveredTopicChange(null);
                }}
                onMouseEnter={() => {
                  onHoveredTopicChange(topic.id);
                }}
                onMouseLeave={() => {
                  onHoveredTopicChange(null);
                }}
              >
                <button
                  type="button"
                  className="block w-full cursor-pointer rounded-sm text-left focus-visible:outline-2 focus-visible:outline-focus"
                  aria-pressed={isSelected}
                  onClick={() => {
                    onToggleTopicSelection(topic.id);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-body font-medium text-foreground">Topic {topic.id}</span>
                    <TopicSizeComposition
                      sizes={topic.size}
                      total={topic.total_size}
                      {...corpusPresentation}
                    />
                  </div>
                  <div
                    className="mt-0.5 truncate text-label-secondary text-description"
                    title={topicRepresentativeText(topic)}
                  >
                    {topicRepresentativeText(topic)}
                  </div>
                </button>
                {onInspect && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    disabled={inspectionDisabled}
                    onClick={() => {
                      onInspect(topic.id);
                    }}
                    aria-label={`View documents for topic ${String(topic.id)}`}
                  >
                    View documents
                  </Button>
                )}
              </div>
            );
          })}
          {filteredTopics.length === 0 && (
            <p className="py-4 text-center text-label-secondary text-description italic">
              No topics match the current filters.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
