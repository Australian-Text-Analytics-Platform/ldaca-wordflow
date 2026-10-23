import type { ProgressDetail } from '@/api';
import { ChevronDown, ChevronRight, LoaderCircle, Plus, Search } from 'lucide-react';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type {
  TopicClustering,
  TopicInclusion,
  TopicModelingResponse,
  TopicModelingTopic,
} from '@/api';
import HelpIcon from '@/components/help/HelpIcon';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import { Slider } from '@/components/ui/slider';
import { AnalysisCardLayout } from '@/features/views/common/components/AnalysisCardLayout';
import { AnalysisRunningStateCard } from '@/features/views/common/components/AnalysisRunningStateCard';
import { TopicModelingBubbleChartSection } from '../results/TopicModelingBubbleChartSection';
import type { TopicChartLayout } from '../results/topicChartLayout';
import type { TopicColorScheme } from '../results/topicModelingGraph';
import { TopicModelingStopWordsControl } from '../TopicModelingStopWordsControl';
import type { StopWordListSource } from '@/features/views/common/utils/stopWordListSources';
import { ErrorNotice } from '@/components/errors/ErrorNotice';
import { TopicRemoteGpuNudge, TopicResultNudge, TopicSlowStartNudge } from '../TopicModelingNudges';
import { isUngrouped } from '../../ungrouped';
import { TopicResultSummary } from '../results/TopicResultSummary';

interface Props {
  topicWaitingBanner: {
    status: 'running' | 'queued';
    taskId: string | null;
    message?: string;
  } | null;
  runningTask?: {
    task_id: string;
    state?: string;
    message?: string;
    progress?: number;
    progress_detail?: ProgressDetail | null;
    started_at?: string | null;
  } | null;
  result: TopicModelingResponse | null;
  /** The run's Sampling per Data Block, for the results summary (issue 362). */
  sampleFractions?: (number | null)[] | null;
  /** The run whose example segments the Topic list shows (issue 353). */
  analysisId?: string | null;
  /** A slow run read its text on the processor: suggest a Topic Modelling server. */
  suggestRemoteGpu?: boolean;
  /** A message, or a stored failure whose diagnostic shows under Details. */
  error?: unknown;
  topics: TopicModelingTopic[];
  exportTopics?: TopicModelingTopic[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedTopicIds: Set<number>;
  onToggleTopicSelection: (id: number) => void;
  onClearSelection: () => void;
  topicSearchQuery: string;
  onTopicSearchQueryChange: (query: string) => void;
  /** Display options folded to one summary line, remembered per tab on this device (issue 432). */
  settingsCollapsed?: boolean;
  onSettingsCollapsedChange?: (collapsed: boolean) => void;
  /** Settings beside or below the chart, and its width, remembered like the fold (issue 433). */
  chartLayout?: TopicChartLayout;
  onChartLayoutChange?: (layout: TopicChartLayout) => void;
  panelNodeIds: string[];
  nodeColors: Record<string, string>;
  defaultPalette: string[];
  graphProjectionKey: string;
  onGraphViewReady: (projectionKey: string) => void;
  nodeNames?: string[];
  randomSeed?: number;
  onAddToWorkspace: () => void;
  isAddingToWorkspace: boolean;
  projectionPending: boolean;
  projectionError?: string | null;
  clustering: TopicClustering | null;
  topicInclusion: TopicInclusion | null;
  onClusterCountCommit: (value: number) => void;
  onTopNTopicsCommit: (value: number) => void;
  onProjectionRetry?: () => void;
  projectionControlResetKey?: number;
  wordsPerTopic?: number;
  onWordsPerTopicChange?: (value: number) => void;
  stopWordsEnabled: boolean;
  onStopWordsEnabledChange: (enabled: boolean) => void;
  stopWords: string[];
  stopWordsDetectionTarget: {
    workspaceId: string | null;
    nodeId: string | null;
    column: string | null;
  };
  onStopWordsChange: (words: string[]) => Promise<void>;
  /** Other tabs' saved stop-word lists offered for copying. */
  stopWordListSources?: StopWordListSource[];
  /** "Colour by" metadata colouring; disabled with a reason for two corpora. */
  colorBy?: TopicColorByState;
}

interface TopicColorByState {
  /** Columns with 2 to 8 distinct values in this result's documents. */
  columns: readonly string[];
  /** The columns have been checked; until then the control stays out of view. */
  loaded: boolean;
  /** Why Colour by cannot be used here, when it is not for lack of columns. */
  unavailableReason?: string;
  /** Each column's number of distinct values, shown after its name. */
  valueCounts?: Record<string, number>;
  column: string | null;
  scheme: TopicColorScheme | null;
  pending: boolean;
  error: string | null;
  onColumnChange: (column: string | null) => void;
}

const COLOR_BY_DATA_BLOCK = '__data_block__';

/** A label beside its control, wrapping as a unit, so the settings stay short (issue 432). */
const INLINE_CONTROL =
  'flex flex-wrap items-center gap-x-2 gap-y-1 text-label-secondary text-description';
/**
 * Beside the chart, each control is one row of the settings grid: its label
 * on the left and its value on the right (issue 433).
 */
const COLUMN_CONTROL =
  'col-span-2 grid grid-cols-subgrid items-center gap-y-1 text-label-secondary text-description';
const COLUMN_VALUE = 'flex min-w-0 items-center justify-end gap-2';

/** True while the Display options sit in the column beside the chart (issue 433). */
const SettingsColumnContext = createContext(false);

/** The class for a control's row, and for the part holding its value. */
function useControlClasses() {
  const column = useContext(SettingsColumnContext);
  return {
    column,
    control: column ? COLUMN_CONTROL : INLINE_CONTROL,
    value: column ? COLUMN_VALUE : 'contents',
  };
}

/** A search term dims the other topics in the chart and filters the list (issues 353, 433). */
function FindTopicsInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (query: string) => void;
}) {
  const classes = useControlClasses();
  return (
    <div className={classes.control}>
      {/* In the header row the placeholder says it, so the label is for
          screen readers only (issue 432); beside the chart it is shown. */}
      <label htmlFor="topic-find-input" className={classes.column ? 'font-medium' : 'sr-only'}>
        Search term
      </label>
      <div className={classes.column ? 'relative w-full' : 'relative'}>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-description"
        />
        <input
          id="topic-find-input"
          type="search"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          placeholder={classes.column ? 'Words in topics' : 'Search term…'}
          className={`h-8 ${classes.column ? 'w-full' : 'w-48'} rounded-md border border-input-border bg-editor pr-3 pl-8 text-body placeholder:text-description focus:border-focus focus:ring-1 focus:ring-focus focus:outline-hidden`}
        />
      </div>
    </div>
  );
}

/** Shown when no column qualifies, so Colour by never just disappears (issue 365). */
const NO_COLOR_COLUMN_REASON =
  'No column here has 2 to 8 different values, so bubbles keep the Data Block colour.';

function ColorByControl({ colorBy }: { colorBy: TopicColorByState }) {
  const unavailable =
    colorBy.unavailableReason ??
    (colorBy.columns.length === 0 && !colorBy.error ? NO_COLOR_COLUMN_REASON : undefined);
  const classes = useControlClasses();
  return (
    <div className={classes.control}>
      <div className="flex items-center gap-1.5">
        <span id="topic-color-by-label" className="font-medium">
          Colour by
        </span>
        <HelpIcon
          targetKey="analysis.topic-modeling.color-by"
          label="About Colour by"
          tooltip="Colour bubbles by a column with 2 to 8 values. Solid: concentrated in few values; pale: spread out."
          className="size-5 shrink-0 text-description"
        />
      </div>
      <div className={classes.value}>
        <Select
          value={colorBy.column ?? COLOR_BY_DATA_BLOCK}
          disabled={colorBy.columns.length === 0}
          onValueChange={(value) => {
            colorBy.onColumnChange(value === COLOR_BY_DATA_BLOCK ? null : value);
          }}
        >
          <DisabledReasonTooltip
            reason={unavailable}
            className={classes.column ? 'min-w-0 flex-1' : undefined}
          >
            <SelectTrigger
              aria-labelledby="topic-color-by-label"
              aria-description={unavailable}
              className={`h-8 ${classes.column ? 'w-full' : 'w-44'} text-body`}
            >
              <SelectValue />
            </SelectTrigger>
          </DisabledReasonTooltip>
          <SelectContent>
            <SelectItem value={COLOR_BY_DATA_BLOCK}>Data Block colour</SelectItem>
            {colorBy.columns.map((column) => (
              <SelectItem key={column} value={column}>
                {column}
                {colorBy.valueCounts?.[column] === undefined ? null : (
                  <span className="text-description"> ({colorBy.valueCounts[column]})</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {colorBy.error ? (
        <p role="alert" className="col-span-2 basis-full text-error">
          {colorBy.error}
        </p>
      ) : null}
    </div>
  );
}

/** Pause after the last arrow key before the Topics slider applies (issue 306). */
const KEYBOARD_COMMIT_DELAY_MS = 600;

function ClusterCountControl({
  clustering,
  pending,
  error,
  onCommit,
  onRetry,
  refocusSliderRef,
}: {
  clustering: TopicClustering;
  pending: boolean;
  error?: string | null;
  onCommit: (value: number) => void;
  onRetry?: () => void;
  /**
   * Set when the slider had focus as it applied. Kept by the panel because
   * the control is rebuilt once the new topics arrive (issue 306).
   */
  refocusSliderRef: React.RefObject<boolean>;
}) {
  const applied = clustering.cluster_count;
  const [value, setValue] = useState<number[]>([applied]);
  const [numberDraft, setNumberDraft] = useState(String(applied));
  const activePointerIdRef = useRef<number | null>(null);
  const latestDraftRef = useRef(applied);
  const latestCommitRef = useRef(applied);
  const keyboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sliderBoxRef = useRef<HTMLDivElement>(null);
  const displayedValue = value[0] ?? applied;
  const sliderThumb = () => sliderBoxRef.current?.querySelector<HTMLElement>('[role="slider"]');

  // The slider loses focus while the topics update (the results are inert
  // under the overlay, and the control is rebuilt). Give it back afterwards
  // so further arrow keys keep working (issue 306).
  useEffect(() => {
    if (pending || !refocusSliderRef.current) return;
    refocusSliderRef.current = false;
    sliderThumb()?.focus({ preventScroll: true });
  }, [pending, refocusSliderRef]);

  useEffect(
    () => () => {
      if (keyboardTimerRef.current !== null) clearTimeout(keyboardTimerRef.current);
    },
    [],
  );

  const boundedTopicCount = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(
      clustering.max_cluster_count,
      Math.max(clustering.min_cluster_count, Math.round(parsed)),
    );
  };

  const setTopicCountDraft = (next: number) => {
    latestDraftRef.current = next;
    setValue([next]);
    setNumberDraft(String(next));
  };

  const commitTopicCount = (next: number) => {
    if (keyboardTimerRef.current !== null) {
      clearTimeout(keyboardTimerRef.current);
      keyboardTimerRef.current = null;
    }
    if (next === applied || latestCommitRef.current === next) return;
    latestCommitRef.current = next;
    const thumb = sliderThumb();
    refocusSliderRef.current = Boolean(thumb) && document.activeElement === thumb;
    onCommit(next);
  };

  // Arrow keys apply after a pause, so several presses make one update.
  const scheduleKeyboardCommit = () => {
    if (keyboardTimerRef.current !== null) clearTimeout(keyboardTimerRef.current);
    keyboardTimerRef.current = setTimeout(() => {
      keyboardTimerRef.current = null;
      commitTopicCount(latestDraftRef.current);
    }, KEYBOARD_COMMIT_DELAY_MS);
  };

  const commitNumberDraft = (raw: string) => {
    const next = boundedTopicCount(raw);
    if (next === null) {
      setTopicCountDraft(applied);
      return;
    }
    setTopicCountDraft(next);
    commitTopicCount(next);
  };

  useEffect(() => {
    const handleWindowBlur = () => {
      if (activePointerIdRef.current === null) return;
      activePointerIdRef.current = null;
      latestDraftRef.current = applied;
      setValue([applied]);
      setNumberDraft(String(applied));
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [applied]);

  const rollBackPointerGesture = (pointerId: number) => {
    if (activePointerIdRef.current !== pointerId) return;
    activePointerIdRef.current = null;
    latestDraftRef.current = applied;
    setValue([applied]);
    setNumberDraft(String(applied));
  };

  const classes = useControlClasses();
  // Beside the chart the number sits by its label, so the slider can take
  // the rest of the row (issue 433).
  const numberInput = (
    <input
      id="topic-cluster-count-input"
      aria-label="Number of topics"
      type="number"
      min={clustering.min_cluster_count}
      max={clustering.max_cluster_count}
      step={1}
      value={numberDraft}
      disabled={pending || !clustering.adjustable}
      className="h-8 w-16 shrink-0 rounded-md border border-input-border bg-editor px-2 text-right text-body tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
      onChange={(event) => {
        const raw = event.target.value;
        setNumberDraft(raw);
        if (raw.trim() === '') return;
        const next = boundedTopicCount(raw);
        if (next === null) return;
        latestDraftRef.current = next;
        setValue([next]);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        commitNumberDraft(event.currentTarget.value);
        event.currentTarget.blur();
      }}
      onBlur={(event) => {
        commitNumberDraft(event.currentTarget.value);
      }}
    />
  );
  return (
    <div className={`${classes.control} min-w-0`}>
      <div className="flex items-center gap-3">
        <label htmlFor="topic-cluster-count" className="font-medium">
          Topics
        </label>
        {classes.column ? numberInput : null}
      </div>
      <div
        className={classes.column ? `${COLUMN_VALUE} w-full` : 'flex min-w-0 items-center gap-3'}
      >
        <div
          ref={sliderBoxRef}
          className={classes.column ? 'relative min-w-0 flex-1' : 'relative w-32'}
        >
          {clustering.adjustable ? (
            <Slider
              id="topic-cluster-count"
              data-testid="topic-cluster-slider"
              aria-label="Number of topics"
              min={clustering.min_cluster_count}
              max={clustering.max_cluster_count}
              step={1}
              value={value}
              disabled={pending}
              onPointerDown={(event) => {
                if (pending) return;
                activePointerIdRef.current = event.pointerId;
                latestDraftRef.current = displayedValue;
              }}
              onPointerUp={(event) => {
                if (activePointerIdRef.current !== event.pointerId) return;
                activePointerIdRef.current = null;
                commitTopicCount(latestDraftRef.current);
              }}
              onPointerCancel={(event) => {
                rollBackPointerGesture(event.pointerId);
              }}
              onLostPointerCapture={(event) => {
                rollBackPointerGesture(event.pointerId);
              }}
              onValueChange={(nextValue) => {
                const next = nextValue[0] ?? applied;
                setTopicCountDraft(next);
                if (activePointerIdRef.current === null) scheduleKeyboardCommit();
              }}
            />
          ) : (
            <input
              id="topic-cluster-count"
              aria-label="Number of topics"
              type="range"
              min={clustering.cluster_count}
              max={clustering.cluster_count}
              value={clustering.cluster_count}
              disabled
              readOnly
              className="h-4 w-full accent-primary disabled:opacity-50"
            />
          )}
          {/* The range in small type under the bar's ends, so a long maximum
              doesn't take the bar's width (Chao, 2026-10-24). */}
          <div className="pointer-events-none absolute inset-x-0 top-full mt-0.5 flex justify-between text-badge leading-none text-description tabular-nums">
            <span aria-label="Minimum number of topics">{clustering.min_cluster_count}</span>
            <span aria-label="Maximum number of topics">{clustering.max_cluster_count}</span>
          </div>
        </div>
        {classes.column ? null : numberInput}
      </div>
      {error ? (
        <span className="col-span-2 flex basis-full items-center gap-2 whitespace-pre-wrap wrap-break-word text-error">
          {error}
          {onRetry ? (
            <button type="button" className="underline" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function WordsPerTopicControl({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState({ source: value, value: String(value) });
  const displayed = draft.source === value ? draft.value : String(value);
  const classes = useControlClasses();
  return (
    <label htmlFor="topic-words-per-topic" className={classes.control}>
      <span className="font-medium">Words per topic</span>
      <span className={classes.value}>
        <input
          id="topic-words-per-topic"
          aria-label="Words per topic"
          type="number"
          min={3}
          max={100}
          value={displayed}
          className="h-8 w-16 rounded-md border border-input-border bg-editor px-2 text-right text-body tabular-nums"
          onChange={(event) => {
            setDraft({ source: value, value: event.target.value });
          }}
          onBlur={(event) => {
            const raw = Number(event.currentTarget.value);
            const next = Math.min(100, Math.max(3, Number.isFinite(raw) ? Math.round(raw) : 15));
            setDraft({ source: next, value: String(next) });
            onCommit(next);
          }}
        />
      </span>
    </label>
  );
}

function TopNTopicsControl({
  inclusion,
  pending,
  onCommit,
}: {
  inclusion: TopicInclusion;
  pending: boolean;
  onCommit: (value: number) => void;
}) {
  const applied = inclusion.top_n_topics;
  const [draft, setDraft] = useState({
    source: applied,
    value: String(applied),
  });
  const latestCommitRef = useRef(applied);
  const displayed = draft.source === applied ? draft.value : String(applied);

  useEffect(() => {
    latestCommitRef.current = applied;
  }, [applied]);

  const commit = (rawValue: string) => {
    if (rawValue.trim() === '') {
      setDraft({ source: applied, value: String(applied) });
      return;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      setDraft({ source: applied, value: String(applied) });
      return;
    }
    const next = Math.min(
      inclusion.max_top_n_topics,
      Math.max(inclusion.min_top_n_topics, Math.round(parsed)),
    );
    setDraft({ source: next, value: String(next) });
    if (next === applied || latestCommitRef.current === next) return;
    latestCommitRef.current = next;
    onCommit(next);
  };

  const classes = useControlClasses();
  return (
    <div className={classes.control}>
      <div className="flex items-center gap-1.5">
        <label htmlFor="topic-top-n" className="font-medium">
          Topics per document
        </label>
        <HelpIcon
          targetKey="analysis.topic-modeling.top-topics-per-row"
          label="About Top topics per document"
          tooltip="Top topics per document: each row counts toward this many bubbles. Cutoff ties can include more than this number."
          className="size-5 shrink-0 text-description"
        />
      </div>
      <span className={classes.value}>
        <input
          id="topic-top-n"
          aria-label="Top topics per document"
          type="number"
          min={inclusion.min_top_n_topics}
          max={inclusion.max_top_n_topics}
          step={1}
          value={displayed}
          disabled={pending || !inclusion.adjustable}
          className="h-8 w-16 rounded-md border border-input-border bg-editor px-2 text-right text-body tabular-nums"
          onChange={(event) => {
            setDraft({ source: applied, value: event.target.value });
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            commit(event.currentTarget.value);
            event.currentTarget.blur();
          }}
          onBlur={(event) => {
            commit(event.currentTarget.value);
          }}
        />
      </span>
    </div>
  );
}

/**
 * Maps topic-modeling task state to running, error, or successful result content.
 * Rendered by: TopicModelingFeature whenever a banner, result, or local error exists.
 * Flow: derive the task-state card, render TopicModelingBubbleChartSection for
 * successful results.
 */
export function TopicModelingResultsPanel({
  topicWaitingBanner,
  runningTask,
  error,
  result,
  sampleFractions = null,
  analysisId = null,
  suggestRemoteGpu = false,
  topics,
  exportTopics = topics,
  containerRef,
  selectedTopicIds,
  onToggleTopicSelection,
  onClearSelection,
  topicSearchQuery,
  onTopicSearchQueryChange,
  settingsCollapsed = false,
  onSettingsCollapsedChange,
  chartLayout,
  onChartLayoutChange,
  panelNodeIds,
  nodeColors,
  defaultPalette,
  graphProjectionKey,
  onGraphViewReady,
  nodeNames,
  randomSeed,
  onAddToWorkspace,
  isAddingToWorkspace,
  projectionPending,
  projectionError,
  clustering,
  topicInclusion,
  onClusterCountCommit,
  onTopNTopicsCommit,
  onProjectionRetry,
  projectionControlResetKey = 0,
  wordsPerTopic = 15,
  onWordsPerTopicChange = () => undefined,
  stopWordsEnabled,
  onStopWordsEnabledChange,
  stopWords,
  stopWordsDetectionTarget,
  onStopWordsChange,
  stopWordListSources = [],
  colorBy,
}: Props) {
  const refocusClusterSliderRef = useRef(false);
  const isRunningState = Boolean(topicWaitingBanner);
  const runningMessage =
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty message should fall back to the next source, not render blank
    runningTask?.message || topicWaitingBanner?.message || 'Running';
  const runningProgress = typeof runningTask?.progress === 'number' ? runningTask.progress : null;
  const isErrorState = Boolean(error) && !isRunningState;
  const isSuccessfulState = Boolean(result) && !isRunningState && !isErrorState;

  const cardTone: 'default' | 'error' = isErrorState ? 'error' : 'default';
  const cardTitle = 'Topic Modelling Results';
  const helperConfig = {
    targetKey: 'analysis.topic-modeling.results',
    label: 'Topic modelling results',
    tooltip: 'Shows running progress, failures, and final topic modelling outputs.',
  };
  return (
    <>
      <AnalysisCardLayout
        cardRef={isSuccessfulState ? containerRef : undefined}
        title={cardTitle}
        titleGuidanceTarget={isSuccessfulState ? 'topic-modeling-results' : undefined}
        tone={cardTone}
        help={helperConfig}
      >
        {isRunningState ? (
          <AnalysisRunningStateCard
            message={runningMessage}
            progress={runningProgress}
            startedAt={runningTask?.started_at}
            detail={runningTask?.progress_detail}
            taskId={runningTask?.task_id}
          />
        ) : null}
        {isRunningState ? (
          <TopicSlowStartNudge
            taskId={runningTask?.task_id}
            startedAt={runningTask?.started_at}
            detail={runningTask?.progress_detail}
          />
        ) : null}

        {isErrorState ? <ErrorNotice error={error} /> : null}

        {isSuccessfulState && result && clustering ? (
          <div className="-mt-2 mb-3">
            <TopicResultSummary
              corpusSizes={result.data.corpus_sizes}
              segmentCount={result.data.segment_count}
              ungroupedDocuments={result.data.ungrouped_documents}
              clusterCount={clustering.cluster_count}
              defaultClusterCount={clustering.default_cluster_count}
              clusteredSegments={clustering.clustered_segments}
              sampleFractions={sampleFractions}
              nodeNames={nodeNames ?? []}
            />
          </div>
        ) : null}
        {isSuccessfulState ? (
          <div className="relative" aria-busy={projectionPending}>
            <div
              data-testid="topic-modeling-result-content"
              aria-hidden={projectionPending || undefined}
              inert={projectionPending ? true : undefined}
              className={
                projectionPending
                  ? 'pointer-events-none select-none opacity-40 grayscale'
                  : undefined
              }
            >
              <div className="space-y-4">
                <TopicResultNudge result={result} clustering={clustering} analysisId={analysisId} />
                <TopicRemoteGpuNudge show={suggestRemoteGpu} analysisId={analysisId} />
                <TopicModelingBubbleChartSection
                  topics={topics}
                  exportTopics={exportTopics}
                  selectedTopicIds={selectedTopicIds}
                  onToggleTopicSelection={onToggleTopicSelection}
                  onClearSelection={onClearSelection}
                  topicSearchQuery={topicSearchQuery}
                  onTopicSearchQueryChange={onTopicSearchQueryChange}
                  corpusSizes={result?.data.corpus_sizes ?? []}
                  panelNodeIds={panelNodeIds}
                  nodeColors={nodeColors}
                  defaultPalette={defaultPalette}
                  projectionKey={graphProjectionKey}
                  onViewReady={onGraphViewReady}
                  nodeNames={nodeNames}
                  clusterCount={clustering?.cluster_count}
                  topNTopics={topicInclusion?.top_n_topics}
                  exportDisabled={projectionPending}
                  randomSeed={randomSeed}
                  colorScheme={colorBy?.scheme ?? null}
                  workspaceId={stopWordsDetectionTarget.workspaceId ?? undefined}
                  analysisId={analysisId ?? undefined}
                  chartLayout={chartLayout}
                  onChartLayoutChange={onChartLayoutChange}
                  controlRowSlot={({ beside, placementToggle }) => {
                    const foldButton = (
                      <button
                        type="button"
                        id="topic-result-settings-heading"
                        aria-expanded={!settingsCollapsed}
                        aria-controls="topic-result-settings-controls"
                        onClick={() => onSettingsCollapsedChange?.(!settingsCollapsed)}
                        className="-ml-1 flex shrink-0 items-center gap-1 rounded-sm px-1 text-body font-medium whitespace-nowrap text-foreground hover:bg-hover focus-visible:ring-1 focus-visible:ring-focus focus-visible:outline-hidden"
                      >
                        {settingsCollapsed ? (
                          <ChevronRight className="size-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="size-4" aria-hidden="true" />
                        )}
                        Display options
                      </button>
                    );
                    const topicCount = (
                      <span className="rounded-full border bg-editor px-2 py-0.5 text-label-secondary whitespace-nowrap tabular-nums text-description">
                        Topics ({topics.filter((topic) => !isUngrouped(topic.id)).length})
                      </span>
                    );
                    const summary = settingsCollapsed ? (
                      <span
                        data-testid="topic-result-settings-summary"
                        className={
                          beside
                            ? 'block text-label-secondary text-description'
                            : 'min-w-0 truncate text-label-secondary text-description'
                        }
                      >
                        {[
                          topicInclusion
                            ? `${String(topicInclusion.top_n_topics)} topics per document`
                            : null,
                          `${String(wordsPerTopic)} words per topic`,
                          colorBy?.loaded ? `Colour: ${colorBy.column ?? 'Data Block'}` : null,
                          stopWordsEnabled ? 'Stop words on' : 'Stop words off',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    ) : null;
                    const findTopics = (
                      <FindTopicsInput
                        value={topicSearchQuery}
                        onChange={onTopicSearchQueryChange}
                      />
                    );
                    const addToProject = (
                      <DisabledReasonTooltip
                        reason={
                          isAddingToWorkspace
                            ? 'A Data Block is being added to the Project'
                            : (clustering?.cluster_count ?? 0) === 0
                              ? 'No Topics were discovered'
                              : undefined
                        }
                      >
                        <Button
                          data-guidance="topic-modeling-add-to-workspace"
                          size="sm"
                          onClick={onAddToWorkspace}
                          disabled={
                            isAddingToWorkspace ||
                            projectionPending ||
                            (clustering?.cluster_count ?? 0) === 0
                          }
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Add to Project
                        </Button>
                      </DisabledReasonTooltip>
                    );
                    const stopWordsControl = (
                      <TopicModelingStopWordsControl
                        enabled={stopWordsEnabled}
                        onEnabledChange={onStopWordsEnabledChange}
                        savedWords={stopWords}
                        workspaceId={stopWordsDetectionTarget.workspaceId}
                        nodeId={stopWordsDetectionTarget.nodeId}
                        column={stopWordsDetectionTarget.column}
                        onSavedWordsChange={onStopWordsChange}
                        sources={stopWordListSources}
                        fill={beside}
                      />
                    );
                    const controls = (
                      <>
                        {clustering ? (
                          <ClusterCountControl
                            key={`clusters:${String(clustering.cluster_count)}:${String(projectionControlResetKey)}`}
                            clustering={clustering}
                            pending={projectionPending}
                            error={projectionError}
                            onCommit={onClusterCountCommit}
                            onRetry={onProjectionRetry}
                            refocusSliderRef={refocusClusterSliderRef}
                          />
                        ) : null}
                        {topicInclusion ? (
                          <TopNTopicsControl
                            key={`top-n:${String(topicInclusion.top_n_topics)}:${String(projectionControlResetKey)}`}
                            inclusion={topicInclusion}
                            pending={projectionPending}
                            onCommit={onTopNTopicsCommit}
                          />
                        ) : null}
                        <WordsPerTopicControl
                          value={wordsPerTopic}
                          onCommit={onWordsPerTopicChange}
                        />
                        {colorBy?.loaded ? <ColorByControl colorBy={colorBy} /> : null}
                        {beside ? (
                          <div className={COLUMN_CONTROL}>
                            <span className="font-medium">Stop words</span>
                            <div className={COLUMN_VALUE}>{stopWordsControl}</div>
                          </div>
                        ) : (
                          stopWordsControl
                        )}
                      </>
                    );
                    return (
                      <SettingsColumnContext.Provider value={beside}>
                        <section
                          aria-labelledby="topic-result-settings-heading"
                          className="w-full rounded-lg border border-surface-border/70 bg-panel/20 px-3 py-2"
                        >
                          {beside ? (
                            <>
                              {/* Beside the chart: one setting per row, labels left and
                                  values right, the search term last, and Add to Project
                                  at the bottom because it isn't a setting (issue 433). */}
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                {/* No Topics chip here: the Topics row shows the number. */}
                                {foldButton}
                                <div className="ml-auto">{placementToggle}</div>
                              </div>
                              {summary ? <div className="mt-1">{summary}</div> : null}
                              <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
                                {settingsCollapsed ? null : (
                                  <div id="topic-result-settings-controls" className="contents">
                                    {controls}
                                  </div>
                                )}
                                {findTopics}
                              </div>
                              <div className="mt-3 border-t border-surface-border/70 pt-2">
                                {addToProject}
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Below the chart: one header row (fold toggle, count, summary
                                  when folded, search term, Add to Project), the settings
                                  wrapping below it (issues 152, 432). */}
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                {foldButton}
                                {topicCount}
                                {summary}
                                <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
                                  {findTopics}
                                  {addToProject}
                                </div>
                                {placementToggle}
                              </div>
                              {settingsCollapsed ? null : (
                                <div
                                  id="topic-result-settings-controls"
                                  className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2"
                                >
                                  {controls}
                                </div>
                              )}
                            </>
                          )}
                        </section>
                      </SettingsColumnContext.Provider>
                    );
                  }}
                />
              </div>
            </div>
            {projectionPending ? (
              <div
                role="status"
                aria-live="polite"
                className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-panel/45"
              >
                <div className="flex items-center gap-2 rounded-md border bg-editor px-4 py-3 text-body font-medium">
                  <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                  Updating topics…
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </AnalysisCardLayout>
    </>
  );
}
