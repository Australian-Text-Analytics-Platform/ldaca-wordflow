import { clearSavedAnalysis, savedAnalysisQuery } from '@/features/project/savedAnalysis';
import { decodeAnalysisRequest, matchesAnalysisRequest } from '../common/analysisRequest';
import { RequestCompatibilityWarning } from '../common/components/RequestCompatibilityWarning';
import { useAnalysisRecovery } from '../common/useAnalysisRecovery';
import { AnalysisResultBoundary } from '../common/components/AnalysisResultBoundary';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { AnalysisNumberInput } from '../common/components/AnalysisNumberInput';
import { AnalysisAction } from '../common/components/AnalysisAction';
import { useTabSettings } from '../common/useTabSettings';
import { useAnalysisPreview } from '../common/useAnalysisPreview';
import { VIZ_PALETTE, GREY } from '../common/vizPalette';
import HelpIcon from '@/components/help/HelpIcon';
import { Tabs } from '../common/Tabs';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { NodeInputsPanel } from '../common/components/NodeInputsPanel';
import { useNodeInputs } from '../common/nodeInputs/useNodeInputs';
import { useNodeInputRequests } from '../common/nodeInputs/useNodeInputRequests';
import { TokenizerChoice } from '../common/language/TokenizerChoice';
import { schemaQuery } from '@/features/project/projectQueries';
import { mapArrowColumnsToInfo } from '@/features/project/data-view/utils/columnTypes';
import { isArrowStringField } from '@/lib/arrow/decodeArrowTable';
import * as api from '@/features/project/api';
import { concordanceKey, useConcordanceState } from './concordanceState';
import { ConcordanceResults } from './ConcordanceResults';

interface Props {
  base: string;
  nodes: api.ProjectNode[];
  tasks: api.NativeTask[];
  active: boolean;
  editing?: boolean;
  onCancel: (id: string) => void;
}
export default function ConcordanceFeature(props: Props) {
  const chosen = useConcordanceState((state) => state.active[props.base]);
  return (
    <Tabs
      {...props}
      kind="concordance"
      label="Concordance"
      description="Find words in context and explore their distribution."
      chosen={chosen}
      onActivate={(id) => {
        useConcordanceState.getState().activate(props.base, id);
      }}
      onRemove={(id) => {
        useConcordanceState.getState().remove(props.base, id);
      }}
    >
      {(tab) => <ConcordanceTab key={tab.id} {...props} tab={tab} />}
    </Tabs>
  );
}
function ConcordanceTab({
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
    ...savedAnalysisQuery(cache, base, tab, (id, signal) =>
      api.getConcordanceResult(base, id, signal),
    ),
    enabled: active && Boolean(analysisId),
  });
  const recovery = useAnalysisRecovery(base, analysisId);
  const stored = useConcordanceState((state) => state.drafts[concordanceKey(base, tab.id)]);
  const localPreview = useConcordanceState((state) => state.previews[concordanceKey(base, tab.id)]);
  const discardPreview = useConcordanceState((state) => state.discardPreview);
  const preview = useAnalysisPreview(base, tab.id, active, localPreview, discardPreview);
  const clearPreview = preview.clear;
  const restored = decodeAnalysisRequest('concordance', tab.analysis?.request);
  const draft = stored ?? restored.request;
  const update = (next: api.ConcordanceRequest) => {
    useConcordanceState.getState().setDraft(base, tab.id, next);
  };
  const submitted = preview.submitted ?? null;
  const setSubmitted = (next: { request: api.ConcordanceRequest }) => {
    preview.submit(next.request);
  };
  const view = submitted ? 'preview' : 'saved';
  const names = draft.inputs.map((input) => input.source.name);
  const schemas = useQueries({
    queries: draft.inputs.map((input) => ({ ...schemaQuery(base, input.source), enabled: active })),
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
            draft.inputs.find((item) => item.source.name === input.node_id)?.tokenizer ?? null,
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
    tool: 'concordance',
    addNodes: picker.addNodes,
    enabled: active && !editing,
    deferPlacement: Boolean(result.data ?? submitted),
  });
  const tokenizers = useQuery({
    queryKey: ['native', base, 'tokenizers'],
    queryFn: ({ signal }) => api.getTokenizers(base, signal),
    staleTime: Infinity,
  });
  const currentTask = tasks.find((task) => task.tab_id === tab.id && task.finished_at === null);
  const run = useMutation({
    mutationFn: (request: api.ConcordanceRequest) => api.runConcordance(base, tab.id, request),
    onSettled: () => cache.invalidateQueries({ queryKey: ['native', base, 'tabs', 'concordance'] }),
  });
  const executionTask =
    currentTask ??
    (run.isPending
      ? tasks.find((task) => task.tab_id === tab.id && task.created_at >= run.submittedAt)
      : undefined);
  const clear = useMutation({
    mutationFn: () => clearSavedAnalysis(cache, base, tab),
  });
  const { settings, change: changeSettings } = useTabSettings(base, tab);
  const colors = (settings.colors ?? {}) as Record<string, string>;
  const captured = {
    ...draft,
    search:
      draft.search.mode === 'tokens'
        ? { ...draft.search, regex: false, whole_word: false, ignore_punctuation: false }
        : draft.search,
    inputs: draft.inputs.map((input) => ({
      ...input,
      tokenizer: draft.search.mode === 'text' ? null : input.tokenizer,
      column:
        picker.nodeColumnSelections.find((item) => item.nodeId === input.source.name)?.column ??
        input.column,
    })),
  };
  const ready =
    captured.inputs.length > 0 &&
    Boolean(draft.search.query.trim()) &&
    captured.inputs.every(
      (input) =>
        input.source.schema &&
        input.column &&
        (draft.search.mode === 'text' || input.tokenizer) &&
        nodes.some((node) => node.table_name === input.source.name),
    );
  const search = (patch: Partial<api.ConcordanceSearch>) => {
    update({ ...draft, search: { ...draft.search, ...patch } });
  };
  return (
    <>
      <section
        aria-label="Concordance request"
        className="space-y-3 rounded-lg border border-surface-border p-3"
      >
        <h1 className="flex items-center gap-2 text-body font-semibold">
          Concordance Analysis
          <HelpIcon
            targetKey="analysis.concordance.parameters"
            label="Concordance parameters help"
          />
        </h1>
        {analysisId && !result.data && !stored && !tab.analysis?.request && !result.isError ? (
          <p role="status">Loading saved settings…</p>
        ) : (
          <>
            <NodeInputsPanel
              {...picker}
              {...inputRequests}
              inputOrder={names}
              title="Concordance inputs"
              maxNodes={2}
              onAddNodes={picker.addNodes}
              onRemoveNode={picker.removeNode}
              onClear={picker.clear}
              onColumnChange={picker.setColumn}
              nodeColors={Object.fromEntries(
                draft.inputs.map((input, index) => [
                  input.source.name,
                  colors[api.targetKey(input.source)] ??
                    nodes.find((node) => node.table_name === input.source.name)?.color ??
                    VIZ_PALETTE[index] ??
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
              renderColumnAddon={
                draft.search.mode === 'tokens'
                  ? ({ nodeId, column }) => (
                      <TokenizerChoice
                        active={active}
                        base={base}
                        source={{ schema: 'data', name: nodeId }}
                        column={column}
                        models={tokenizers.data ?? []}
                        value={
                          draft.inputs.find((input) => input.source.name === nodeId)?.tokenizer ??
                          ''
                        }
                        onChange={(tokenizer) => {
                          update({
                            ...draft,
                            inputs: captured.inputs.map((input) =>
                              input.source.name === nodeId ? { ...input, tokenizer } : input,
                            ),
                          });
                        }}
                      />
                    )
                  : undefined
              }
            />
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <span>Search mode</span>
                <div role="group" aria-label="Search mode" className="flex gap-1">
                  {(['text', 'tokens'] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant={draft.search.mode === mode ? 'secondary' : 'ghost'}
                      aria-pressed={draft.search.mode === mode}
                      onClick={() => {
                        search({ mode });
                      }}
                    >
                      {mode === 'text' ? 'Text' : 'Tokens'}
                    </Button>
                  ))}
                </div>
              </div>
              <label className="min-w-40 flex-1 space-y-1">
                <span>Query</span>
                <Input
                  aria-label="Concordance query"
                  placeholder={
                    draft.search.mode === 'tokens'
                      ? 'climate, jobs | housing'
                      : draft.search.regex
                        ? 'climat(e|ic)'
                        : 'climate change'
                  }
                  aria-describedby={`search-help-${tab.id}`}
                  value={draft.search.query}
                  onChange={(event) => {
                    search({ query: event.target.value });
                  }}
                />
              </label>
            </div>
            <p id={`search-help-${tab.id}`} className="text-description text-label-secondary">
              {draft.search.mode === 'tokens'
                ? 'Match exact tokens. Separate alternatives with spaces, commas or |.'
                : draft.search.regex
                  ? 'Search using a regular expression; for example, climat(e|ic).'
                  : 'Search for a word or phrase in the original text.'}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {(['whole_word', 'regex', 'case_sensitive', 'ignore_punctuation'] as const)
                .filter((key) => draft.search.mode === 'text' || key === 'case_sensitive')
                .map((key) => (
                  <label key={key} className="flex items-center gap-2">
                    <Checkbox
                      checked={draft.search[key]}
                      disabled={key === 'whole_word' && draft.search.regex}
                      onCheckedChange={(value) => {
                        search({
                          [key]: value === true,
                          ...(key === 'regex' && value ? { whole_word: false } : {}),
                        });
                      }}
                    />
                    {
                      {
                        whole_word: 'Whole word',
                        regex: 'Regex',
                        case_sensitive: 'Case sensitive',
                        ignore_punctuation: 'Ignore punctuation',
                      }[key]
                    }
                  </label>
                ))}
            </div>
            <div className="flex flex-wrap gap-3">
              {(['left_context', 'right_context'] as const).map((key) => (
                <label key={key} className="space-y-1">
                  <span>{key === 'left_context' ? 'Left context' : 'Right context'} (tokens)</span>
                  <AnalysisNumberInput
                    aria-label={key === 'left_context' ? 'Left context' : 'Right context'}
                    className="w-24"
                    min={0}
                    max={50}
                    value={draft.search[key]}
                    onCommit={(value) => {
                      search({ [key]: value });
                    }}
                  />
                </label>
              ))}
            </div>
            <RequestCompatibilityWarning issues={restored.issues} />
            <div className="flex flex-wrap items-center gap-2">
              <AnalysisAction
                reason={
                  editing
                    ? 'Finish Table editing before running an analysis.'
                    : run.isPending || currentTask
                      ? 'This analysis is already running.'
                      : !ready
                        ? 'Choose the required inputs and search settings first.'
                        : !recovery.failed &&
                            restored.issues.length === 0 &&
                            analysisId &&
                            matchesAnalysisRequest(
                              'concordance',
                              captured,
                              result.data?.request ?? tab.analysis?.request,
                            )
                          ? 'These settings already have saved results. Change the parameters or clear results to run again.'
                          : undefined
                }
                onClick={() => {
                  update(captured);
                  clearPreview();
                  run.mutate(captured);
                }}
              >
                {recovery.failed || (analysisId && restored.issues.length > 0) ? 'Rerun' : 'Run'}
              </AnalysisAction>
              <Button
                variant="ghost"
                disabled={
                  editing ||
                  run.isPending ||
                  Boolean(currentTask) ||
                  clear.isPending ||
                  (!analysisId && !submitted)
                }
                onClick={() => {
                  update(captured);
                  clearPreview();
                  if (analysisId) clear.mutate();
                }}
              >
                Clear results
              </Button>
              <AnalysisAction
                variant="outline"
                reason={
                  editing
                    ? 'Finish Table editing before previewing.'
                    : run.isPending || currentTask
                      ? 'Wait for Run to finish, or cancel it first.'
                      : !ready
                        ? 'Choose the required inputs and search settings first.'
                        : matchesAnalysisRequest('concordance', captured, result.data?.request)
                          ? 'These settings already have saved results. Change the request or clear results to preview again.'
                          : undefined
                }
                onClick={() => {
                  setSubmitted({ request: captured });
                }}
              >
                Preview
              </AnalysisAction>
            </div>
          </>
        )}
      </section>
      {run.isPending || currentTask ? (
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
      ) : view === 'saved' && analysisId && (!result.data || result.isError) ? (
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
      ) : submitted || result.data ? (
        <AnalysisResultBoundary
          base={base}
          analysisId={view === 'saved' ? analysisId : null}
          name={tab.name}
          onError={recovery.onRenderError}
          onReset={recovery.reset}
        >
          <ConcordanceResults
            base={base}
            tab={tab}
            result={result.data ?? undefined}
            submitted={submitted}
            draft={captured}
            active={active}
            stopped={false}
            view={view}
            colors={colors}
            onCancelPreview={clearPreview}
            editing={editing}
            onSettings={changeSettings}
          />
        </AnalysisResultBoundary>
      ) : null}
    </>
  );
}
