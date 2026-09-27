import { clearSavedAnalysis, savedAnalysisQuery } from '@/features/project/savedAnalysis';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/features/project/api';
import { schemaQuery } from '@/features/project/projectQueries';
import HelpIcon from '@/components/help/HelpIcon';
import { Button } from '@/components/ui/button';
import { Tabs as ModeTabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tabs } from '../common/Tabs';
import { NodeInputsPanel } from '../common/components/NodeInputsPanel';
import { useNodeInputs } from '../common/nodeInputs/useNodeInputs';
import { useNodeInputRequests } from '../common/nodeInputs/useNodeInputRequests';
import { mapArrowColumnsToInfo } from '@/features/project/data-view/utils/columnTypes';
import { decodeAnalysisRequest, matchesAnalysisRequest } from '../common/analysisRequest';
import { analysisDraftKey } from '../common/analysisDraftStore';
import { RequestCompatibilityWarning } from '../common/components/RequestCompatibilityWarning';
import { AnalysisAction } from '../common/components/AnalysisAction';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { AnalysisResultBoundary } from '../common/components/AnalysisResultBoundary';
import { useAnalysisRecovery } from '../common/useAnalysisRecovery';
import { useTabSettings } from '../common/useTabSettings';
import {
  plotModes,
  plotLabels,
  plotScope,
  usePlotMode,
  usePlotState,
  plotReady,
} from './plotState';
import { PlotParameters } from './PlotParameters';
import { PlotResults } from './PlotResults';
interface Props {
  base: string;
  nodes: api.ProjectNode[];
  tasks: api.NativeTask[];
  active: boolean;
  editing?: boolean;
  onCancel: (id: string) => void;
}
export default function PlotsFeature(props: Props) {
  const mode = usePlotMode((s) => s.modes[props.base] ?? 'trends');
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <ModeTabs
        value={mode}
        onValueChange={(value) => {
          if (plotModes.includes(value as api.PlotMode))
            usePlotMode.getState().setMode(props.base, value as api.PlotMode);
        }}
      >
        <TabsList aria-label="Plot modes" className="h-auto flex-wrap">
          {plotModes.map((value) => (
            <TabsTrigger key={value} value={value}>
              {plotLabels[value]}
            </TabsTrigger>
          ))}
        </TabsList>
      </ModeTabs>
      <PlotTabs key={mode} {...props} mode={mode} />
    </div>
  );
}
function PlotTabs(props: Props & { mode: api.PlotMode }) {
  const scope = plotScope(props.base, props.mode);
  const chosen = usePlotState((s) => s.active[scope]);
  return (
    <Tabs
      {...props}
      kind={props.mode}
      label={plotLabels[props.mode]}
      description="Explore a saved snapshot of a Data Block."
      chosen={chosen}
      onActivate={(id) => {
        usePlotState.getState().activate(scope, id);
      }}
      onRemove={(id) => {
        usePlotState.getState().remove(scope, id);
      }}
    >
      {(tab) => <PlotTab key={tab.id} {...props} tab={tab} />}
    </Tabs>
  );
}
function PlotTab({
  base,
  nodes,
  tasks,
  active,
  editing = false,
  onCancel,
  mode,
  tab,
}: Props & { mode: api.PlotMode; tab: api.Tab }) {
  const cache = useQueryClient();
  const scope = plotScope(base, mode);
  const stored = usePlotState((s) => s.drafts[analysisDraftKey(scope, tab.id)]);
  const restored = decodeAnalysisRequest(mode, tab.analysis?.request);
  const draft = stored ?? restored.request;
  const update = (next: api.PlotRequest) => {
    usePlotState.getState().setDraft(scope, tab.id, next);
  };
  const id = tab.analysis?.has_result ? tab.analysis.id : null;
  const result = useQuery({
    ...savedAnalysisQuery(cache, base, tab, (id, signal) =>
      api.getPlotResult(base, id, mode, signal),
    ),
    enabled: active && Boolean(id),
  });
  const recovery = useAnalysisRecovery(base, id);
  const { settings, change } = useTabSettings(base, tab);
  const schema = useQuery({
    ...schemaQuery(base, draft.source),
    enabled: active && Boolean(draft.source.name),
  });
  const picker = useNodeInputs({
    value: draft.source.name ? [{ node_id: draft.source.name }] : [],
    onChange: (next) => {
      update({ ...draft, source: { schema: 'data', name: next[0]?.node_id ?? '' } });
    },
    allNodes: nodes.map((node) => ({
      id: node.table_name,
      name: node.table_name,
      color: node.color,
      document: node.document_column,
      tokenizerModel: null,
    })),
    getColumnInfos: () => mapArrowColumnsToInfo(schema.data ?? []),
    constraints: { maxNodes: 1, preserveColumnSelection: true },
  });
  const inputs = useNodeInputRequests({
    scopeId: base,
    tool: 'plots',
    addNodes: picker.addNodes,
    enabled: active && !editing,
    deferPlacement: Boolean(id),
  });
  const running = tasks.find((t) => t.tab_id === tab.id && t.finished_at === null);
  const run = useMutation({
    mutationFn: (request: api.PlotRequest) => api.runPlot(base, tab.id, mode, request),
    onSettled: () => cache.invalidateQueries({ queryKey: ['native', base, 'tabs', mode] }),
  });
  const clear = useMutation({
    mutationFn: () => clearSavedAnalysis(cache, base, tab),
  });
  const busy = run.isPending || Boolean(running);
  const matching =
    id &&
    !recovery.failed &&
    !restored.issues.length &&
    matchesAnalysisRequest(mode, draft, result.data?.request ?? tab.analysis?.request);
  const ready = nodes.some((n) => n.table_name === draft.source.name) && plotReady(draft);
  return (
    <>
      <section
        aria-label={`${plotLabels[mode]} request`}
        className="space-y-3 rounded-lg border border-surface-border p-3"
      >
        <h1 className="flex items-center gap-2 font-semibold">
          {plotLabels[mode]} Analysis{' '}
          <HelpIcon targetKey="analysis.plots.parameters" label="Plots help" />
        </h1>
        <NodeInputsPanel
          {...picker}
          {...inputs}
          title="Plot input"
          maxNodes={1}
          inputOrder={draft.source.name ? [draft.source.name] : []}
          onAddNodes={picker.addNodes}
          onRemoveNode={picker.removeNode}
          onClear={picker.clear}
          onColumnChange={picker.setColumn}
          showColumnPicker={false}
          unavailableNodes={
            draft.source.name && !nodes.some((n) => n.table_name === draft.source.name)
              ? [{ id: draft.source.name, name: draft.source.name }]
              : []
          }
        />
        <PlotParameters
          active={active}
          base={base}
          draft={draft}
          fields={(schema.data ?? []).map((c) => c.field)}
          onChange={update}
        />
        <RequestCompatibilityWarning issues={restored.issues} />
        <div className="flex flex-wrap gap-2">
          <AnalysisAction
            reason={
              editing
                ? 'Finish Table editing before running an analysis.'
                : busy
                  ? 'This analysis is already running.'
                  : !ready
                    ? 'Choose the required input and columns first.'
                    : matching
                      ? 'These settings already have saved results. Change the parameters or clear results to run again.'
                      : undefined
            }
            onClick={() => {
              update(draft);
              run.mutate(draft);
            }}
          >
            {recovery.failed || (id && restored.issues.length > 0) ? 'Rerun' : 'Run'}
          </AnalysisAction>
          <Button
            variant="ghost"
            disabled={editing || busy || clear.isPending || !id}
            onClick={() => {
              clear.mutate();
            }}
          >
            Clear results
          </Button>
        </div>
      </section>
      {busy ? (
        <AnalysisProgress
          name={tab.name}
          task={running}
          onCancel={
            running
              ? () => {
                  onCancel(running.id);
                }
              : undefined
          }
        />
      ) : id && (!result.data || result.isError) ? (
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
      ) : id && result.data ? (
        <AnalysisResultBoundary
          base={base}
          analysisId={id}
          name={tab.name}
          onError={recovery.onRenderError}
          onReset={recovery.reset}
        >
          <PlotResults
            key={id}
            base={base}
            mode={mode}
            result={result.data}
            active={active}
            editing={editing}
            settings={settings}
            onSettings={change}
          />
        </AnalysisResultBoundary>
      ) : null}
    </>
  );
}
