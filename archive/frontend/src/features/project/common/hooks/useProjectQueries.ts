import { useQuery } from '@tanstack/react-query';
import { listNodes, listWorkspaces } from '@/api';
import type { ProjectCatalogueItem, ProjectGraphResponse, ProjectSummary } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import type { WorkspaceNodeInfo as GraphNode } from '@/api';
import type { UnavailableDataBlock } from '@/api';

interface ProjectQueriesParams {
  isAuthenticated: boolean;
  activeNodeId: string | null;
  selectedNodeIds: string[];
}

export const availableProjectsFromCatalogue = (
  catalogue: ProjectCatalogueItem[],
): ProjectSummary[] =>
  catalogue.filter(
    (project): project is ProjectSummary => project.availability === 'available',
  );

/**
 * Owns all project React Query reads. `useProjectInternal` consumes this
 * hook to keep project lists, graph data, and active/selected node
 * projections together. Data View owns the selected node-page query.
 * Used by: `useProjectInternal`, which needs one query bundle for provider
 * data/status slices and active-node projection.
 * Flow: authenticated readiness gates project bootstrap reads, the current
 * project id selects the graph query, and active/selected nodes are projected
 * from that graph response. Generated-client configuration owns request auth.
 */
export const useProjectQueries = ({
  isAuthenticated,
  activeNodeId,
  selectedNodeIds,
}: ProjectQueriesParams) => {
  const projectsQuery = useQuery({
    queryKey: queryKeys.projectList,
    /**
     * Loads project summaries for selectors and launch screens.
     * Why: the list must wait for authenticated readiness and share one canonical cache key.
     */
    queryFn: async () => {
      const { data } = await listWorkspaces({ throwOnError: true });
      return data;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const projectCatalogue = projectsQuery.data ?? [];
  const projects = availableProjectsFromCatalogue(projectCatalogue);
  const openProjects = projects.filter((project) => project.runtime_state === 'open');
  if (openProjects.length > 1) {
    throw new Error(
      `Project runtime invariant violated: ${String(openProjects.length)} Projects are open`,
    );
  }
  const currentProject = openProjects[0] ?? null;
  const currentProjectId = currentProject?.id ?? null;

  const nodesQuery = useQuery({
    queryKey: currentProjectId
      ? queryKeys.projectGraph(currentProjectId)
      : queryKeys.inactiveProjectGraph,
    /**
     * Fetches graph topology for the active project view.
     * Why: graph consumers need one cache entry gated by authenticated project identity.
     */
    queryFn: async () => {
      if (!currentProjectId) throw new Error('Missing project ID');
      const { data } = await listNodes({
        path: { workspace_id: currentProjectId },
        throwOnError: true,
      });
      const nodes = data.filter((node): node is GraphNode => node.availability === 'available');
      const unavailableNodes = data.filter(
        (node): node is UnavailableDataBlock => node.availability === 'unavailable',
      );
      const edges = nodes.flatMap((node) =>
        (node.child_ids ?? []).map((childId) => ({
          id: `${node.id}:${childId}`,
          source: node.id,
          target: childId,
        })),
      );
      return { nodes, edges, unavailableNodes } satisfies ProjectGraphResponse;
    },
    enabled: isAuthenticated && !!currentProjectId,
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
  });

  const projectGraph = nodesQuery.data ?? null;

  const nodes = projectGraph?.nodes ?? [];
  const selectedNode = nodes.find((node) => node.id === activeNodeId) ?? null;

  const selectedNodes = selectedNodeIds
    .map((id: string) => nodes.find((node) => node.id === id))
    .filter((n): n is GraphNode => Boolean(n));

  const queryLoadingState = {
    projects: projectsQuery.isLoading,
    currentProject: projectsQuery.isLoading,
    nodes: nodesQuery.isLoading,
    graph: nodesQuery.isLoading,
  };

  return {
    projectCatalogue,
    projects,
    currentProject,
    projectGraph,
    nodes,
    selectedNode,
    selectedNodes,
    queryLoadingState,
    currentProjectId,
    projectsHydrated: projectsQuery.isSuccess,
    nodesHydrated: nodesQuery.isSuccess,
  } as const;
};
