import { clearSavedAnalysis, savedAnalysisQuery } from '@/features/project/savedAnalysis';
import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/features/project/api';
import { schemaQuery } from '@/features/project/projectQueries';
import { mapArrowColumnsToInfo } from '@/features/project/data-view/utils/columnTypes';
import { isArrowStringField } from '@/lib/arrow/decodeArrowTable';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import HelpIcon from '@/components/help/HelpIcon';
import { Tabs } from '../common/Tabs';
import { NodeInputsPanel } from '../common/components/NodeInputsPanel';
import { useNodeInputs } from '../common/nodeInputs/useNodeInputs';
import { useNodeInputRequests } from '../common/nodeInputs/useNodeInputRequests';
import { TokenizerChoice } from '../common/language/TokenizerChoice';
import { decodeAnalysisRequest, matchesAnalysisRequest } from '../common/analysisRequest';
import { RequestCompatibilityWarning } from '../common/components/RequestCompatibilityWarning';
import { AnalysisAction } from '../common/components/AnalysisAction';
import { AnalysisNumberInput } from '../common/components/AnalysisNumberInput';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { AnalysisResultBoundary } from '../common/components/AnalysisResultBoundary';
import { useAnalysisRecovery } from '../common/useAnalysisRecovery';
import { useTabSettings } from '../common/useTabSettings';
import { VIZ_PALETTE, GREY } from '../common/vizPalette';
import { topicKey, useTopicState, useTopicSampling } from './topicState';
import { useTopicPreview } from './useTopicPreview';
import { TopicSamplingDialog } from './TopicSamplingDialog';
import { TopicResults } from './TopicResults';

interface Props {
  base: string;
  nodes: api.ProjectNode[];
  tasks: api.NativeTask[];
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
}: Props & { tab: api.Tab }) {
  const cache = useQueryClient();
  const analysisId = tab.analysis?.has_result ? tab.analysis.id : null;
  const result = useQuery({
    ...savedAnalysisQuery(cache, base, tab, (id, signal) => api.getTopicResult(base, id, signal)),
    enabled: active && Boolean(analysisId),
  });
  const recovery = useAnalysisRecovery(base, analysisId);
  const restored = decodeAnalysisRequest('topic-modeling', tab.analysis?.request);
  const stored = useTopicState((state) => state.drafts[topicKey(base, tab.id)]);
  const draft = stored ?? restored.request;
  const update = (next: api.TopicRequest) => {
    useTopicState.getState().setDraft(base, tab.id, next);
  };
  const { settings, change: changeSettings } = useTabSettings(base, tab);
  const colors = (settings.colors ?? {}) as Record<string, string>;
  const [sampling, setSampling] = useState<api.TopicRequest | null>(null);
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
  const inputRequests = useNodeInputRequests({
    scopeId: base,
    tool: 'topic-modeling',
    addNodes: picker.addNodes,
    enabled: active && !editing,
    deferPlacement: Boolean(analysisId ?? preview.state),
  });
  const tokenizers = useQuery({
    queryKey: ['native', base, 'tokenizers'],
    queryFn: ({ signal }) => api.getTokenizers(base, signal),
    staleTime: Infinity,
  });
  const models = useQuery({
    queryKey: ['native', base, 'embedding-models'],
    queryFn: ({ signal }) => api.embeddingModels(base, signal),
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
    mutationFn: (request: api.TopicRequest) => api.runTopicModel(base, tab.id, request),
    onSettled: () =>
      cache.invalidateQueries({ queryKey: ['native', base, 'tabs', 'topic-modeling'] }),
  });
  const clear = useMutation({
    mutationFn: () => clearSavedAnalysis(cache, base, tab),
  });
  const busy = run.isPending || Boolean(currentTask);
  const ready =
    captured.inputs.length > 0 &&
    Boolean(captured.tokenizer) &&
    captured.inputs.every(
      (input) => input.column && nodes.some((node) => node.table_name === input.source.name),
    );
  const unchanged =
    Boolean(analysisId) &&
    !recovery.failed &&
    restored.issues.length === 0 &&
    matchesAnalysisRequest(
      'topic-modeling',
      captured,
      result.data?.request ?? tab.analysis?.request,
    );
  const reason = editing
    ? 'Finish Table editing first.'
    : busy
      ? 'This analysis is already running.'
      : !ready
        ? 'Choose document inputs and a tokenizer first.'
        : unchanged
          ? 'These settings already have saved results. Change the parameters or clear results to run again.'
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
    (draft.embedding_model.includes('multilingual') ? 128 : 256);
  const knownCounts = new Map(
    (result.data?.result.payload.sources ?? []).map((source) => [
      api.targetKey(source.input.source),
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
          {...inputRequests}
          title="Topic Modelling inputs"
          maxNodes={2}
          inputOrder={names}
          onAddNodes={picker.addNodes}
          onRemoveNode={picker.removeNode}
          onClear={picker.clear}
          onColumnChange={picker.setColumn}
          nodeColors={Object.fromEntries(
            draft.inputs.map((input, i) => [
              input.source.name,
              colors[api.targetKey(input.source)] ??
                nodes.find((node) => node.table_name === input.source.name)?.color ??
                VIZ_PALETTE[i] ??
                GREY,
            ]),
          )}
          onNodeColorChange={(name, color) => {
            changeSettings({ colors: { ...colors, [api.targetKey(name)]: color } });
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
              value={draft.tokenizer}
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
                  models.data?.find((model) => model.id === embedding_model)?.token_limit ?? 256;
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
                update({ ...captured, minimum_topic_size });
              }}
            />
          </label>
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
        <RequestCompatibilityWarning issues={restored.issues} />
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
            request={
              temporary && live
                ? live.request
                : decodeAnalysisRequest('topic-modeling', result.data?.request).request
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
