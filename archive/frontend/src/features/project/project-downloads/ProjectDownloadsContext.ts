import { createContext, useContext } from 'react';

export interface PendingProjectDownload {
  projectId: string;
  artifactName: string;
  status: 'pending';
}

export interface ProjectDownloadsHandle {
  pendingDownloads: readonly PendingProjectDownload[];
  startDownload: (projectId: string, projectName: string) => Promise<void>;
  isStarting: (projectId: string) => boolean;
  isPending: (projectId: string) => boolean;
}

/**
 * Carries the shell-owned project artifact command/status view. Provided by:
 * ProjectDownloadsProvider; consumed by Data Loader's project manager.
 */
export const ProjectDownloadsContext = createContext<ProjectDownloadsHandle | null>(null);

/**
 * Returns the shell-owned project-download view/commands. Used by: Data
 * Loader's project manager so navigation cannot own or orphan completion.
 */
export function useProjectDownloads(): ProjectDownloadsHandle {
  const value = useContext(ProjectDownloadsContext);
  if (!value) {
    throw new Error('useProjectDownloads must be used within ProjectDownloadsProvider');
  }
  return value;
}
