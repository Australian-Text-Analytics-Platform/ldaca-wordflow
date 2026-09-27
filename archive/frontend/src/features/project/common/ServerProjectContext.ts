import { createContext } from 'react';
import type { useProjectInternal } from './hooks/useProjectInternal';

type ProjectInternal = ReturnType<typeof useProjectInternal>;

export interface ProjectDataSlice {
  projectCatalogue: ProjectInternal['projectCatalogue'];
  projects: ProjectInternal['projects'];
  currentProject: ProjectInternal['currentProject'];
  currentProjectId: ProjectInternal['currentProjectId'];
  nodes: ProjectInternal['nodes'];
  projectGraph: ProjectInternal['projectGraph'];
}

export interface ProjectSelectionSlice {
  selectedNode: ProjectInternal['selectedNode'];
  selectedNodes: ProjectInternal['selectedNodes'];
  activeNodeId: ProjectInternal['activeNodeId'];
  selectedNodeIds: ProjectInternal['selectedNodeIds'];
}

export interface ProjectStatusSlice {
  isLoading: ProjectInternal['isLoading'];
}

export type ProjectActionsSlice = ProjectInternal['actions'];

/**
 * Each slice gets its own context so consumers re-render only when *their*
 * slice changes. The `actions` slice is the highest-leverage
 * split — it has the most consumers (~30) and rarely changes, so isolating
 * it from `data`/`selection` churn cuts a lot of unnecessary work.
 *
 * Consumers should always go through `useProjectData` /
 * `useProjectSelection` / `useProjectStatus` / `useProjectActions`
 * rather than reading these contexts directly — the wrappers add the
 * "must-be-inside-ServerProjectProvider" runtime check.
 */
export const ProjectDataContext = createContext<ProjectDataSlice | undefined>(undefined);
export const ProjectSelectionContext = createContext<ProjectSelectionSlice | undefined>(
  undefined,
);
export const ProjectStatusContext = createContext<ProjectStatusSlice | undefined>(undefined);
export const ProjectActionsContext = createContext<ProjectActionsSlice | undefined>(undefined);
