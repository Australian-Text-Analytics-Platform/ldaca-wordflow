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
import { schemaQuery } from '@/features/project/projectQueries';
import { clearSavedAnalysis, savedAnalysisQuery } from '@/features/project/savedAnalysis';
import * as tasksApi from '@/features/project/tasksApi';
import * as analysesApi from '@/features/tools/common/analysisApi';
import { NodeInputsPanel } from '@/features/tools/common/components/NodeInputsPanel';
import { useNodeInputs } from '@/features/tools/common/nodeInputs/useNodeInputs';
import * as frequencyApi from '@/features/tools/token-frequency/api';
import { isArrowStringField } from '@/lib/arrow/decodeArrowTable';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs as AnalysisTabs } from '../common/Tabs';
import { matchesAnalysisRequest, useRequestRestoration } from '../common/analysisRequest';
import { AnalysisAction } from '../common/components/AnalysisAction';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { AnalysisResultBoundary } from '../common/components/AnalysisResultBoundary';
import { NodeInputField } from '../common/components/NodeInputField';
import { RequestCompatibilityWarning } from '../common/components/RequestCompatibilityWarning';
import { TokenizerChoice } from '../common/language/TokenizerChoice';
import { useAnalysisRecovery } from '../common/useAnalysisRecovery';
import { useNodePreferences } from '../common/useNodePreferences';
import { FrequencyResults } from './FrequencyResults';
import { corpusColor, frequencySettings, useFrequencySettings } from './frequencySettings';
import {
  getFrequencyDraft,
  orderedFrequencyRequest,
  useFrequencyState,
  type FrequencyDraft,
} from './frequencyState';

export default function TokenFrequencyFeature({
  base,
  nodes,
  tasks,
  active,
  editing = false,
  onCancel,
  onOpenConcordance,
}: {
  base: string;
  nodes: projectApi.ProjectNode[];
  tasks: tasksApi.NativeTask[];
  active: boolean;
  editing?: boolean;
  onCancel: (id: string) => void;
  onOpenConcordance?: () => void;
}) {
  const chosen = useFrequencyState((state) => state.active[base]);
  return (
    <AnalysisTabs
      base={base}
      active={active}
      editing={editing}
      kind="frequency"
      label="Frequency"
      description="Count words in one Data Block or compare two corpora. Results are saved in this project."
      chosen={chosen}
      help={<HelpIcon targetKey="analysis.token-frequency.tab" label="About Frequency" />}
      onActivate={(id) => useFrequencyState.getState().activate(base, id)}
      onRemove={(id) => useFrequencyState.getState().remove(base, id)}
    >
      {(tab) => (
        <FrequencyTab
          key={tab.id}
          base={base}
          tab={tab}
          nodes={nodes}
          tasks={tasks}
          active={active}
          editing={editing}
          onCancel={onCancel}
          onOpenConcordance={onOpenConcordance}
        />
      )}
    </AnalysisTabs>
  );
}

function FrequencyTab({
  base,
  tab,
  nodes,
  tasks,
  active,
  editing,
  onCancel,
  onOpenConcordance,
}: {
  base: string;
  tab: analysesApi.Tab;
  nodes: projectApi.ProjectNode[];
  tasks: tasksApi.NativeTask[];
  active: boolean;
  editing: boolean;
  onCancel: (id: string) => void;
  onOpenConcordance?: () => void;
}) {
  const cache = useQueryClient();
  const savePreference = useNodePreferences(base);
  const analysisId = tab.analysis?.has_result ? tab.analysis.id : null;
  const result = useQuery({
    ...savedAnalysisQuery(cache, base, tab, (id, signal) =>
      frequencyApi.getFrequencyResult(base, id, signal),
    ),
    enabled: active && Boolean(analysisId),
  });
  const recovery = useAnalysisRecovery(base, analysisId);
  const stored = useFrequencyState((state) => getFrequencyDraft(state, base, tab.id));
  const restored = useRequestRestoration('frequency', tab.analysis, [base, tab.id]);
  const savedInputs = restored.request.inputs;
  const presentationOrder = frequencySettings(tab.settings).presentationOrder ?? [0, 1];
  const draft: FrequencyDraft = stored ?? {
    inputs: savedInputs
      .map((input, index) => ({ input, index }))
      .sort((a, b) => presentationOrder.indexOf(a.index) - presentationOrder.indexOf(b.index))
      .map(({ input }) => input),
    study: savedInputs.length === 2 ? (savedInputs[1]?.source.name ?? null) : null,
  };
  const update = (next: FrequencyDraft) => {
    useFrequencyState.getState().setDraft(base, tab.id, next);
  };
  const selectedNames = draft.inputs.map((input) => input.source.name);
  const schemas = useQueries({
    queries: draft.inputs.map((input) => ({
      ...schemaQuery(base, input.source),
      enabled: active,
    })),
  });
  const picker = useNodeInputs({
    value: draft.inputs.map((input) => ({ node_id: input.source.name, column: input.column })),
    onChange: (next) => {
      update({
        ...draft,
        inputs: next.map((input) => ({
          source: { schema: 'data', name: input.node_id },
          column: input.column ?? '',
          tokenizer:
            draft.inputs.find(
              (item) => item.source.name === input.node_id && item.column === input.column,
            )?.tokenizer ??
            nodes.find((node) => node.table_name === input.node_id)?.tokenizer_models?.[
              input.column ?? ''
            ] ??
            '',
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
    getColumnInfos: (node) =>
      mapArrowColumnsToInfo(schemas[selectedNames.indexOf(node.id)]?.data ?? []),
    constraints: { maxNodes: 2, fieldPredicate: isArrowStringField, preserveColumnSelection: true },
  });
  const tokenizers = useQuery({
    queryKey: ['native', base, 'tokenizers'],
    queryFn: ({ signal }) => frequencyApi.getTokenizers(base, signal),
    staleTime: Infinity,
  });
  const { settings, persist: persistSettings } = useFrequencySettings(
    base,
    tab,
    editing,
    result.data?.result.payload.corpora ?? [],
  );
  const currentTask = tasks.find((task) => task.tab_id === tab.id && task.finished_at === null);
  const run = useMutation({
    mutationFn: async (request: frequencyApi.FrequencyRequest) => {
      // Resolve saved positional colours before a new run can change the corpus order.
      await persistSettings({
        ...(Array.isArray(tab.settings.colors) ? { colors: settings.colors } : {}),
        presentationOrder: draft.inputs.map((input) =>
          request.inputs.findIndex((selected) => selected.source.name === input.source.name),
        ),
      });
      return frequencyApi.runFrequency(base, tab.id, request);
    },
    onSettled: () => cache.invalidateQueries({ queryKey: ['native', base, 'tabs', 'frequency'] }),
  });
  const executionTask =
    currentTask ??
    (run.isPending
      ? tasks.find((task) => task.tab_id === tab.id && task.created_at >= run.submittedAt)
      : undefined);
  const clear = useMutation({
    mutationFn: () => clearSavedAnalysis(cache, base, tab),
  });
  const captured = orderedFrequencyRequest({
    ...draft,
    inputs: draft.inputs.map((input) => ({
      ...input,
      column:
        picker.nodeColumnSelections.find((selection) => selection.nodeId === input.source.name)
          ?.column ?? input.column,
    })),
  });
  const running = run.isPending || Boolean(currentTask);
  const ready =
    !restored.blocked &&
    captured.inputs.length > 0 &&
    captured.inputs.every(
      (input) =>
        input.source.schema &&
        input.column &&
        input.tokenizer &&
        nodes.some((node) => node.table_name === input.source.name),
    );
  const changeTokenizer = (name: string, column: string, tokenizer: string) => {
    const current = getFrequencyDraft(useFrequencyState.getState(), base, tab.id) ?? draft;
    update({
      ...current,
      inputs: current.inputs.map((input) =>
        input.source.name === name ? { ...input, column, tokenizer } : input,
      ),
    });
  };
  return (
    <div className="min-w-0 space-y-3">
      <section
        aria-label="Frequency request"
        className="min-w-0 rounded-lg border border-surface-border bg-surface"
      >
        <header className="flex items-center gap-2 px-3 py-2.5">
          <h1 className="text-body font-semibold">Token Frequency Analysis</h1>
          <HelpIcon targetKey="analysis.token-frequency.parameters" label="Frequency parameters" />
        </header>
        {analysisId && !result.data && !stored && !tab.analysis?.request && !result.isError ? (
          <p role="status" className="px-3 pb-3">
            Loading saved result…
          </p>
        ) : (
          <>
            <NodeInputsPanel
              {...picker}

              inputOrder={selectedNames}
              maxNodes={2}
              title="Frequency inputs"
              nodeColors={Object.fromEntries(
                draft.inputs.map((input, index) => [
                  input.source.name,
                  corpusColor(
                    settings,
                    input.source,
                    nodes.find((node) => node.table_name === input.source.name)?.color,
                    index,
                  ),
                ]),
              )}
              onNodeColorChange={(name, color) => {
                savePreference(name, { preference: 'color', value: color });
              }}
              onAddNodes={picker.addNodes}
              onRemoveNode={picker.removeNode}
              onClear={picker.clear}
              onColumnChange={(name, column) => {
                picker.setColumn(name, column);
                savePreference(name, { preference: 'document_column', value: column || null });
              }}
              unavailableNodes={draft.inputs
                .filter((input) => !nodes.some((node) => node.table_name === input.source.name))
                .map((input) => ({
                  id: input.source.name,
                  name: input.source.name,
                  column: input.column,
                }))}
              renderColumnAddon={({ nodeId, column }) => (
                <>
                  <TokenizerChoice
                    active={active}
                    base={base}
                    source={{ schema: 'data', name: nodeId }}
                    column={column}
                    models={tokenizers.data ?? []}
                    preferredModel={
                      nodes.find((n) => n.table_name === nodeId)?.tokenizer_models?.[column]
                    }
                    value={
                      draft.inputs.find((input) => input.source.name === nodeId)?.tokenizer ?? ''
                    }
                    onChange={(value) => {
                      changeTokenizer(nodeId, column, value);
                    }}
                  />
                </>
              )}
              renderExtraNodeContent={({ nodeId }) => (
                <>
                  {schemas[selectedNames.indexOf(nodeId)]?.isError && (
                    <p
                      role="alert"
                      className="order-last basis-full text-label-secondary text-description"
                    >
                      This input is unavailable. Check its source or select another Data Block.
                    </p>
                  )}
                  {draft.inputs.length === 2 && (
                    <NodeInputField
                      label="Role"
                      value={
                        (draft.study ?? draft.inputs[0]?.source.name) === nodeId
                          ? 'Study corpus'
                          : 'Reference corpus'
                      }
                    >
                      <Select
                        value={
                          (draft.study ?? draft.inputs[0]?.source.name) === nodeId
                            ? 'study'
                            : 'reference'
                        }
                        onValueChange={(role) => {
                          update({
                            ...draft,
                            study:
                              role === 'study'
                                ? nodeId
                                : (draft.inputs.find((input) => input.source.name !== nodeId)
                                    ?.source.name ?? null),
                          });
                        }}
                      >
                        <SelectTrigger aria-label={`${nodeId} corpus role`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="study">Study corpus</SelectItem>
                          <SelectItem value="reference">Reference corpus</SelectItem>
                        </SelectContent>
                      </Select>
                    </NodeInputField>
                  )}
                </>
              )}
            />
            {tokenizers.isError && (
              <p role="alert" className="px-3 pb-2 text-body-secondary">
                Tokenizer choices could not be loaded.{' '}
                <Button
                  variant="link"
                  onClick={() => {
                    void tokenizers.refetch();
                  }}
                >
                  Retry
                </Button>
              </p>
            )}
            <RequestCompatibilityWarning
              issues={restored.issues}
              onReset={() =>
                restored.reset((value) =>
                  update({
                    inputs: value.inputs,
                    study: value.inputs.some((input) => input.source.name === draft.study)
                      ? draft.study
                      : (value.inputs[0]?.source.name ?? null),
                  }),
                )
              }
              resetDone={!restored.blocked}
            />
            <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-1">
              <AnalysisAction
                reason={
                  editing
                    ? 'Finish Table editing before running Frequency.'
                    : running
                      ? 'This analysis is already running.'
                      : !ready
                        ? 'Choose an input, text column and tokenizer first.'
                        : !recovery.failed &&
                            restored.issues.length === 0 &&
                            analysisId &&
                            matchesAnalysisRequest(
                              'frequency',
                              captured,
                              result.data?.request_status ?? tab.analysis?.request_status,
                            )
                          ? 'These settings already have saved results. Change the parameters or clear results to run again.'
                          : undefined
                }
                onClick={() => {
                  update({
                    ...draft,
                    inputs: draft.inputs.map((input) => ({
                      ...input,
                      column:
                        picker.nodeColumnSelections.find(
                          (selection) => selection.nodeId === input.source.name,
                        )?.column ?? input.column,
                    })),
                  });
                  run.mutate(captured);
                }}
              >
                {recovery.failed || (analysisId && restored.issues.length > 0) ? 'Rerun' : 'Run'}
              </AnalysisAction>
              <Button
                variant="ghost"
                disabled={!analysisId || running || editing || clear.isPending}
                onClick={() => {
                  update(draft);
                  clear.mutate();
                }}
              >
                Clear results
              </Button>
            </div>
          </>
        )}
      </section>
      {running ? (
        <AnalysisProgress
          name={tab.name}
          task={executionTask}
          message={executionTask?.state === 'succeeded' ? 'Loading results…' : undefined}
          onCancel={
            currentTask
              ? () => {
                  onCancel(currentTask.id);
                }
              : undefined
          }
        />
      ) : result.data && !result.isError ? (
        <AnalysisResultBoundary
          base={base}
          analysisId={analysisId}
          name={tab.name}
          onError={recovery.onRenderError}
          onReset={recovery.reset}
        >
          <FrequencyResults
            key={result.data.id}

            editing={editing}
            nodes={nodes}
            inputs={captured.inputs}
            base={base}
            tab={tab}
            result={result.data}
            onOpenConcordance={onOpenConcordance}
            outdated={JSON.stringify(captured) !== JSON.stringify(result.data.request)}
            active={active}
          />
        </AnalysisResultBoundary>
      ) : analysisId ? (
        <AnalysisProgress
          name={tab.name}
          message={result.isError ? 'Could not load results.' : 'Loading results…'}
          error={result.isError}
          diagnostic={result.error}
          onRetry={
            result.isError
              ? () => {
                  void result.refetch();
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
