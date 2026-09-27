import { useMutation, useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import { NodeActionsToolbar, NodePinButton } from '@/components/layout/NodeActionsToolbar';
import { ProjectControlsView } from '@/components/layout/ProjectControlsView';
import ProjectNodeList from '@/components/layout/ProjectNodeList';
import { ProjectPanels } from '@/components/layout/ProjectPanels';
import { SidebarView } from '@/components/layout/SidebarView';
import { ThreeColumnLayout } from '@/components/layout/ThreeColumnLayout';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useEditingNavigation } from '@/features/table-editing/useEditingNavigation';
import { useAnnotationState } from '@/features/tools/annotation/annotationState';
import type { ToolId } from '@/features/tools/toolIds';
import { TOOL_DEFINITIONS } from '@/features/tools/toolRegistry';
import { usePinnedNodesStore } from '@/stores/pinnedNodesStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useUIStore } from '@/stores/uiStore';
import * as api from './api';
import { DataLoaderWorkspace } from './DataLoaderWorkspace';
import { EditTableDialog } from './EditTableDialog';
import { useGraphState } from './graphState';
import NativeDataView from './NativeDataView';
import ProjectGraph from './ProjectGraph';
import { useProjectPreview } from './previewState';
import { reportProjectError } from './projectErrors';
import { useProjectViewState } from './projectViewState';
import { TaskCentre } from './TaskCentre';
import { useNativeTasks } from './useNativeTasks';
import { ViewSqlDialog } from './ViewSqlDialog';

const DataPreprocessingFeature = lazy(
  () => import('@/features/tools/preprocessing/DataPreprocessingFeature'),
);
const TokenFrequencyFeature = lazy(
  () => import('@/features/tools/token-frequency/TokenFrequencyFeature'),
);

import { NodeInputPointerCarrier } from '@/components/layout/NodeInputPointerCarrier';
import { usePreprocessingInputs } from '@/features/tools/preprocessing/inputState';
import { useFrequencyState } from '@/features/tools/token-frequency/frequencyState';
import {
  type NodeInputPointerPosition,
  useNodeInputRequestsStore,
} from '@/stores/nodeInputRequestsStore';

const ExportFeature = lazy(() => import('@/features/tools/export/ExportFeature'));
const AnnotationFeature = lazy(() => import('@/features/tools/annotation/AnnotationFeature'));
const PlotsFeature = lazy(() => import('@/features/tools/plots/PlotsFeature'));
const TopicModelingFeature = lazy(
  () => import('@/features/tools/topic-modeling/TopicModelingFeature'),
);

import { useTopicState } from '@/features/tools/topic-modeling/topicState';

const QuotationFeature = lazy(() => import('@/features/tools/quotation/QuotationFeature'));
const ConcordanceFeature = lazy(() => import('@/features/tools/concordance/ConcordanceFeature'));

import { useConcordanceState } from '@/features/tools/concordance/concordanceState';
import { useQuotationState } from '@/features/tools/quotation/quotationState';

export type ProjectTool =
  | 'data-loader'
  | 'filter'
  | 'token-frequency'
  | 'concordance'
  | 'quotation'
  | 'topic-modeling'
  | 'plots'
  | 'annotation'
  | 'export';
const isProjectTool = (id: string): id is ProjectTool =>
  [
    'data-loader',
    'filter',
    'token-frequency',
    'concordance',
    'quotation',
    'topic-modeling',
    'plots',
    'annotation',
    'export',
  ].includes(id);

interface ProjectViewProps {
  base: string;
  activeTool: ProjectTool;
  setActiveTool: (tool: ProjectTool) => void;
}
export default function ProjectView(props: ProjectViewProps) {
  return <ProjectViewContent {...props} />;
}
function ProjectViewContent({
  base,
  activeTool,
  setActiveTool: changeTool,
}: {
  base: string;
  activeTool: ProjectTool;
  setActiveTool: (tool: ProjectTool) => void;
}) {
  const navigate = useEditingNavigation();
  const setActiveTool = (tool: ProjectTool) => {
    navigate(() => {
      if (tool === 'annotation') setAnnotationOpened(true);
      if (tool === 'export') setExportOpened(true);
      changeTool(tool);
    });
  };
  const annotationTab = useAnnotationState((s) => s.active[base]);
  const [exportOpened, setExportOpened] = useState(false);
  const [annotationOpened, setAnnotationOpened] = useState(false);

  const taskCentre = useNativeTasks(base);
  const [preprocessingOpened, setPreprocessingOpened] = useState(false);
  const [frequencyOpened, setFrequencyOpened] = useState(false);
  const [plotsOpened, setPlotsOpened] = useState(false);
  const [topicOpened, setTopicOpened] = useState(false);
  const topicTab = useTopicState((s) => s.active[base]);
  const [quotationOpened, setQuotationOpened] = useState(false);
  const quotationTab = useQuotationState((s) => s.active[base]);
  const [concordanceOpened, setConcordanceOpened] = useState(false);
  const concordanceTab = useConcordanceState((state) => state.active[base]);
  const frequencyTab = useFrequencyState((state) => state.active[base]);
  const preprocessingTool = usePreprocessingInputs((state) => state.activeTool);
  const [hidden, setHidden] = useState<ToolId[]>([]);
  const [editingSql, setEditingSql] = useState<api.DataTarget | null>(null);
  const [editingTable, setEditingTable] = useState<api.CellEditSession | null>(null);
  const selection = useSelectionStore();
  const preview = useProjectPreview();
  const pins = usePinnedNodesStore();
  const graphMode = useGraphState((state) => state.mode);
  const dependencySelection = useGraphState((state) => state.selected);
  const graph = useQuery({
    queryKey: ['native', base, 'graph', 'logical'],
    queryFn: ({ signal }) => api.graph(base, signal),
  });
  const nodes = graph.data?.nodes ?? [];
  const dependencies = useQuery({
    queryKey: ['native', base, 'graph', 'dependencies'],
    queryFn: ({ signal }) => api.dependencyGraph(base, signal),
    enabled:
      graphMode === 'dependencies' ||
      (preview.active !== null && !nodes.some((n) => api.sameTarget(n.table_name, preview.active))),
  });
  const dependencyNodes: api.ProjectNode[] = (dependencies.data?.nodes ?? []).map((node) => ({
    ...node,
    table_name: api.targetKey(node.object),
    label: api.targetLabel(node.object),
    document_column: null,
  }));
  const dependencyGraph: api.Graph = {
    nodes: dependencyNodes,
    edges: (dependencies.data?.edges ?? []).map((edge) => ({
      source_name: api.targetKey(edge.source),
      target_name: api.targetKey(edge.target),
      dependency: true,
    })),
  };
  const isDependencies = graphMode === 'dependencies';
  const graphTarget = (id: string): api.DataTarget => {
    if (!isDependencies) return id;
    const object = dependencyNodes.find((node) => node.table_name === id)?.object;
    if (!object) throw new Error('Database object is no longer in this graph');
    return object;
  };
  const list = nodes.map((n) => ({ id: n.table_name, name: n.table_name, color: n.color }));
  useEffect(() => {
    if (!graph.data) return;
    const valid = new Set(graph.data.nodes.map((node) => node.table_name));
    const current = useSelectionStore.getState();
    if (current.selectedNodeIds.some((id) => !valid.has(id)))
      current.replaceSelectedNodes(current.selectedNodeIds.filter((id) => valid.has(id)));
    const pinned = usePinnedNodesStore.getState();
    if (pinned.pinnedNodeIds.some((id) => !valid.has(id)))
      usePinnedNodesStore.setState({
        pinnedNodeIds: pinned.pinnedNodeIds.filter((id) => valid.has(id)),
      });
    useProjectPreview.getState().retain(valid);
    useGraphState.getState().retain('logical', valid);
    usePreprocessingInputs.getState().retain(valid);
    useNodeInputRequestsStore.getState().prune(base, [...valid]);
  }, [graph.data, base]);
  useEffect(() => {
    if (!dependencies.data) return;
    const keys = new Set(dependencies.data.nodes.map((node) => api.targetKey(node.object)));
    useGraphState.getState().retain('dependencies', keys);
    useProjectPreview.getState().retainObjects(keys);
    useProjectViewState.getState().retain(keys);
  }, [dependencies.data]);
  const startEditing = useMutation({
    mutationFn: (name: api.DataTarget) => api.beginCellEdit(base, name),
    onSuccess: setEditingTable,
  });
  const editTable = (name: api.DataTarget) => {
    if (!startEditing.isPending && !editingTable) startEditing.mutate(name);
  };
  const removeMany = async (ids: api.DataTarget[]) => {
    const errors: string[] = [];
    for (const id of ids) {
      try {
        await api.deleteNode(base, id);
        const object = api.objectRef(id);
        if (object.schema === 'data') {
          useSelectionStore.getState().removeNode(object.name);
          usePinnedNodesStore.getState().unpinNode(object.name);
        }
        useGraphState.setState((state) => ({
          selected: state.selected.filter((key) => key !== api.targetKey(id)),
        }));
        const views = useProjectViewState.getState();
        views.retain(new Set([...views.nodes.keys()].filter((key) => key !== api.targetKey(id))));
        useProjectPreview.getState().remove(id);
      } catch (error) {
        errors.push(
          `${api.targetLabel(id)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (errors.length)
      reportProjectError(new Error(errors.join('\n\n')), 'Could not delete Data Blocks');
    return errors.length === 0;
  };
  const remove = (id: api.DataTarget) => removeMany([id]);
  const renamed = useMutation({
    mutationFn: ({ id, name }: { id: api.DataTarget; name: string }) =>
      api.renameNode(base, id, name),
    onSuccess: (result, { id }) => {
      const name = result.table_name;
      const object = api.objectRef(id);
      const next = { schema: object.schema, name };
      if (object.schema === 'data') {
        const current = useSelectionStore.getState();
        current.replaceSelectedNodes(
          current.selectedNodeIds.map((value) => (value === object.name ? name : value)),
        );
        const pinned = usePinnedNodesStore.getState();
        usePinnedNodesStore.setState({
          pinnedNodeIds: pinned.pinnedNodeIds.map((value) =>
            value === object.name ? name : value,
          ),
        });
        usePreprocessingInputs.getState().rename(object.name, name);
        useFrequencyState.getState().renameSource(base, object.name, name);
        useNodeInputRequestsStore.getState().rename(base, object.name, name);
      }
      useProjectPreview.getState().rename(id, typeof id === 'string' ? name : next);
      useProjectViewState.getState().rename(api.targetKey(id), api.targetKey(next));
      useGraphState.getState().rename(id, next);
    },
  });
  const cloned = useMutation({
    mutationFn: (id: api.DataTarget) => api.cloneNode(base, id),
  });
  const materialized = useMutation({
    mutationFn: (id: api.DataTarget) => api.materializeNode(base, id),
  });
  const undone = useMutation({
    mutationFn: (id: api.DataTarget) => api.undoNode(base, id),
  });
  const linked = useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) =>
      api.addLogicalLink(base, source, target),
  });
  const reconnected = useMutation({
    mutationFn: ({
      child,
      source,
      replacement,
    }: {
      child: api.ObjectRef;
      source: api.ObjectRef;
      replacement: api.ObjectRef;
    }) => api.replaceSource(base, child, source, replacement),
  });
  const rename = (id: api.DataTarget, name: string) => {
    renamed.mutate({ id, name });
  };
  const clone = cloned.mutate;
  const undo = undone.mutate;
  const inputTool =
    activeTool === 'export'
      ? 'export'
      : activeTool === 'annotation' && annotationTab
        ? 'annotation'
        : activeTool === 'topic-modeling' && topicTab
          ? 'topic-modeling'
          : activeTool === 'plots'
            ? 'plots'
            : activeTool === 'filter'
              ? preprocessingTool
              : activeTool === 'token-frequency' && frequencyTab
                ? 'token-frequency'
                : activeTool === 'concordance' && concordanceTab
                  ? 'concordance'
                  : activeTool === 'quotation' && quotationTab
                    ? 'quotation'
                    : null;
  const addInput =
    inputTool && (inputTool === 'export' || (!editingTable && !startEditing.isPending))
      ? (name: string, pointer?: NodeInputPointerPosition) => {
          useNodeInputRequestsStore.getState().requestAdd(base, inputTool, name, pointer);
        }
      : undefined;
  const visibleTools = TOOL_DEFINITIONS.map((v) => v.id).filter((id) => !hidden.includes(id));
  return (
    <ThreeColumnLayout
      isTabbedMain={
        activeTool === 'token-frequency' ||
        activeTool === 'concordance' ||
        activeTool === 'quotation' ||
        activeTool === 'plots' ||
        activeTool === 'topic-modeling' ||
        activeTool === 'annotation'
      }
      scrollMain={
        activeTool !== 'data-loader' &&
        activeTool !== 'token-frequency' &&
        activeTool !== 'concordance' &&
        activeTool !== 'quotation' &&
        activeTool !== 'plots' &&
        activeTool !== 'topic-modeling' &&
        activeTool !== 'annotation'
      }
      hosts={
        <NodeInputPointerCarrier scopeId={base} tool={addInput ? inputTool : null} nodes={list} />
      }
      sidebar={
        <SidebarView
          onFeedback={() => {
            useUIStore
              .getState()
              .openFeedback(
                activeTool === 'filter' ? `preprocessing.${preprocessingTool}` : activeTool,
              );
          }}
          visibleTools={visibleTools}
          setToolHidden={(id, hide) => {
            setHidden((previous) => (hide ? [...previous, id] : previous.filter((v) => v !== id)));
          }}
          nodeCount={nodes.length}
          selectedCount={selection.selectedNodeIds.length}
          clearSelection={selection.clearSelection}
          toolsContent={
            <SidebarMenu>
              {TOOL_DEFINITIONS.filter((v) => visibleTools.includes(v.id)).map((tool) => (
                <SidebarMenuItem key={tool.id}>
                  <SidebarMenuButton
                    isActive={tool.id === activeTool}
                    onClick={() => {
                      if (isProjectTool(tool.id)) {
                        setActiveTool(tool.id);
                        if (tool.id === 'filter') setPreprocessingOpened(true);
                        if (tool.id === 'token-frequency') setFrequencyOpened(true);
                        if (tool.id === 'plots') setPlotsOpened(true);
                        if (tool.id === 'concordance') setConcordanceOpened(true);
                        if (tool.id === 'quotation') setQuotationOpened(true);
                        if (tool.id === 'topic-modeling') setTopicOpened(true);
                      }
                    }}
                    disabled={!isProjectTool(tool.id)}
                    tooltip={
                      isProjectTool(tool.id)
                        ? undefined
                        : 'Analysis execution is not available on desktop yet'
                    }
                  >
                    <tool.icon />
                    <span>{tool.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          }
          nodesContent={
            <ProjectNodeList
              nodes={list}
              selectedNodeIds={selection.selectedNodeIds}
              onToggleNodeSelection={(id) => {
                const current = useSelectionStore.getState();
                const selecting = !current.selectedNodeIds.includes(id);
                current.toggleNode(id);
                if (selecting) useProjectPreview.getState().open(id);
              }}
              renderPinnedRowAction={(node) => (
                <NodePinButton
                  node={node}
                  isPinned={pins.pinnedNodeIds.includes(node.id)}
                  onTogglePin={pins.togglePinnedNode}
                />
              )}
              renderRowActions={(node) => (
                <NodeActionsToolbar
                  node={node}
                  isPinned={pins.pinnedNodeIds.includes(node.id)}
                  onTogglePin={pins.togglePinnedNode}
                  inputsDisabled={!addInput}
                  onAddToSelection={addInput}
                  onRename={rename}
                  onMaterialize={
                    nodes.find((n) => n.table_name === node.id)?.kind === 'view'
                      ? materialized.mutate
                      : undefined
                  }
                  onClone={clone}
                  onEditTable={
                    nodes.find((n) => n.table_name === node.id)?.kind === 'table'
                      ? editTable
                      : undefined
                  }
                  onEditSql={
                    nodes.find((n) => n.table_name === node.id)?.kind === 'view'
                      ? setEditingSql
                      : undefined
                  }
                  onDelete={(id) => {
                    void remove(id);
                  }}
                />
              )}
            />
          }
          tasksContent={<TaskCentre {...taskCentre} />}
        />
      }
      rightPanel={(collapsed, toggle) => (
        <ProjectPanels
          collapsed={collapsed}
          onToggleCollapse={toggle}
          controls={<ProjectControlsView onToggleCollapse={toggle} />}
          graph={
            <ProjectGraph
              key={graphMode}
              mode={graphMode}
              onToggleDependencies={() => {
                useGraphState.setState({ mode: isDependencies ? 'logical' : 'dependencies' });
              }}
              loading={isDependencies ? dependencies.isLoading : graph.isLoading}
              error={isDependencies ? dependencies.error : graph.error}
              retry={() => {
                void (isDependencies ? dependencies.refetch() : graph.refetch());
              }}
              graph={isDependencies ? dependencyGraph : (graph.data ?? { nodes: [], edges: [] })}
              base={base}
              selected={isDependencies ? dependencySelection : selection.selectedNodeIds}
              onSelect={(id) => {
                if (isDependencies)
                  useGraphState.setState((state) => ({
                    selected: state.selected.includes(id)
                      ? state.selected.filter((key) => key !== id)
                      : [...state.selected, id],
                  }));
                else selection.toggleNode(id);
              }}
              previewed={
                preview.active === null
                  ? null
                  : isDependencies
                    ? api.targetKey(preview.active)
                    : api.objectRef(preview.active).schema === 'data'
                      ? api.objectRef(preview.active).name
                      : null
              }
              onPreview={(id) => {
                preview.toggle(graphTarget(id));
              }}
              onAddToSelection={isDependencies ? undefined : addInput}
              onLogicalLink={(source, target) => {
                linked.mutate({ source, target });
              }}
              onReplaceSource={(child, source, replacement) => {
                reconnected.mutate({ child, source, replacement });
              }}
              onClear={() => {
                if (isDependencies) useGraphState.setState({ selected: [] });
                else selection.clearSelection();
              }}
              onDelete={(id) => remove(graphTarget(id))}
              onDeleteMany={(ids) => removeMany(ids.map(graphTarget))}
              onRename={(id, next) => {
                rename(graphTarget(id), next);
              }}
              onClone={(id) => {
                clone(graphTarget(id));
              }}
              onUndo={(id) => {
                undo(graphTarget(id));
              }}
              onMaterialize={(id) => {
                materialized.mutate(graphTarget(id));
              }}
              onEditSql={(id) => {
                setEditingSql(graphTarget(id));
              }}
              onEditTable={(id) => {
                editTable(graphTarget(id));
              }}
            />
          }
          table={
            preview.active !== null && (
              <NativeDataView
                base={base}
                nodes={[...nodes, ...dependencyNodes]}
                logical={!isDependencies}
                name={preview.active}
                onClose={preview.close}
                rename={rename}
                undo={undo}
              />
            )
          }
        />
      )}
    >
      <div className="w-full min-w-0" hidden={activeTool !== 'export'}>
        {(exportOpened || activeTool === 'export') && (
          <Suspense fallback={<div className="p-4">Loading Export…</div>}>
            <ExportFeature
              base={base}
              nodes={nodes}
              active={activeTool === 'export'}
              graphSelection={
                isDependencies
                  ? dependencyNodes
                      .filter((node) =>
                        dependencySelection.includes(api.targetKey(node.object ?? node.table_name)),
                      )
                      .map((node) => api.objectRef(node.object ?? node.table_name))
                  : selection.selectedNodeIds.map(api.objectRef)
              }
            />
          </Suspense>
        )}
      </div>
      <div hidden={activeTool !== 'data-loader'} className="w-full min-h-0">
        <DataLoaderWorkspace
          active={activeTool === 'data-loader'}
          base={base}
          onActivate={() => {
            setActiveTool('data-loader');
          }}
        />
      </div>
      <div className="w-full min-w-0" hidden={activeTool !== 'filter'}>
        {preprocessingOpened && (
          <Suspense fallback={<p>Loading preprocessing…</p>}>
            <DataPreprocessingFeature base={base} nodes={nodes} active={activeTool === 'filter'} />
          </Suspense>
        )}
      </div>
      <div className="h-full min-h-0 w-full min-w-0" hidden={activeTool !== 'token-frequency'}>
        {frequencyOpened && (
          <Suspense fallback={<p>Loading Frequency…</p>}>
            <TokenFrequencyFeature
              onOpenConcordance={() => {
                setConcordanceOpened(true);
                setActiveTool('concordance');
              }}
              base={base}
              nodes={nodes}
              tasks={taskCentre.tasks}
              onCancel={taskCentre.cancel}
              active={activeTool === 'token-frequency'}
            />
          </Suspense>
        )}
      </div>
      <div className="h-full min-h-0 w-full min-w-0" hidden={activeTool !== 'quotation'}>
        {(quotationOpened || activeTool === 'quotation') && (
          <Suspense fallback={<p>Loading Quotation…</p>}>
            <QuotationFeature
              base={base}
              nodes={nodes}
              tasks={taskCentre.tasks}
              active={activeTool === 'quotation'}
              onCancel={taskCentre.cancel}
            />
          </Suspense>
        )}
      </div>
      <div className="h-full min-h-0 w-full min-w-0" hidden={activeTool !== 'concordance'}>
        {(concordanceOpened || activeTool === 'concordance') && (
          <Suspense fallback={<p>Loading Concordance…</p>}>
            <ConcordanceFeature
              base={base}
              nodes={nodes}
              tasks={taskCentre.tasks}
              onCancel={taskCentre.cancel}
              active={activeTool === 'concordance'}
            />
          </Suspense>
        )}
      </div>
      <div className="h-full min-h-0 w-full min-w-0" hidden={activeTool !== 'plots'}>
        {(plotsOpened || activeTool === 'plots') && (
          <Suspense fallback={<p>Loading Plots…</p>}>
            <PlotsFeature
              base={base}
              nodes={nodes}
              tasks={taskCentre.tasks}
              onCancel={taskCentre.cancel}
              active={activeTool === 'plots'}
            />
          </Suspense>
        )}
      </div>
      <div className="h-full min-h-0 w-full min-w-0" hidden={activeTool !== 'topic-modeling'}>
        {(topicOpened || activeTool === 'topic-modeling') && (
          <Suspense fallback={<p>Loading Topic Modelling…</p>}>
            <TopicModelingFeature
              base={base}
              nodes={nodes}
              tasks={taskCentre.tasks}
              onCancel={taskCentre.cancel}
              active={activeTool === 'topic-modeling'}
            />
          </Suspense>
        )}
      </div>
      <div className="h-full min-h-0 w-full min-w-0" hidden={activeTool !== 'annotation'}>
        {(annotationOpened || activeTool === 'annotation') && (
          <Suspense fallback={<p>Loading Annotation…</p>}>
            <AnnotationFeature
              base={base}
              nodes={nodes}
              tasks={taskCentre.tasks}
              onCancel={taskCentre.cancel}
              active={activeTool === 'annotation'}
            />
          </Suspense>
        )}
      </div>
      {editingTable && (
        <EditTableDialog
          key={editingTable.session_id}
          base={base}
          session={editingTable}
          onFinished={() => {
            setEditingTable(null);
          }}
        />
      )}
      {editingSql !== null && (
        <ViewSqlDialog
          key={api.targetKey(editingSql)}
          base={base}
          name={editingSql}
          onClose={() => {
            setEditingSql(null);
          }}
        />
      )}
    </ThreeColumnLayout>
  );
}
