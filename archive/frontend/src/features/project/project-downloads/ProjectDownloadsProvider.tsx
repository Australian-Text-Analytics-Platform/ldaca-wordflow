import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { exportWorkspaceArchive } from '@/api';
import { saveBackendDownload } from '@/lib/download';
import {
  ProjectDownloadsContext,
  type PendingProjectDownload,
  type ProjectDownloadsHandle,
} from './ProjectDownloadsContext';

/**
 * Converts a project label into the ZIP filename used by browser and Tauri
 * saves. Used by: ProjectDownloadsProvider after artifact generation
 * succeeds, keeping path separators and whitespace out of the saved name.
 */
function projectArtifactFilename(artifactName: string, projectId: string): string {
  return `${(artifactName || projectId).replace(/[^a-zA-Z0-9._-]+/g, '_')}.zip`;
}

const omittedCount = (response: Response, header: string): number => {
  const value = Number(response.headers.get(header) ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
};

const omissionMessage = (tabs: number, analyses: number): string => {
  const parts = [];
  if (tabs) parts.push(`${String(tabs)} unavailable Tab${tabs === 1 ? '' : 's'}`);
  if (analyses) {
    parts.push(`${String(analyses)} unavailable Analysis record${analyses === 1 ? '' : 's'}`);
  }
  return `${parts.join(' and ')} were omitted from the archive.`;
};

/**
 * Owns project artifact tasks for the full authenticated project-shell
 * lifetime. `ServerProjectShell` mounts this provider above `ViewRouter`, while
 * Data Loader's project manager consumes the exposed command/view handle.
 *
 * Flow: request the canonical project archive, save the response, and keep
 * the pending marker in the shell provider so navigation cannot orphan an
 * in-flight download.
 */
export function ProjectDownloadsProvider({ children }: { children: ReactNode }) {
  const [startingProjectIds, setStartingProjectIds] = useState<Set<string>>(() => new Set());
  const [pendingDownloads, setPendingDownloads] = useState<PendingProjectDownload[]>([]);

  /**
   * Starts the project-manager row's archive request and records its
   * in-flight identity before the Data Loader view can unmount.
   */
  const startDownload = async (projectId: string, projectName: string) => {
    if (startingProjectIds.has(projectId)) return;
    setStartingProjectIds((current) => new Set(current).add(projectId));
    setPendingDownloads((current) => [
      ...current.filter((download) => download.projectId !== projectId),
      { projectId, artifactName: projectName, status: 'pending' },
    ]);
    try {
      const omissions = await saveBackendDownload(
        `/api/workspaces/${encodeURIComponent(projectId)}/archive`,
        projectArtifactFilename(projectName, projectId),
        async () => {
          const { data, response } = await exportWorkspaceArchive({
            parseAs: 'blob',
            path: { workspace_id: projectId },
            throwOnError: true,
          });
          return {
            blob: data,
            omittedTabCount: omittedCount(response, 'x-wordflow-omitted-tab-count'),
            omittedAnalysisCount: omittedCount(response, 'x-wordflow-omitted-analysis-count'),
          };
        },
      );
      if (omissions === null) return;
      if (omissions.omittedTabCount || omissions.omittedAnalysisCount) {
        toast.warning(omissionMessage(omissions.omittedTabCount, omissions.omittedAnalysisCount), {
          duration: 7000,
        });
      } else {
        toast.success(`Downloaded project "${projectName || projectId}".`, {
          duration: 3500,
        });
      }
    } catch (error) {
      toast.error((error as Error).message || 'Failed to start project download.', {
        duration: 6000,
      });
    } finally {
      setPendingDownloads((current) =>
        current.filter((download) => download.projectId !== projectId),
      );
      setStartingProjectIds((current) => {
        const next = new Set(current);
        next.delete(projectId);
        return next;
      });
    }
  };

  const value: ProjectDownloadsHandle = {
    pendingDownloads,
    startDownload,
    isStarting: (projectId) => startingProjectIds.has(projectId),
    isPending: (projectId) =>
      pendingDownloads.some((download) => download.projectId === projectId),
  };

  return (
    <ProjectDownloadsContext.Provider value={value}>
      {children}
    </ProjectDownloadsContext.Provider>
  );
}
