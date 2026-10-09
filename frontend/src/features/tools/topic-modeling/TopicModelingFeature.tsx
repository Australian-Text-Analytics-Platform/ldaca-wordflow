import HelpIcon from '@/components/help/HelpIcon';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import * as projectApi from '@/features/project/api';
import { mapArrowColumnsToInfo } from '@/features/project/data-view/utils/columnTypes';
import * as objectsApi from '@/features/project/objects';
import { schemaQuery } from '@/features/project/projectQueries';
import { clearSavedAnalysis, savedAnalysisQuery } from '@/features/project/savedAnalysis';
import * as tasksApi from '@/features/project/tasksApi';
import * as analysesApi from '@/features/tools/common/analysisApi';
import * as frequencyApi from '@/features/tools/token-frequency/api';
import * as topicApi from '@/features/tools/topic-modeling/api';
import { isArrowStringField } from '@/lib/arrow/decodeArrowTable';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Tabs } from '../common/Tabs';
import {
  decodeAnalysisRequest,
  matchesAnalysisRequest,
  useRequestRestoration,
} from '../common/analysisRequest';
import { AnalysisAction } from '../common/components/AnalysisAction';
import { AnalysisNumberInput } from '../common/components/AnalysisNumberInput';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { AnalysisResultBoundary } from '../common/components/AnalysisResultBoundary';
import { NodeInputsPanel } from '../common/components/NodeInputsPanel';
import { RequestCompatibilityWarning } from '../common/components/RequestCompatibilityWarning';
import { TokenizerChoice } from '../common/language/TokenizerChoice';
import { useNodeInputs } from '../common/nodeInputs/useNodeInputs';
import { useAnalysisRecovery } from '../common/useAnalysisRecovery';
import { useNodePreferences } from '../common/useNodePreferences';
import { useTabSettings } from '../common/useTabSettings';
import { GREY, VIZ_PALETTE } from '../common/vizPalette';
import { TopicResults } from './TopicResults';
import { MaximumTopicSize } from './TopicAdjustments';
import { TopicSamplingDialog } from './TopicSamplingDialog';
import { topicKey, useTopicSampling, useTopicState } from './topicState';
import { useTopicPreview } from './useTopicPreview';

interface Props {
  base: string;
  nodes: projectApi.ProjectNode[];
  tasks: tasksApi.NativeTask[];
  active: boolean;
  editing?: boolean;
  onCancel: (id: string) => void;
}
export default function TopicModelingFeature(props: Props) {
  const chosen = useTopicState((state) => state.active[props.base]);
  return (
    <Tabs
      {...props}
      kind="topic-modeling"
      label="Topic Modelling"
      description="Discover shared themes across one or two collections of documents."
      chosen={chosen}
      onActivate={(id) => {
        useTopicState.getState().activate(props.base, id);
      }}
      onRemove={(id) => {
        useTopicState.getState().remove(props.base, id);
        useTopicSampling.getState().remove(props.base, id);
      }}
    >
      {(tab) => <TopicTab key={tab.id} {...props} tab={tab} />}
    </Tabs>
  );
}
function TopicTab({
  base,
  nodes,
  tasks,
  active,
  editing = false,
  onCancel,
  tab,
}: Props & { tab: analysesApi.Tab }) {
  const cache = useQueryClient();
  const savePreference = useNodePreferences(base);
  const analysisId = tab.analysis?.has_result ? tab.analysis.id : null;
  const result = useQuery({
    ...savedAnalysisQuery(cache, base, tab, (id, signal) =>
      topicApi.getTopicResult(base, id, signal),
    ),
    enabled: active && Boolean(analysisId),
  });
  const recovery = useAnalysisRecovery(base, analysisId);
  const models = useQuery({
    queryKey: ['native', base, 'embedding-models'],
    queryFn: ({ signal }) => topicApi.embeddingModels(base, signal),
    staleTime: Infinity,
  });
  const restored = useRequestRestoration('topic-modeling', tab.analysis, [base, tab.id]);
  const stored = useTopicState((state) => state.drafts[topicKey(base, tab.id)]);
  const modelDefault = models.data?.[0];
  const currentDefaults = {
    ...restored.request,
    ...(modelDefault
      ? { embedding_model: modelDefault.id, max_segment_tokens: modelDefault.token_limit }
      : {}),
  };
  const draft = stored ?? (tab.analysis ? restored.request : currentDefaults);
  const update = (next: topicApi.TopicRequest) => {
    useTopicState.getState().setDraft(base, tab.id, next);
  };
  const { settings, change: changeSettings } = useTabSettings(base, tab);
  const colors = (settings.colors ?? {}) as Record<string, string>;
  const [sampling, setSampling] = useState<topicApi.TopicRequest | null>(null);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setSampling(null);
  }
  const [adjustment, setAdjustment] = useState<string | null>(null);
  const preview = useTopicPreview(base, tab.id, active);
  const schemas = useQueries({
    queries: draft.inputs.map((input) => ({ ...schemaQuery(base, input.source), enabled: active })),
  });
  const names = draft.inputs.map((input) => input.source.name);
  const picker = useNodeInputs({
    value: draft.inputs.map((input) => ({ node_id: input.source.name, column: input.column })),
    onChange: (next) => {
      update({
        ...draft,
        tokenizer:
          !stored && !tab.analysis && !draft.inputs.length
            ? (nodes.find((node) => node.table_name === next[0]?.node_id)?.tokenizer_models?.[
                next[0]?.column ?? ''
              ] ?? draft.tokenizer)
            : draft.tokenizer,
        inputs: next.map((input) => ({
          source: draft.inputs.find((old) => old.source.name === input.node_id)?.source ?? {
            schema: 'data',
            name: input.node_id,
          },
          column: input.column ?? '',
        })),
      });
    },
    allNodes: nodes.map((node) => ({
      id: node.table_name,
      name: node.table_name,
      color: node.color,
      document: node.document_column,
      tokenizerModel: null,
    })),
    getColumnInfos: (node) => mapArrowColumnsToInfo(schemas[names.indexOf(node.id)]?.data ?? []),
    constraints: { maxNodes: 2, fieldPredicate: isArrowStringField, preserveColumnSelection: true },
  });
  const tokenizers = useQuery({
    queryKey: ['native', base, 'tokenizers'],
    queryFn: ({ signal }) => frequencyApi.getTokenizers(base, signal),
    staleTime: Infinity,
  });
  const captured = {
    ...draft,
    inputs: draft.inputs.map((input) => ({
      ...input,
      column:
        picker.nodeColumnSelections.find((item) => item.nodeId === input.source.name)?.column ??
        input.column,
    })),
  };
  const currentTask = tasks.find((task) => task.tab_id === tab.id && task.finished_at === null);
  const run = useMutation({
    mutationFn: (request: topicApi.TopicRequest) => topicApi.runTopicModel(base, tab.id, request),
    onSettled: () =>
      cache.invalidateQueries({ queryKey: ['native', base, 'tabs', 'topic-modeling'] }),
  });
  const clear = useMutation({
    mutationFn: () => clearSavedAnalysis(cache, base, tab),
  });
  const busy = run.isPending || Boolean(currentTask);
  const ready =
    !restored.blocked &&
    captured.inputs.length > 0 &&
    Boolean(captured.tokenizer) &&
    captured.inputs.every(
      (input) => input.column && nodes.some((node) => node.table_name === input.source.name),
    );
  const reason = restored.blocked
    ? 'Start with current defaults before running this analysis.'
    : editing
      ? 'Finish Table editing first.'
      : busy
        ? 'This analysis is already running.'
        : !ready
          ? 'Choose document inputs and a tokenizer first.'
          : undefined;
  const live = preview.state;
  const temporary = live?.update?.state === 'ready' ? live.update : null;
  const owner = temporary
    ? { tab: tab.id, preview: temporary.preview_id }
    : analysisId
      ? { analysis: analysisId }
      : null;
  const summary = temporary?.summary ?? (live ? null : result.data?.result.payload);
  const modelLimit =
    models.data?.find((model) => model.id === draft.embedding_model)?.token_limit ??
    draft.max_segment_tokens;
  const knownCounts = new Map(
    (result.data?.result.payload.sources ?? []).map((source) => [
      objectsApi.targetKey(source.input.source),
      source.total_count,
    ]),
  );
  return (
    <>
      <section
        aria-label="Topic Modelling request"
        className="space-y-3 rounded-lg border border-surface-border p-3"
      >
        <h1 className="flex items-center gap-2 text-body font-semibold">
          Topic Modelling Analysis
          <HelpIcon
            targetKey="analysis.topic-modeling.parameters"
            label="Topic Modelling parameters help"
          />
        </h1>
        <NodeInputsPanel
          {...picker}

          title="Topic Modelling inputs"
          maxNodes={2}
          inputOrder={names}
          onAddNodes={picker.addNodes}
          onRemoveNode={picker.removeNode}
          onClear={picker.clear}
          onColumnChange={(name, column) => {
            picker.setColumn(name, column);
            savePreference(name, { preference: 'document_column', value: column || null });
          }}
          nodeColors={Object.fromEntries(
            draft.inputs.map((input, i) => [
              input.source.name,
              nodes.find((node) => node.table_name === input.source.name)?.color ??
                colors[objectsApi.targetKey(input.source)] ??
                VIZ_PALETTE[i] ??
                GREY,
            ]),
          )}
          onNodeColorChange={(name, color) => {
            savePreference(name, { preference: 'color', value: color });
          }}
          unavailableNodes={draft.inputs
            .filter((input) => !nodes.some((node) => node.table_name === input.source.name))
            .map((input) => ({
              id: input.source.name,
              name: input.source.name,
              column: input.column,
            }))}
          renderColumnAddon={({ node, column }) => (
            <TokenizerChoice
              active={active}
              base={base}
              source={{ schema: 'data', name: node.id }}
              column={column}
              models={tokenizers.data ?? []}
              preferredModel={
                nodes.find((n) => n.table_name === node.id)?.tokenizer_models?.[column]
              }
              value={draft.tokenizer}
              preferenceTargets={captured.inputs.map((input) => ({
                name: input.source.name,
                column: input.column,
              }))}
              onChange={(tokenizer) => {
                update({ ...captured, tokenizer });
              }}
            />
          )}
        />
        <p className="text-description text-label-secondary">
          Both inputs share the representative-word tokenizer. The embedding model uses its own
          tokenizer.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
          <label className="space-y-1">
            <span>Embedding model</span>
            <Select
              value={draft.embedding_model}
              onValueChange={(embedding_model) => {
                const limit =
                  models.data?.find((model) => model.id === embedding_model)?.token_limit ??
                  draft.max_segment_tokens;
                setAdjustment(
                  captured.max_segment_tokens > limit
                    ? `Maximum segment length adjusted to this model's limit of ${String(limit)} tokens.`
                    : null,
                );
                update({
                  ...captured,
                  embedding_model,
                  max_segment_tokens: Math.min(limit, captured.max_segment_tokens),
                });
              }}
            >
              <SelectTrigger aria-label="Embedding model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  models.data ?? [
                    {
                      id: draft.embedding_model,
                      label: draft.embedding_model,
                      token_limit: modelLimit,
                    },
                  ]
                ).map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span>Segmentation</span>
            <Select
              value={draft.segmentation}
              onValueChange={(value) => {
                if (value === 'automatic' || value === 'line' || value === 'sentence')
                  update({ ...captured, segmentation: value });
              }}
            >
              <SelectTrigger aria-label="Segmentation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="automatic">Automatic</SelectItem>
                <SelectItem value="line">Line</SelectItem>
                <SelectItem value="sentence">Sentence</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span>Maximum segment tokens</span>
            <AnalysisNumberInput
              aria-label="Maximum segment tokens"
              min={4}
              max={modelLimit}
              value={draft.max_segment_tokens}
              onCommit={(max_segment_tokens) => {
                update({ ...captured, max_segment_tokens });
              }}
            />
          </label>
          <label className="space-y-1">
            <span>Minimum topic size (segments)</span>
            <AnalysisNumberInput
              aria-label="Minimum topic size"
              min={2}
              max={Number.MAX_SAFE_INTEGER}
              value={draft.minimum_topic_size}
              onCommit={(minimum_topic_size) => {
                update({
                  ...captured,
                  minimum_topic_size,
                  maximum_topic_size:
                    captured.maximum_topic_size == null
                      ? null
                      : Math.max(captured.maximum_topic_size, minimum_topic_size + 1),
                });
              }}
            />
          </label>
          <MaximumTopicSize
            value={draft.maximum_topic_size}
            minimum={draft.minimum_topic_size}
            onChange={(maximum_topic_size) => update({ ...captured, maximum_topic_size })}
          />
          <label className="space-y-1">
            <span>Random seed</span>
            <AnalysisNumberInput
              aria-label="Random seed"
              min={0}
              max={Number.MAX_SAFE_INTEGER}
              value={draft.seed}
              onCommit={(seed) => {
                update({ ...captured, seed });
              }}
            />
          </label>
        </div>
        {adjustment && (
          <p role="status" className="text-description">
            {adjustment}
          </p>
        )}
        <RequestCompatibilityWarning
          issues={restored.issues}
          onReset={() =>
            restored.reset((request) =>
              update({
                ...request,
                ...(modelDefault
                  ? {
                      embedding_model: modelDefault.id,
                      max_segment_tokens: modelDefault.token_limit,
                    }
                  : {}),
              }),
            )
          }
          resetDone={!restored.blocked}
        />
        <div className="flex flex-wrap gap-2">
          <AnalysisAction
            reason={reason}
            onClick={() => {
              update(captured);
              preview.clear();
              run.mutate(captured);
            }}
          >
            {recovery.failed || (analysisId && restored.issues.length > 0) ? 'Rerun' : 'Run'}
          </AnalysisAction>
          <Button
            variant="ghost"
            disabled={editing || busy || clear.isPending || (!analysisId && !live)}
            onClick={() => {
              update(captured);
              preview.clear();
              if (analysisId) clear.mutate();
            }}
          >
            Clear results
          </Button>
          <AnalysisAction
            variant="outline"
            reason={
              reason ?? (live && !temporary && !live.error ? 'Preview is calculating.' : undefined)
            }
            onClick={() => {
              setSampling(structuredClone(captured));
            }}
          >
            Preview
          </AnalysisAction>
        </div>
      </section>
      {sampling && active && (
        <TopicSamplingDialog
          base={base}
          tab={tab.id}
          request={sampling}
          knownCounts={knownCounts}
          onClose={() => {
            setSampling(null);
          }}
          onConfirm={preview.submit}
        />
      )}
      {busy ? (
        <AnalysisProgress
          name={tab.name}
          task={
            currentTask ??
            tasks.find((task) => task.tab_id === tab.id && task.created_at >= run.submittedAt)
          }
          onCancel={
            currentTask
              ? () => {
                  onCancel(currentTask.id);
                }
              : undefined
          }
        />
      ) : live && !temporary ? (
        <AnalysisProgress
          name="Topic Modelling Preview"
          startedAt={live.startedAt}
          progress={
            live.update?.state === 'preparing'
              ? { message: live.update.stage, fraction: live.update.fraction }
              : undefined
          }
          message={
            live.cancelling
              ? 'Cancelling…'
              : (live.error ??
                (live.update?.state === 'preparing' ? live.update.stage : 'Preparing sample…'))
          }
          error={Boolean(live.error)}
          onCancel={
            live.error || live.cancelling
              ? undefined
              : () => {
                  void preview.cancel();
                }
          }
        />
      ) : owner && summary ? (
        <AnalysisResultBoundary
          base={base}
          analysisId={temporary ? null : analysisId}
          name={tab.name}
          onError={recovery.onRenderError}
          onReset={recovery.reset}
        >
          <TopicResults
            key={'analysis' in owner ? owner.analysis : owner.preview}
            base={base}
            tab={tab}
            owner={owner}
            summary={summary}
            onAdjusted={(next) => {
              if (next.analysis && 'analysis' in owner)
                cache.setQueryData(['native', base, 'analyses', owner.analysis], next.analysis);
              else preview.adjust(next.summary);
            }}
            request={
              temporary && live
                ? live.request
                : decodeAnalysisRequest('topic-modeling', result.data?.request_status).request
            }
            settings={settings}
            onSettings={changeSettings}
            nodes={nodes}
            active={active}
            editing={editing}
            outdated={Boolean(
              Boolean(live?.outdated) ||
              Boolean(live?.error) ||
              (temporary &&
                live &&
                !matchesAnalysisRequest('topic-modeling', captured, live.request)),
            )}
          />
        </AnalysisResultBoundary>
      ) : analysisId && !live ? (
        <AnalysisProgress
          name={tab.name}
          message={result.isError ? 'Could not load results.' : 'Loading results…'}
          error={result.isError}
          onRetry={
            result.isError
              ? () => {
                  void result.refetch();
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}
