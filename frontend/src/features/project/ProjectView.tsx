import { NodeActionsToolbar, NodePinButton } from '@/components/layout/NodeActionsToolbar';
import { ProjectControlsView } from '@/components/layout/ProjectControlsView';
import ProjectNodeList from '@/components/layout/ProjectNodeList';
import { ProjectPanels } from '@/components/layout/ProjectPanels';
import { SidebarView } from '@/components/layout/SidebarView';
import { ThreeColumnLayout } from '@/components/layout/ThreeColumnLayout';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import * as projectApi from '@/features/project/api';
import * as objectsApi from '@/features/project/objects';
import * as editingApi from '@/features/table-editing/api';
import { useEditingNavigation } from '@/features/table-editing/useEditingNavigation';
import {
  InputDestinationChooser,
  useInputDestinations,
} from '@/features/tools/common/inputDestinations';
import type { ToolId } from '@/features/tools/toolIds';
import { TOOL_DEFINITIONS } from '@/features/tools/toolRegistry';
import { usePinnedNodesStore } from '@/stores/pinnedNodesStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useUIStore } from '@/stores/uiStore';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { EditTableDialog } from './EditTableDialog';
import { useGraphState } from './graphState';
import NativeDataView from './NativeDataView';
import { useProjectPreview } from './previewState';
import { reportProjectError } from './projectErrors';
import ProjectGraph from './ProjectGraph';
import { useProjectViewState } from './projectViewState';
import { useRenameWorkspace } from './reconcileRenames';
import { TaskCentre } from './TaskCentre';
import { isTabbedTool, ToolHost } from './ToolHost';
import { useNativeTasks } from './useNativeTasks';
import { ViewSqlDialog } from './ViewSqlDialog';

import { usePreprocessingInputs } from '@/features/tools/preprocessing/inputState';

export type ProjectTool = ToolId;
const isProjectTool = (id: string): id is ProjectTool =>
  TOOL_DEFINITIONS.some((tool) => tool.id === id);

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
  useRenameWorkspace(base);
  const navigate = useEditingNavigation();
  const setActiveTool = (tool: ProjectTool) => {
    navigate(() => {
      changeTool(tool);
    });
  };

  const taskCentre = useNativeTasks(base);
  const preprocessingTool = usePreprocessingInputs((state) => state.activeTool);
  const [hidden, setHidden] = useState<ToolId[]>([]);
  const [editingSql, setEditingSql] = useState<objectsApi.DataTarget | null>(null);
  const [editingTable, setEditingTable] = useState<editingApi.CellEditSession | null>(null);
  const selection = useSelectionStore();
  const preview = useProjectPreview();
  const pins = usePinnedNodesStore();
  const graphMode = useGraphState((state) => state.mode);
  const dependencySelection = useGraphState((state) => state.selected);
  const graph = useQuery({
    queryKey: ['native', base, 'graph', 'logical'],
    queryFn: ({ signal }) => projectApi.graph(base, signal),
  });
  const nodes = graph.data?.nodes ?? [];
  const dependencies = useQuery({
    queryKey: ['native', base, 'graph', 'dependencies'],
    queryFn: ({ signal }) => projectApi.dependencyGraph(base, signal),
    enabled:
      graphMode === 'dependencies' ||
      (preview.active !== null &&
        !nodes.some((n) => objectsApi.sameTarget(n.table_name, preview.active))),
  });
  const dependencyNodes: projectApi.ProjectNode[] = (dependencies.data?.nodes ?? []).map(
    (node) => ({
      ...node,
      table_name: objectsApi.targetKey(node.object),
      label: objectsApi.targetLabel(node.object),
      document_column: null,
    }),
  );
  const dependencyGraph: projectApi.Graph = {
    nodes: dependencyNodes,
    edges: (dependencies.data?.edges ?? []).map((edge) => ({
      source_name: objectsApi.targetKey(edge.source),
      target_name: objectsApi.targetKey(edge.target),
      dependency: true,
    })),
  };
  const isDependencies = graphMode === 'dependencies';
  const graphTarget = (id: string): objectsApi.DataTarget => {
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
  }, [graph.data, base]);
  useEffect(() => {
    if (!dependencies.data) return;
    const keys = new Set(dependencies.data.nodes.map((node) => objectsApi.targetKey(node.object)));
    useGraphState.getState().retain('dependencies', keys);
    useProjectPreview.getState().retainObjects(keys);
    useProjectViewState.getState().retain(keys);
  }, [dependencies.data]);
  const startEditing = useMutation({
    mutationFn: (name: objectsApi.DataTarget) => editingApi.beginCellEdit(base, name),
    onSuccess: setEditingTable,
  });
  const editTable = (name: objectsApi.DataTarget) => {
    if (!startEditing.isPending && !editingTable) startEditing.mutate(name);
  };
  const removeMany = async (ids: objectsApi.DataTarget[]) => {
    const errors: string[] = [];
    for (const id of ids) {
      try {
        await projectApi.deleteNode(base, id);
        const object = objectsApi.objectRef(id);
        if (object.schema === 'data') {
          useSelectionStore.getState().removeNode(object.name);
          usePinnedNodesStore.getState().unpinNode(object.name);
        }
        useGraphState.setState((state) => ({
          selected: state.selected.filter((key) => key !== objectsApi.targetKey(id)),
        }));
        const views = useProjectViewState.getState();
        views.retain(
          new Set([...views.nodes.keys()].filter((key) => key !== objectsApi.targetKey(id))),
        );
        useProjectPreview.getState().remove(id);
      } catch (error) {
        errors.push(
          `${objectsApi.targetLabel(id)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (errors.length)
      reportProjectError(new Error(errors.join('\n\n')), 'Could not delete Data Blocks');
    return errors.length === 0;
  };
  const remove = (id: objectsApi.DataTarget) => removeMany([id]);
  const renamed = useMutation({
    meta: { reportError: false },
    mutationFn: ({ id, name }: { id: objectsApi.DataTarget; name: string }) =>
      projectApi.renameNode(base, id, name),
  });
  const cloned = useMutation({
    mutationFn: (id: objectsApi.DataTarget) => projectApi.cloneNode(base, id),
  });
  const materialized = useMutation({
    mutationFn: (id: objectsApi.DataTarget) => projectApi.materializeNode(base, id),
  });
  const undone = useMutation({
    mutationFn: (id: objectsApi.DataTarget) => projectApi.undoNode(base, id),
  });
  const linked = useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) =>
      projectApi.addLogicalLink(base, source, target),
  });
  const reconnected = useMutation({
    mutationFn: ({
      child,
      source,
      replacement,
    }: {
      child: objectsApi.ObjectRef;
      source: objectsApi.ObjectRef;
      replacement: objectsApi.ObjectRef;
    }) => projectApi.replaceSource(base, child, source, replacement),
  });
  const rename = (id: objectsApi.DataTarget, name: string) => renamed.mutateAsync({ id, name });
  const clone = cloned.mutate;
  const undo = undone.mutate;
  const destinations = useInputDestinations((state) => state.destinations);
  const addInput =
    destinations.some((item) => item.base === base && item.tool === activeTool) &&
    (activeTool === 'export' || (!editingTable && !startEditing.isPending))
      ? (name: string) => useInputDestinations.getState().add(base, activeTool, [graphTarget(name)])
      : undefined;
  const visibleTools = TOOL_DEFINITIONS.map((v) => v.id).filter((id) => !hidden.includes(id));
  return (
    <ThreeColumnLayout
      isTabbedMain={isTabbedTool(activeTool)}
      scrollMain={!isTabbedTool(activeTool) && activeTool !== 'data-loader'}
      hosts={<InputDestinationChooser base={base} tool={activeTool} />}
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
                    ? objectsApi.targetKey(preview.active)
                    : objectsApi.objectRef(preview.active).schema === 'data'
                      ? objectsApi.objectRef(preview.active).name
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
              onRename={(id, next) => rename(graphTarget(id), next)}
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
      <ToolHost
        base={base}
        activeTool={activeTool}
        onToolChange={setActiveTool}
        nodes={nodes}
        tasks={taskCentre.tasks}
        onCancel={taskCentre.cancel}
        exportSelection={
          isDependencies
            ? dependencyNodes
                .filter((node) =>
                  dependencySelection.includes(
                    objectsApi.targetKey(node.object ?? node.table_name),
                  ),
                )
                .map((node) => objectsApi.objectRef(node.object ?? node.table_name))
            : selection.selectedNodeIds.map(objectsApi.objectRef)
        }
      />
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
          key={objectsApi.targetKey(editingSql)}
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
