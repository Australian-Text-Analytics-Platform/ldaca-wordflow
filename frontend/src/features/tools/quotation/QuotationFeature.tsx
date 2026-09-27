import { clearSavedAnalysis, savedAnalysisQuery } from '@/features/project/savedAnalysis';
import { decodeAnalysisRequest, matchesAnalysisRequest } from '../common/analysisRequest';
import { RequestCompatibilityWarning } from '../common/components/RequestCompatibilityWarning';
import { useAnalysisRecovery } from '../common/useAnalysisRecovery';
import { AnalysisResultBoundary } from '../common/components/AnalysisResultBoundary';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { AnalysisAction } from '../common/components/AnalysisAction';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import * as api from '@/features/project/api';
import { schemaQuery } from '@/features/project/projectQueries';
import { Button } from '@/components/ui/button';
import HelpIcon from '@/components/help/HelpIcon';
import { Tabs } from '../common/Tabs';
import { analysisDraftKey } from '../common/analysisDraftStore';
import { useTabSettings } from '../common/useTabSettings';
import { useAnalysisPreview } from '../common/useAnalysisPreview';
import { NodeInputsPanel } from '../common/components/NodeInputsPanel';
import { useNodeInputs } from '../common/nodeInputs/useNodeInputs';
import { useNodeInputRequests } from '../common/nodeInputs/useNodeInputRequests';
import { mapArrowColumnsToInfo } from '@/features/project/data-view/utils/columnTypes';
import { isArrowStringField } from '@/lib/arrow/decodeArrowTable';
import { VIZ_PALETTE, GREY } from '../common/vizPalette';
import { emptyQuotation, useQuotationState } from './quotationState';
import { QuotationResults } from './QuotationResults';
interface Props {
  base: string;
  nodes: api.ProjectNode[];
  tasks: api.NativeTask[];
  active: boolean;
  editing?: boolean;
  onCancel: (id: string) => void;
}
export default function QuotationFeature(props: Props) {
  const chosen = useQuotationState((s) => s.active[props.base]);
  return (
    <Tabs
      {...props}
      kind="quotation"
      label="Quotation"
      description="Extract quotations, speakers and reporting verbs from English documents."
      chosen={chosen}
      onActivate={(id) => {
        useQuotationState.getState().activate(props.base, id);
      }}
      onRemove={(id) => {
        useQuotationState.getState().remove(props.base, id);
      }}
    >
      {(tab) => <QuotationTab key={tab.id} {...props} tab={tab} />}
    </Tabs>
  );
}
function QuotationTab({
  base,
  nodes,
  tasks,
  active,
  editing = false,
  onCancel,
  tab,
}: Props & { tab: api.Tab }) {
  const cache = useQueryClient();
  const key = analysisDraftKey(base, tab.id);
  const analysisId = tab.analysis?.has_result ? tab.analysis.id : null;
  const result = useQuery({
    ...savedAnalysisQuery(cache, base, tab, (id, signal) =>
      api.getQuotationResult(base, id, signal),
    ),
    enabled: active && Boolean(analysisId),
  });
  const recovery = useAnalysisRecovery(base, analysisId);
  const stored = useQuotationState((s) => s.drafts[key]);
  const localPreview = useQuotationState((s) => s.previews[key]);
  const discardPreview = useQuotationState((state) => state.discardPreview);
  const preview = useAnalysisPreview(base, tab.id, active, localPreview, discardPreview);
  const clearPreview = preview.clear;
  const restored = decodeAnalysisRequest('quotation', tab.analysis?.request);
  const draft = stored ?? restored.request;
  const submitted = preview.submitted;
  const update = (value: api.QuotationRequest) => {
    useQuotationState.getState().setDraft(base, tab.id, value);
  };
  const view = submitted ? 'preview' : 'saved';
  const schema = useQuery({
    ...schemaQuery(base, draft.input.source),
    enabled: active && Boolean(draft.input.source.name),
  });
  const picker = useNodeInputs({
    value: draft.input.source.name
      ? [{ node_id: draft.input.source.name, column: draft.input.column }]
      : [],
    onChange: (next) => {
      update(
        next[0]
          ? {
              input: {
                source: { schema: 'data', name: next[0].node_id },
                column: next[0].column ?? '',
              },
            }
          : emptyQuotation,
      );
    },
    allNodes: nodes.map((node) => ({
      id: node.table_name,
      name: node.table_name,
      color: node.color,
      document: node.document_column,
      tokenizerModel: null,
    })),
    getColumnInfos: () => mapArrowColumnsToInfo(schema.data ?? []),
    constraints: { maxNodes: 1, fieldPredicate: isArrowStringField, preserveColumnSelection: true },
  });
  const inputs = useNodeInputRequests({
    scopeId: base,
    tool: 'quotation',
    addNodes: picker.addNodes,
    enabled: active && !editing,
    deferPlacement: Boolean(result.data ?? submitted),
  });
  const { settings, change } = useTabSettings(base, tab);
  const color =
    typeof settings.color === 'string'
      ? settings.color
      : (nodes.find((node) => node.table_name === draft.input.source.name)?.color ??
        VIZ_PALETTE[0] ??
        GREY);
  const captured = {
    input: { ...draft.input, column: picker.nodeColumnSelections[0]?.column ?? draft.input.column },
  };
  const ready = Boolean(
    captured.input.source.schema &&
      captured.input.column &&
      nodes.some((node) => node.table_name === captured.input.source.name),
  );
  const running = tasks.find((task) => task.tab_id === tab.id && task.finished_at === null);
  const run = useMutation({
    mutationFn: (request: api.QuotationRequest) => api.runQuotation(base, tab.id, request),
    onSettled: () => cache.invalidateQueries({ queryKey: ['native', base, 'tabs', 'quotation'] }),
  });
  const executionTask =
    running ??
    (run.isPending
      ? tasks.find((task) => task.tab_id === tab.id && task.created_at >= run.submittedAt)
      : undefined);
  const clear = useMutation({
    mutationFn: () => clearSavedAnalysis(cache, base, tab),
  });
  return (
    <>
      <section
        aria-label="Quotation request"
        className="space-y-3 rounded-lg border border-surface-border p-3"
      >
        <h1 className="flex items-center gap-2 font-semibold">
          Quotation Analysis{' '}
          <HelpIcon targetKey="analysis.quotation.parameters" label="Quotation parameters help" />
        </h1>
        {analysisId && !result.data && !stored && !tab.analysis?.request && !result.isError ? (
          <p role="status">Loading saved settings…</p>
        ) : (
          <>
            <NodeInputsPanel
              {...picker}
              {...inputs}
              title="Quotation input"
              maxNodes={1}
              inputOrder={draft.input.source.name ? [draft.input.source.name] : []}
              onAddNodes={picker.addNodes}
              onRemoveNode={picker.removeNode}
              onClear={picker.clear}
              onColumnChange={picker.setColumn}
              nodeColors={{ [draft.input.source.name]: color }}
              onNodeColorChange={(_, value) => {
                change({ color: value });
              }}
              unavailableNodes={
                draft.input.source.name &&
                !nodes.some((node) => node.table_name === draft.input.source.name)
                  ? [
                      {
                        id: draft.input.source.name,
                        name: draft.input.source.name,
                        column: draft.input.column,
                      },
                    ]
                  : []
              }
            />
            <p className="text-label-secondary text-description">
              Built-in English extractor · The pinned language model is downloaded on first use and
              reused offline.
            </p>
            <RequestCompatibilityWarning issues={restored.issues} />
            <div className="flex flex-wrap items-center gap-2">
              <AnalysisAction
                reason={
                  editing
                    ? 'Finish Table editing before running an analysis.'
                    : run.isPending || running
                      ? 'This analysis is already running.'
                      : !ready
                        ? 'Choose the required inputs and search settings first.'
                        : !recovery.failed &&
                            restored.issues.length === 0 &&
                            analysisId &&
                            matchesAnalysisRequest(
                              'quotation',
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
                  Boolean(running) ||
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
                    : run.isPending || running
                      ? 'Wait for Run to finish, or cancel it first.'
                      : !ready
                        ? 'Choose the required inputs and search settings first.'
                        : matchesAnalysisRequest('quotation', captured, result.data?.request)
                          ? 'These settings already have saved results. Change the request or clear results to preview again.'
                          : undefined
                }
                onClick={() => {
                  preview.submit(captured);
                }}
              >
                Preview
              </AnalysisAction>
            </div>
          </>
        )}
      </section>
      {run.isPending || running ? (
        <AnalysisProgress
          name={tab.name}
          task={executionTask}
          message={executionTask?.state === 'succeeded' ? 'Loading results…' : undefined}
          onCancel={
            running
              ? () => {
                  onCancel(running.id);
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
          <QuotationResults
            base={base}
            tab={tab}
            active={active}
            submitted={submitted}
            draft={captured}
            result={result.data ?? undefined}
            view={view}
            stopped={false}
            settings={settings}
            onSettings={change}
            color={color}
            onCancelPreview={clearPreview}
            editing={editing}
          />
        </AnalysisResultBoundary>
      ) : null}
    </>
  );
}
