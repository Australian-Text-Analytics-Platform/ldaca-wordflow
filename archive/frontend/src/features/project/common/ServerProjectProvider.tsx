import { useMemo, type ReactNode } from 'react';
import { useProjectInternal } from './hooks/useProjectInternal';
import {
  ProjectActionsContext,
  ProjectDataContext,
  ProjectSelectionContext,
  ProjectStatusContext,
} from './ServerProjectContext';

/**
 * Renders four nested context providers, one per slice. Each slice value
 * is memoized on its underlying primitives so the providers only push a
 * new value when something in *that* slice actually changed; the action
 * surface (~30 consumers, biggest re-render multiplier) stays referentially
 * stable across data/selection churn.
 *
 * Internally everything still flows through `useProjectInternal` so the
 * sub-hooks (core / queries / mutations) keep their orchestration in one
 * place; the provider's only job is to fan-out into the four contexts.
 * Rendered by `ServerProjectShell` so project descendants can subscribe to individual slices.
 * Flow: composed hooks build data, selection, status, and action slices so descendants subscribe only to the project state they use.
 */
export const ServerProjectProvider = ({ children }: { children: ReactNode }) => {
  const ws = useProjectInternal();

  const dataValue = useMemo(
    () => ({
      projectCatalogue: ws.projectCatalogue,
      projects: ws.projects,
      currentProject: ws.currentProject,
      currentProjectId: ws.currentProjectId,
      nodes: ws.nodes,
      projectGraph: ws.projectGraph,
    }),
    [
      ws.projectCatalogue,
      ws.projects,
      ws.currentProject,
      ws.currentProjectId,
      ws.nodes,
      ws.projectGraph,
    ],
  );

  const selectionValue = useMemo(
    () => ({
      selectedNode: ws.selectedNode,
      selectedNodes: ws.selectedNodes,
      activeNodeId: ws.activeNodeId,
      selectedNodeIds: ws.selectedNodeIds,
    }),
    [ws.selectedNode, ws.selectedNodes, ws.activeNodeId, ws.selectedNodeIds],
  );

  const statusValue = useMemo(
    () => ({
      isLoading: ws.isLoading,
    }),
    [ws.isLoading],
  );

  return (
    <ProjectActionsContext.Provider value={ws.actions}>
      <ProjectDataContext.Provider value={dataValue}>
        <ProjectSelectionContext.Provider value={selectionValue}>
          <ProjectStatusContext.Provider value={statusValue}>
            {children}
          </ProjectStatusContext.Provider>
        </ProjectSelectionContext.Provider>
      </ProjectDataContext.Provider>
    </ProjectActionsContext.Provider>
  );
};
