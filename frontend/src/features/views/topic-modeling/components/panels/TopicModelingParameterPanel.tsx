import { useState, type FocusEvent } from 'react';
import { CircleHelp } from 'lucide-react';
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
import {
  effectiveSampleDocumentCount,
  sanitizeMaxClusterSize,
  sanitizeMinClusterSize,
  sanitizeSamplePercent,
  sanitizeMaxSegmentTokens,
  type CorpusSample,
} from '../../hooks/useTopicModelingParameters';

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
  } | null;
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

/** A short visible label with its full explanation in a help tooltip. */
function ParameterLabel({
  htmlFor,
  help,
  as = 'label',
  children,
}: {
  htmlFor?: string;
  help: string;
  as?: 'label' | 'legend';
  children: string;
}) {
  const content = (
    <>
      {children}
      <span
        aria-label={help}
        title={help}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-description"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </span>
    </>
  );
  const className =
    'flex items-center gap-1 whitespace-nowrap text-label-secondary font-medium text-description';
  return as === 'legend' ? (
    <legend className={className}>{content}</legend>
  ) : (
    <Label htmlFor={htmlFor} className={className}>
      {content}
    </Label>
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
    if (lastRunClustering.requestedMaxTopicSize !== null) {
      return `${segments}, capped at ${lastRunClustering.requestedMaxTopicSize.toLocaleString()}`;
    }
    return lastRunClustering.appliedMaxTopicSize === null
      ? `${segments}, Auto: no cap needed`
      : `${segments}, Auto capped at ${lastRunClustering.appliedMaxTopicSize.toLocaleString()}`;
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
          ? 'Select a column for each data block'
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

      {/* Compact on small screens (issue 152): short labels, integer-sized
          inputs, and one Topic size range; full wording stays in the help. */}
      <div className="mt-4 px-3">
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <div className="space-y-1">
            <ParameterLabel
              htmlFor="topic-segmentation-method"
              help="Which text spans become Topic Segments. Automatic starts from paragraphs (blank-line blocks, or single lines when the text has no blank lines). Paragraph treats every non-empty line as a paragraph. Sentence starts from Unicode sentence boundaries. A unit that fits the token budget is one segment; an oversized unit is split into sentences, then at the clause punctuation nearest its middle."
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
              htmlFor="topic-max-segment-tokens"
              help="Maximum tokens per segment, from 32 to 256. Tokens are model units and may be words or parts of words. Oversized Line and Sentence units are split into complete non-overlapping segments."
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

          <fieldset className="space-y-1" aria-describedby="topic-max-cluster-size-note">
            <ParameterLabel
              as="legend"
              help="The smallest and largest topic, in Topic Segments (not documents). Min sets the HDBSCAN minimum: smaller values can produce more natural topics. Leave Max empty for Auto: it only steps in when one topic holds more than half of all segments, splitting it into its sub-topics, and keeps the result only if that topic is not lost to outliers. A fixed Max must be larger than Min. Changing either requires running a new analysis; Number of topics only merges the resulting topics."
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
                aria-describedby="topic-max-cluster-size-note"
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
            <p
              id="topic-max-cluster-size-note"
              className={`max-w-56 text-label-secondary ${maxTopicSizeInvalid ? 'text-error' : 'text-description'}`}
            >
              {maxTopicSizeInvalid ? 'Max must be larger than Min' : lastRunSummary}
            </p>
          </fieldset>

          <div className="space-y-1">
            <ParameterLabel
              htmlFor="random-seed"
              help="Random seed. The same seed and settings give the same topics."
            >
              Seed
            </ParameterLabel>
            <Input
              id="random-seed"
              aria-label="Random Seed"
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
      </div>
    </AnalysisCardLayout>
  );
}
