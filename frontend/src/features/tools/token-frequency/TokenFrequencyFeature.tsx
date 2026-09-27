import { clearSavedAnalysis, savedAnalysisQuery } from '@/features/project/savedAnalysis';
import { decodeAnalysisRequest, matchesAnalysisRequest } from '../common/analysisRequest';
import { RequestCompatibilityWarning } from '../common/components/RequestCompatibilityWarning';
import { useAnalysisRecovery } from '../common/useAnalysisRecovery';
import { AnalysisResultBoundary } from '../common/components/AnalysisResultBoundary';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { AnalysisAction } from '../common/components/AnalysisAction';
import { schemaQuery } from '@/features/project/projectQueries';
import { useEffect, useRef } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import HelpIcon from '@/components/help/HelpIcon';
import { EditorTabs } from '@/components/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NodeInputsPanel } from '@/features/tools/common/components/NodeInputsPanel';
import { useNodeInputs } from '@/features/tools/common/nodeInputs/useNodeInputs';
import { useNodeInputRequests } from '@/features/tools/common/nodeInputs/useNodeInputRequests';
import { mapArrowColumnsToInfo } from '@/features/project/data-view/utils/columnTypes';
import { isArrowStringField } from '@/lib/arrow/decodeArrowTable';
import * as api from '@/features/project/api';
import {
  getFrequencyDraft,
  orderedFrequencyRequest,
  useFrequencyState,
  type FrequencyDraft,
} from './frequencyState';
import { TokenizerChoice } from '../common/language/TokenizerChoice';
import { FrequencyResults } from './FrequencyResults';
import { corpusColor, corpusColorKey, useFrequencySettings } from './frequencySettings';

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
  nodes: api.ProjectNode[];
  tasks: api.NativeTask[];
  active: boolean;
  editing?: boolean;
  onCancel: (id: string) => void;
  onOpenConcordance?: () => void;
}) {
  const cache = useQueryClient();
  const key = ['native', base, 'tabs', 'frequency'];
  const tabs = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.listTabs(base, signal, 'frequency'),
  });
  const chosen = useFrequencyState((state) => state.active[base]);
  const tab = tabs.data?.find((item) => item.id === chosen) ?? tabs.data?.[0];
  useEffect(() => {
    if (tab && tab.id !== chosen) useFrequencyState.getState().activate(base, tab.id);
  }, [base, chosen, tab]);
  const create = useMutation({
    mutationKey: [...key, 'create'],
    mutationFn: () => api.createTab(base, 'frequency'),
    onSuccess: async (created) => {
      await cache.cancelQueries({ queryKey: key });
      cache.setQueryData<api.Tab[]>(key, (old) => [
        ...(old ?? []).filter((item) => item.id !== created.id),
        created,
      ]);
      useFrequencyState.getState().activate(base, created.id);
    },
  });
  const { mutate: createTab, isError: creationFailed } = create;
  const initialTabChecked = useRef(false);
  useEffect(() => {
    if (!active) {
      initialTabChecked.current = false;
      return;
    }
    if (initialTabChecked.current || editing || !tabs.isSuccess || tabs.isFetching) return;
    // Check once per visit, so closing the last tab leaves the empty state available.
    initialTabChecked.current = true;
    if (
      tabs.data.length === 0 &&
      // The mutation cache also covers Strict Mode and remounts during creation.
      cache.isMutating({
        mutationKey: ['native', base, 'tabs', 'frequency', 'create'],
      }) === 0
    ) {
      createTab();
    }
  }, [active, editing, tabs.isSuccess, tabs.isFetching, tabs.data, cache, base, createTab]);
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.updateTab(base, id, { name }),
    onSuccess: (updated) =>
      cache.setQueryData<api.Tab[]>(key, (old) =>
        old?.map((item) => (item.id === updated.id ? { ...item, name: updated.name } : item)),
      ),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.reorderTabs(base, 'frequency', ids),
    onSuccess: (next) =>
      cache.setQueryData<api.Tab[]>(key, (old) =>
        old
          ?.map((item) => ({
            ...item,
            position: next.find((updated) => updated.id === item.id)?.position ?? item.position,
          }))
          .sort((a, b) => a.position - b.position),
      ),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTab(base, id),
    onSuccess: (_, id) => {
      useFrequencyState.getState().remove(base, id);
      cache.setQueryData<api.Tab[]>(key, (old) => old?.filter((item) => item.id !== id));
    },
  });
  return (
    <div
      data-testid="frequency-workspace"
      className="@container/frequency flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-surface-border bg-surface"
    >
      {tab && (
        <EditorTabs
          className="shrink-0"
          aria-label="Frequency analyses"
          activeTabId={tab.id}
          tabs={(tabs.data ?? []).map((item) => ({ id: item.id, title: item.name }))}
          onActivate={(id) => {
            useFrequencyState.getState().activate(base, id);
          }}
          onClose={
            editing || remove.isPending
              ? undefined
              : (id) => {
                  remove.mutate(id);
                }
          }
          onCreate={
            create.isPending || editing
              ? undefined
              : () => {
                  create.mutate();
                }
          }
          onRename={
            editing
              ? undefined
              : (id, name) => {
                  rename.mutate({ id, name });
                }
          }
          onReorder={
            editing
              ? undefined
              : (ids) => {
                  reorder.mutate(ids);
                }
          }
        />
      )}
      <ScrollArea data-testid="frequency-content" className="min-h-0 min-w-0 flex-1">
        <div className="min-h-full min-w-0 p-3">
          {tabs.isPending || (!tab && tabs.isFetching) ? (
            <p role="status">Loading analyses…</p>
          ) : tabs.isError ? (
            <div role="alert" className="space-y-2">
              <p>Could not load Frequency analyses.</p>
              <Button
                variant="outline"
                onClick={() => {
                  void tabs.refetch();
                }}
              >
                Retry
              </Button>
            </div>
          ) : !tab && create.isPending ? (
            <p role="status">Creating Frequency analysis…</p>
          ) : !tab ? (
            <section aria-label="Frequency" className="space-y-3 p-1">
              <div className="flex items-center gap-2">
                <h1 className="text-body font-semibold">Frequency</h1>
                <HelpIcon targetKey="analysis.token-frequency.tab" label="About Frequency" />
              </div>
              {creationFailed ? (
                <p role="alert">Could not create a Frequency analysis.</p>
              ) : (
                <p className="text-body text-description">
                  Count words in one Data Block or compare two corpora. Results are saved in this
                  project.
                </p>
              )}
              <Button
                disabled={create.isPending || editing}
                onClick={() => {
                  create.mutate();
                }}
              >
                <Plus className="size-4" />
                {creationFailed ? 'Retry' : 'New Frequency analysis'}
              </Button>
            </section>
          ) : (
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
        </div>
      </ScrollArea>
    </div>
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
  tab: api.Tab;
  nodes: api.ProjectNode[];
  tasks: api.NativeTask[];
  active: boolean;
  editing: boolean;
  onCancel: (id: string) => void;
  onOpenConcordance?: () => void;
}) {
  const cache = useQueryClient();
  const analysisId = tab.analysis?.has_result ? tab.analysis.id : null;
  const result = useQuery({
    ...savedAnalysisQuery(cache, base, tab, (id, signal) =>
      api.getFrequencyResult(base, id, signal),
    ),
    enabled: active && Boolean(analysisId),
  });
  const recovery = useAnalysisRecovery(base, analysisId);
  const stored = useFrequencyState((state) => getFrequencyDraft(state, base, tab.id));
  const restored = decodeAnalysisRequest('frequency', tab.analysis?.request);
  const savedInputs = restored.request.inputs;
  const draft: FrequencyDraft = stored ?? {
    inputs: savedInputs,
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
            draft.inputs.find((item) => item.source.name === input.node_id)?.tokenizer ?? '',
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
  const inputRequests = useNodeInputRequests({
    scopeId: base,
    tool: 'token-frequency',
    addNodes: picker.addNodes,
    enabled: active && !editing,
    deferPlacement: Boolean(result.data),
  });
  const tokenizers = useQuery({
    queryKey: ['native', base, 'tokenizers'],
    queryFn: ({ signal }) => api.getTokenizers(base, signal),
    staleTime: Infinity,
  });
  const {
    settings,
    change: changeSettings,
    persist: persistSettings,
  } = useFrequencySettings(base, tab, editing, result.data?.result.payload.corpora ?? []);
  const currentTask = tasks.find((task) => task.tab_id === tab.id && task.finished_at === null);
  const run = useMutation({
    mutationFn: async (request: api.FrequencyRequest) => {
      // Resolve saved positional colours before a new run can change the corpus order.
      if (Array.isArray(tab.settings.colors)) await persistSettings({ colors: settings.colors });
      return api.runFrequency(base, tab.id, request);
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
              {...inputRequests}
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
                changeSettings({
                  colors: {
                    ...settings.colors,
                    [corpusColorKey({ schema: 'data', name })]: color,
                  },
                });
              }}
              onAddNodes={picker.addNodes}
              onRemoveNode={picker.removeNode}
              onClear={picker.clear}
              onColumnChange={picker.setColumn}
              unavailableNodes={draft.inputs
                .filter((input) => !nodes.some((node) => node.table_name === input.source.name))
                .map((input) => ({
                  id: input.source.name,
                  name: input.source.name,
                  column: input.column,
                }))}
              renderColumnAddon={({ nodeId, column }) => (
                <div className="min-w-0">
                  <TokenizerChoice
                    active={active}
                    base={base}
                    source={{ schema: 'data', name: nodeId }}
                    column={column}
                    models={tokenizers.data ?? []}
                    value={
                      draft.inputs.find((input) => input.source.name === nodeId)?.tokenizer ?? ''
                    }
                    onChange={(value) => {
                      changeTokenizer(nodeId, column, value);
                    }}
                  />
                </div>
              )}
              renderExtraNodeContent={({ nodeId }) => (
                <div className="min-w-0">
                  {schemas[selectedNames.indexOf(nodeId)]?.isError && (
                    <p role="alert" className="text-label-secondary text-description">
                      This input is unavailable. Check its source or select another Data Block.
                    </p>
                  )}
                  {draft.inputs.length === 2 && (
                    <Select
                      value={
                        (draft.study ?? draft.inputs[1]?.source.name) === nodeId
                          ? 'study'
                          : 'reference'
                      }
                      onValueChange={(role) => {
                        update({
                          ...draft,
                          study:
                            role === 'study'
                              ? nodeId
                              : (draft.inputs.find((input) => input.source.name !== nodeId)?.source
                                  .name ?? null),
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
                  )}
                </div>
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
            <RequestCompatibilityWarning issues={restored.issues} />
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
                              result.data?.request ?? tab.analysis?.request,
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
            inputRequests={inputRequests}
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
