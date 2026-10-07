import { useState, type FocusEvent } from 'react';
import HelpIcon from '@/components/help/HelpIcon';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TopicSegmentationMethod } from '@/api';
import { AnalysisCardLayout } from '@/features/views/common/components/AnalysisCardLayout';
import {
  NodeInputsPanel,
  type NodeInputColumnAddonArgs,
} from '@/features/views/common/components/NodeInputsPanel';
import type { UseTabNodeInputsResult } from '@/features/views/common/nodeInputs';
import { useUIStore } from '@/stores';
import { getDocumentTarget, type DocumentKey } from '@/tutorials/documentationRegistry';
import {
  effectiveSampleDocumentCount,
  sanitizeMaxClusterSize,
  sanitizeMinClusterSize,
  sanitizeSamplePercent,
  sanitizeMaxSegmentTokens,
  type CorpusSample,
} from '../../hooks/useTopicModelingParameters';
import {
  TOPIC_FIRST_RUN_NOTE_TOKENS,
  TOPIC_SAMPLING_SUGGEST_ABOVE,
  sanitizeTopicSampleSize,
  smallestFindableTopic,
} from '../../topicSampling';
import { acceptPlaceholderOnTab } from '@/features/views/common/placeholderTabFill';

interface NumericInputDraft {
  source: number;
  value: string;
}

interface Props {
  nodeInputs: UseTabNodeInputsResult;
  onColumnChange: (nodeId: string, column: string) => void;
  nodeColors?: Record<string, string>;
  onNodeColorChange?: (nodeId: string, color: string) => void;
  defaultPalette?: string[];
  actionState: {
    runDisabled: boolean;
    clearDisabled: boolean;
    runDisabledReason?: string;
    clearDisabledReason?: string;
  };
  corpusSamples: CorpusSample[];
  nodeDocCounts: number[];
  onCorpusSampleChange: (idx: number, update: Partial<CorpusSample>) => void;
  minClusterSize: number;
  onMinClusterSizeChange: (value: number) => void;
  /** Fixed Max topic size in Topic Segments, or `null` for Auto. */
  maxClusterSize: number | null;
  onMaxClusterSizeChange: (value: number | null) => void;
  /** The attached run's segment count and the cap it used, shown beside the field. */
  lastRunClustering: {
    segmentCount: number;
    appliedMaxTopicSize: number | null;
    requestedMaxTopicSize: number | null;
    /** Segments the topics were found from, when topic sampling applied. */
    clusteredSegments: number | null;
    /** The seed the run used, which picked the sampled segments. */
    randomSeed: number;
  } | null;
  /** Topic sampling, off by default. */
  clusterSample: boolean;
  onClusterSampleChange: (value: boolean) => void;
  /** Segments to sample as typed; `null` (empty) runs with the grey suggestion. */
  clusterSampleSize: number | null;
  onClusterSampleSizeChange: (value: number | null) => void;
  /** The grey suggestion shown in the empty Segments to sample field. */
  suggestedSampleSize: number;
  /** Estimated Topic Segments across the selected Data Blocks; `null` while counting. */
  estimatedSegmentCount: number | null;
  /** Estimated model tokens to embed across the selected Data Blocks; `null` while counting. */
  estimatedTokenCount: number | null;
  randomSeed: number;
  randomSeedUserSet: boolean;
  onRandomSeedChange: (value: number) => void;
  segmentationMethod: TopicSegmentationMethod;
  onSegmentationMethodChange: (value: TopicSegmentationMethod) => void;
  maxSegmentTokens: number;
  onMaxSegmentTokensChange: (value: number) => void;
  isRunning: boolean;
  isStopping?: boolean;
  isClearing: boolean;
  onRun: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
  onClear: () => void | Promise<void>;
  hasMissingColumns: boolean;
  parametersLocked: boolean;
}
const INTEGER_INPUT = 'h-8 w-20 px-2 text-right text-body tabular-nums';

const LABEL_TEXT = 'text-label-secondary font-medium text-description';

/** A short visible label with its full explanation in a tooltip and a link to the tutorial section. */
function ParameterLabel({
  htmlFor,
  help,
  helpKey,
  as = 'label',
  children,
}: {
  htmlFor?: string;
  help: string;
  helpKey: DocumentKey<'tutorial'>;
  as?: 'label' | 'legend';
  children: string;
}) {
  const className = `flex items-center gap-1 whitespace-nowrap ${LABEL_TEXT}`;
  // The icon opens the tutorial section; it sits beside the label, not in it,
  // so clicking it never focuses the input instead.
  const helpIcon = (
    <HelpIcon
      targetKey={helpKey}
      label={`About ${children}`}
      tooltip={help}
      className="size-5 shrink-0 text-description"
    />
  );
  return as === 'legend' ? (
    <legend className={className}>
      {children}
      {helpIcon}
    </legend>
  ) : (
    <div className={className}>
      <Label htmlFor={htmlFor} className={LABEL_TEXT}>
        {children}
      </Label>
      {helpIcon}
    </div>
  );
}

/**
 * Renders topic-modeling node inputs, sampling controls, run parameters, and shared actions.
 * Rendered by: TopicModelingFeature, which owns the selected-node and task state supplied here.
 * Flow: keep numeric input drafts editable until blur, clamp committed values,
 * attach per-corpus sampling to NodeInputsPanel, and delegate run/stop/clear actions.
 */
export function TopicModelingParameterPanel({
  nodeInputs,
  onColumnChange,
  nodeColors = {},
  onNodeColorChange,
  defaultPalette = [],
  actionState,
  corpusSamples,
  nodeDocCounts,
  onCorpusSampleChange,
  minClusterSize,
  onMinClusterSizeChange,
  maxClusterSize,
  onMaxClusterSizeChange,
  lastRunClustering,
  clusterSample,
  onClusterSampleChange,
  clusterSampleSize,
  onClusterSampleSizeChange,
  suggestedSampleSize,
  estimatedSegmentCount,
  estimatedTokenCount,
  randomSeed,
  randomSeedUserSet,
  onRandomSeedChange,
  segmentationMethod,
  onSegmentationMethodChange,
  maxSegmentTokens,
  onMaxSegmentTokensChange,
  isRunning,
  isStopping,
  isClearing,
  onRun,
  onStop,
  onClear,
  hasMissingColumns,
  parametersLocked,
}: Props) {
  const [minClusterSizeDraft, setMinClusterSizeDraft] = useState<NumericInputDraft>(() => ({
    source: minClusterSize,
    value: String(minClusterSize),
  }));
  const minClusterSizeValueDraft =
    minClusterSizeDraft.source === minClusterSize
      ? minClusterSizeDraft.value
      : String(minClusterSize);

  const [maxClusterSizeDraft, setMaxClusterSizeDraft] = useState<{
    source: number | null;
    value: string;
  }>(() => ({
    source: maxClusterSize,
    value: maxClusterSize === null ? '' : String(maxClusterSize),
  }));
  const maxClusterSizeValueDraft =
    maxClusterSizeDraft.source === maxClusterSize
      ? maxClusterSizeDraft.value
      : maxClusterSize === null
        ? ''
        : String(maxClusterSize);
  const maxTopicSizeInvalid = maxClusterSize !== null && maxClusterSize <= minClusterSize;

  const handleMaxClusterSizeBlur = (event: FocusEvent<HTMLInputElement>) => {
    const next = sanitizeMaxClusterSize(event.currentTarget.value.trim());
    setMaxClusterSizeDraft({ source: next, value: next === null ? '' : String(next) });
    onMaxClusterSizeChange(next);
  };

  const lastRunSummary = (() => {
    if (!lastRunClustering) return null;
    const segments = `Last run: ${lastRunClustering.segmentCount.toLocaleString()} segments`;
    const sampled =
      lastRunClustering.clusteredSegments === null
        ? ''
        : `; topics found from a sample of ${lastRunClustering.clusteredSegments.toLocaleString()} (seed ${String(lastRunClustering.randomSeed)})`;
    if (lastRunClustering.requestedMaxTopicSize !== null) {
      return `${segments}${sampled}; topics larger than ${lastRunClustering.requestedMaxTopicSize.toLocaleString()} were split`;
    }
    return lastRunClustering.appliedMaxTopicSize === null
      ? `${segments}${sampled}; no topic needed splitting`
      : `${segments}${sampled}; topics larger than ${lastRunClustering.appliedMaxTopicSize.toLocaleString()} were split`;
  })();

  // Segments to sample: empty shows the suggestion in grey; Run uses it, Tab
  // fills it in to edit, and typing replaces it (as for Data Block names).
  const [sampleSizeDraft, setSampleSizeDraft] = useState<{
    source: number | null;
    value: string;
  }>(() => ({
    source: clusterSampleSize,
    value: clusterSampleSize === null ? '' : String(clusterSampleSize),
  }));
  const sampleSizeValueDraft =
    sampleSizeDraft.source === clusterSampleSize
      ? sampleSizeDraft.value
      : clusterSampleSize === null
        ? ''
        : String(clusterSampleSize);
  const commitSampleSize = (value: string) => {
    const next = sanitizeTopicSampleSize(value);
    setSampleSizeDraft({ source: next, value: next === null ? '' : String(next) });
    onClusterSampleSizeChange(next);
  };

  const sampleSize = clusterSampleSize ?? suggestedSampleSize;
  // Embedding takes most of a first run and follows the token count; about
  // 36,000 tokens a second on a recent Mac, so the minutes are a floor.
  const firstRunNote =
    estimatedTokenCount !== null && estimatedTokenCount > TOPIC_FIRST_RUN_NOTE_TOKENS
      ? `About ${Math.round(estimatedTokenCount / 1_000_000).toLocaleString()} million tokens to read. A first run may take ${Math.max(1, Math.round(estimatedTokenCount / 36_000 / 60)).toLocaleString()} minutes or more, longer on older computers; later runs on the same text reuse this work. Lower the sampling percentage for a quicker first look.`
      : null;
  // Called by: the topic sampling note so the reason and the help section sit together.
  const openTopicSamplingHelp = () => {
    const target = getDocumentTarget('tutorial', 'analysis.topic-modeling.topic-sampling');
    if (target) useUIStore.getState().openDocument(target);
  };
  const topicSamplingNote = ((): { warning: boolean; lines: string[] } | null => {
    const total = estimatedSegmentCount;
    if (!clusterSample) {
      if (total === null) return null;
      if (total <= TOPIC_SAMPLING_SUGGEST_ABOVE) {
        return {
          warning: false,
          lines: [
            `About ${total.toLocaleString()} segments (estimated); every segment is clustered.`,
          ],
        };
      }
      return {
        warning: true,
        lines: [
          `About ${total.toLocaleString()} segments. Clustering time grows with the square of the number of segments, so this run may take a long time. Topic sampling shortens it, but may miss small topics.`,
        ],
      };
    }
    if (total !== null && total <= sampleSize) {
      return {
        warning: false,
        lines: [
          `This corpus has about ${total.toLocaleString()} segments, no more than the sample, so every segment is clustered.`,
        ],
      };
    }
    const from =
      total === null
        ? `${sampleSize.toLocaleString()} segments`
        : `${sampleSize.toLocaleString()} of about ${total.toLocaleString()} segments`;
    return {
      warning: false,
      lines: [
        `Topics are found from ${from}, picked with seed ${String(randomSeed)}; every other segment joins the topic of the sampled segment most similar to it.`,
        total === null
          ? 'A smaller sample clusters much faster but may miss small topics.'
          : `Clustering time grows with the square of the sample, so half the sample is about four times faster, but topics smaller than about ${smallestFindableTopic(minClusterSize, total, sampleSize).toLocaleString()} segments may be missed.`,
      ],
    };
  })();

  const handleMinClusterSizeBlur = (event: FocusEvent<HTMLInputElement>) => {
    const next = sanitizeMinClusterSize(event.currentTarget.value);
    setMinClusterSizeDraft({ source: next, value: String(next) });
    onMinClusterSizeChange(next);
  };

  const [maxSegmentTokensDraft, setMaxSegmentTokensDraft] = useState<NumericInputDraft>(() => ({
    source: maxSegmentTokens,
    value: String(maxSegmentTokens),
  }));
  const maxSegmentTokensValueDraft =
    maxSegmentTokensDraft.source === maxSegmentTokens
      ? maxSegmentTokensDraft.value
      : String(maxSegmentTokens);

  const handleMaxSegmentTokensBlur = (event: FocusEvent<HTMLInputElement>) => {
    const next = sanitizeMaxSegmentTokens(event.currentTarget.value);
    setMaxSegmentTokensDraft({ source: next, value: String(next) });
    onMaxSegmentTokensChange(next);
  };

  // Called by: NodeInputsPanel to place topic sampling next to each selected node's text column because sampling is per-corpus input context rather than a separate global option.
  const renderSamplingInput = ({ index, nodeId }: NodeInputColumnAddonArgs) => {
    const sample = corpusSamples[index] ?? { percent: '100' };
    const nDocs = nodeDocCounts[index] ?? 0;
    const effectiveDocs = effectiveSampleDocumentCount(sample, nDocs);
    const label = `Sampling (${effectiveDocs.toLocaleString()} ${
      effectiveDocs === 1 ? 'document' : 'documents'
    })`;
    const inputId = `topic-sampling-percent-${String(index)}-${nodeId.replace(/[^A-Za-z0-9_-]/g, '_')}`;

    return (
      <div className="inline-grid w-max max-w-full gap-1" data-testid="topic-sampling-wrapper">
        <Label
          htmlFor={inputId}
          className="whitespace-nowrap text-label-secondary font-medium text-description"
        >
          {label}
        </Label>
        <div
          className="flex w-full items-center rounded-md border border-input-border bg-transparent focus-within:border-focus focus-within:ring-[3px] focus-within:ring-focus/50"
          data-testid="topic-sampling-control"
        >
          <Input
            id={inputId}
            aria-label={label}
            type="number"
            min={1}
            max={100}
            step={1}
            value={sample.percent}
            className="h-9 w-14 flex-1 border-0 bg-transparent px-2 text-right text-body shadow-none focus-visible:ring-0"
            onChange={(event) => {
              onCorpusSampleChange(index, { percent: event.target.value });
            }}
            onBlur={(event) => {
              onCorpusSampleChange(index, {
                percent: String(sanitizeSamplePercent(event.currentTarget.value)),
              });
            }}
          />
          <span className="pr-2 text-body text-description">%</span>
        </div>
      </div>
    );
  };

  return (
    <AnalysisCardLayout
      title="Topic Modelling"
      info={{
        targetKey: 'topic-modeling.overview',
        label: 'About Topic Modelling',
        tooltip: 'Learn what topic modelling is and how it can help you.',
      }}
      actions={{
        onRunAll: onRun,
        onStop,
        onClear,
        runAllDisabled:
          parametersLocked || actionState.runDisabled || isRunning || hasMissingColumns,
        runAllDisabledReason: hasMissingColumns
          ? 'Select a column for each Data Block'
          : actionState.runDisabledReason,
        clearDisabled: actionState.clearDisabled || isClearing,
        clearDisabledReason: actionState.clearDisabledReason,
        isRunningAll: isRunning,
        isStopping,
        isClearing,
        runAllLabel: 'Run',
      }}
      actionsGuidanceTarget="topic-modeling-actions"
      parametersLocked={parametersLocked}
    >
      <NodeInputsPanel
        guidanceTarget="topic-modeling-inputs"
        resolvedNodes={nodeInputs.resolvedNodes}
        availableNodes={nodeInputs.availableNodes}
        canAddMore={nodeInputs.canAddMore}
        maxNodes={2}
        onAddNodes={nodeInputs.addNodes}
        onRemoveNode={nodeInputs.removeNode}
        onClear={nodeInputs.clear}
        onColumnChange={onColumnChange}
        defaultPalette={defaultPalette}
        nodeColors={nodeColors}
        onNodeColorChange={onNodeColorChange}
        columnAddonWidth="auto"
        renderColumnAddon={renderSamplingInput}
      />
      {firstRunNote ? (
        <p id="topic-first-run-note" className="mt-2 px-3 text-label-secondary text-warning">
          {firstRunNote}
        </p>
      ) : null}

      {/* Compact on small screens (issue 152): short labels, integer-sized
          inputs, and one Topic size range; full wording stays in the help. */}
      <div className="mt-4 px-3">
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <div className="space-y-1">
            <ParameterLabel
              helpKey="analysis.topic-modeling.segmentation-method"
              htmlFor="topic-segmentation-method"
              help="How text is cut into segments. Automatic packs paragraphs up to Max tokens; Paragraph and Sentence keep one each."
            >
              Segments
            </ParameterLabel>
            <Select
              value={segmentationMethod}
              onValueChange={(value) => {
                onSegmentationMethodChange(value as TopicSegmentationMethod);
              }}
            >
              <SelectTrigger
                id="topic-segmentation-method"
                aria-label="Segmentation method"
                className="h-8 w-32"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="automatic">Automatic</SelectItem>
                <SelectItem value="line">Paragraph</SelectItem>
                <SelectItem value="sentence">Sentence</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <ParameterLabel
              helpKey="analysis.topic-modeling.max-segment-tokens"
              htmlFor="topic-max-segment-tokens"
              help="Largest segment, 32 to 256 tokens (words or parts of words)."
            >
              Max tokens
            </ParameterLabel>
            <Input
              id="topic-max-segment-tokens"
              aria-label="Maximum tokens per segment"
              type="number"
              min={32}
              max={256}
              step={1}
              value={maxSegmentTokensValueDraft}
              className={INTEGER_INPUT}
              onChange={(event) => {
                setMaxSegmentTokensDraft({
                  source: maxSegmentTokens,
                  value: event.target.value,
                });
              }}
              onBlur={handleMaxSegmentTokensBlur}
            />
          </div>

          <fieldset className="space-y-1">
            <ParameterLabel
              helpKey="analysis.topic-modeling.topic-size"
              as="legend"
              help="Smallest and largest topic, counted in segments (not documents). Leave Max empty for Auto."
            >
              Topic size
            </ParameterLabel>
            <div className="flex items-center gap-1.5">
              <Input
                id="topic-min-cluster-size"
                aria-label="Min topic size"
                type="number"
                min={2}
                step={1}
                value={minClusterSizeValueDraft}
                className={INTEGER_INPUT}
                onChange={(event) => {
                  setMinClusterSizeDraft({
                    source: minClusterSize,
                    value: event.target.value,
                  });
                }}
                onBlur={handleMinClusterSizeBlur}
              />
              <span aria-hidden="true" className="text-description">
                to
              </span>
              <Input
                id="topic-max-cluster-size"
                aria-label="Max topic size"
                aria-invalid={maxTopicSizeInvalid || undefined}
                aria-describedby={
                  maxTopicSizeInvalid ? 'topic-max-cluster-size-error' : 'topic-last-run-summary'
                }
                type="number"
                min={minClusterSize + 1}
                step={1}
                placeholder="Auto"
                value={maxClusterSizeValueDraft}
                className={INTEGER_INPUT}
                onChange={(event) => {
                  setMaxClusterSizeDraft({
                    source: maxClusterSize,
                    value: event.target.value,
                  });
                }}
                onBlur={handleMaxClusterSizeBlur}
              />
            </div>
            {maxTopicSizeInvalid ? (
              <p id="topic-max-cluster-size-error" className="text-label-secondary text-error">
                Max must be larger than Min
              </p>
            ) : null}
          </fieldset>

          <div className="space-y-1">
            <ParameterLabel
              helpKey="analysis.topic-modeling.random-seed"
              htmlFor="random-seed"
              help="Picks the samples. The same seed gives very similar topics, not always identical."
            >
              Seed
            </ParameterLabel>
            <Input
              id="random-seed"
              aria-label="Random seed"
              type="number"
              min={0}
              step={1}
              value={randomSeed}
              className={`${INTEGER_INPUT}${!randomSeedUserSet ? ' text-description' : ''}`}
              onChange={(e) => {
                onRandomSeedChange(Math.max(0, Number(e.target.value) || 0));
              }}
            />
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="topic-cluster-sample"
                checked={clusterSample}
                aria-describedby={topicSamplingNote ? 'topic-cluster-sample-note' : undefined}
                onCheckedChange={(checked) => {
                  onClusterSampleChange(checked === true);
                }}
              />
              <ParameterLabel
                helpKey="analysis.topic-modeling.topic-sampling"
                htmlFor="topic-cluster-sample"
                help="Find topics from a sample of segments, then assign the rest. Faster on very large corpora; may miss small topics."
              >
                Topic sampling
              </ParameterLabel>
            </div>
            {clusterSample ? (
              <div className="flex items-center gap-2">
                <Label htmlFor="topic-cluster-sample-size" className={LABEL_TEXT}>
                  Segments to sample
                </Label>
                <Input
                  id="topic-cluster-sample-size"
                  type="text"
                  inputMode="numeric"
                  value={sampleSizeValueDraft}
                  placeholder={suggestedSampleSize.toLocaleString()}
                  className="h-8 w-28 px-2 text-right text-body tabular-nums"
                  onChange={(event) => {
                    setSampleSizeDraft({ source: clusterSampleSize, value: event.target.value });
                  }}
                  onBlur={(event) => {
                    commitSampleSize(event.currentTarget.value);
                  }}
                  // Tab takes the grey suggestion so it can be edited (issue 156).
                  onKeyDown={(event) => {
                    acceptPlaceholderOnTab({
                      event,
                      value: sampleSizeValueDraft,
                      setValue: (value) => {
                        setSampleSizeDraft({ source: clusterSampleSize, value });
                      },
                    });
                  }}
                />
              </div>
            ) : null}
          </div>
          {topicSamplingNote ? (
            <p
              id="topic-cluster-sample-note"
              className={`text-label-secondary ${topicSamplingNote.warning ? 'text-warning' : 'text-description'}`}
            >
              {topicSamplingNote.lines.join(' ')}{' '}
              <button
                type="button"
                className="text-link underline underline-offset-2"
                onClick={openTopicSamplingHelp}
              >
                Learn more
              </button>
            </p>
          ) : null}
        </div>
        {/* The segment count depends on every setting in the row (Segments and
            Max tokens make the segments; Topic size groups them), so it spans
            the row instead of sitting under Topic size. */}
        {lastRunSummary ? (
          <p id="topic-last-run-summary" className="mt-2 text-label-secondary text-description">
            {lastRunSummary}
          </p>
        ) : null}
      </div>
    </AnalysisCardLayout>
  );
}
