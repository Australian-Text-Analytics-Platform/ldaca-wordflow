import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ProjectCatalogueItem } from '@/api';
import { importWorkspaceArchive } from '@/api';
import { useProjectActions } from '@/features/project/common/hooks/useProjectActions';
import { getInvalidProjectNameMessage } from '@/features/project/common/projectName';
import { queryKeys } from '@/lib/queryKeys';

type Notify = (type: 'success' | 'error' | 'info', message: string) => void;

interface DeleteProjectTarget {
  id: string;
  name?: string | null;
}

interface UseDataLoaderProjectActionsParams {
  projectCatalogue: ProjectCatalogueItem[];
  hasProjectSelected: boolean;
  notify: Notify;
}

/**
 * Owns Data Loader project mutations and user-facing notifications. The
 * feature shell consumes this hook to keep project cards/dialogs free of API
 * and cache-invalidation details.
 * Used by `DataLoaderFeature`, which passes the returned state and handlers to
 * project cards and `DataLoaderDialogs`.
 * Flow: keep transient dialog/busy state, validate project names, call generated project
 * APIs, refresh project data, and return action handlers for cards/dialogs.
 */
export function useDataLoaderProjectActions({
  projectCatalogue,
  hasProjectSelected,
  notify,
}: UseDataLoaderProjectActionsParams) {
  const queryClient = useQueryClient();
  const projectActions = useProjectActions();
  const [projectToDelete, setProjectToDelete] = useState<DeleteProjectTarget | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [projectNameAlert, setProjectNameAlert] = useState<string | null>(null);
  const [projectLoadFailures, setProjectLoadFailures] = useState<Record<string, string>>({});
  const [projectSelectionOperation, setProjectSelectionOperation] = useState<{
    projectId: string | null;
    action: 'load' | 'unload';
  } | null>(null);
  const [refreshingProjects, setRefreshingProjects] = useState(false);
  const [uploadingProjectZip, setUploadingProjectZip] = useState(false);

  /**
   * Runs the sole Load/Unload operation, clears an old Load failure before a
   * retry, and records any new Load failure on that Project catalogue entry.
   */
  const handleSetCurrentProject = async (
    projectId: string | null,
    failureLead?: string,
  ): Promise<boolean> => {
    if (projectSelectionOperation) return false;
    if (projectId) {
      setProjectLoadFailures((current) => {
        const { [projectId]: _clearedFailure, ...remaining } = current;
        return remaining;
      });
    }
    setProjectSelectionOperation({
      projectId,
      action: projectId ? 'load' : 'unload',
    });
    try {
      await projectActions.setCurrentProject(projectId);
      return true;
    } catch (error) {
      const message = (error as Error).message || 'Failed to update active project.';
      if (projectId) {
        setProjectLoadFailures((current) => ({ ...current, [projectId]: message }));
      }
      notify('error', failureLead ? `${failureLead}: ${message}` : message);
      return false;
    } finally {
      setProjectSelectionOperation(null);
    }
  };

  /**
   * Creates a project from the card form and reports validation errors back
   * through the dialog state the Data Loader owns.
   * Passed to `ActiveProjectCard` as `onCreate`.
   * Flow: reject empty names, create the project, load it when no project
   * is already active, surface invalid-name errors inline, and notify success
   * or failure.
   */
  const handleCreateProject = async (name: string, description: string): Promise<boolean> => {
    if (!name) return false;
    try {
      const project = await projectActions.createProject(name, description || undefined);
      if (!hasProjectSelected) {
        const loaded = await handleSetCurrentProject(
          project.id,
          `Project "${name}" was created, but could not be loaded`,
        );
        if (!loaded) {
          return true;
        }
      }
      notify('success', `Project "${name}" created.`);
      return true;
    } catch (error) {
      const message = getInvalidProjectNameMessage(error);
      if (message) {
        setProjectNameAlert(message);
        return false;
      }
      notify('error', (error as Error).message || 'Failed to create project.');
      return false;
    }
  };

  /**
   * Renames the active project while preserving the same invalid-name alert
   * path used by create.
   * Passed to `ActiveProjectCard` as `onRename`.
   */
  const handleRenameProject = async (value: string) => {
    try {
      await projectActions.renameProject(value);
      notify('success', 'Project renamed.');
    } catch (error) {
      const message = getInvalidProjectNameMessage(error);
      if (message) {
        setProjectNameAlert(message);
        return;
      }
      notify('error', (error as Error).message || 'Failed to rename project.');
    }
  };

  /**
   * Saves the active project from either project card action, guarded so
   * empty selections never call the backend.
   * Passed to `ActiveProjectCard` as `onSave`.
   */
  const handleSaveProject = async () => {
    if (!hasProjectSelected) return;
    try {
      await projectActions.saveProject();
      notify('success', 'Project saved.');
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to save project.');
    }
  };

  /**
   * Persists the active project description from the card's inline editor.
   * Passed to `ActiveProjectCard` as `onUpdateDescription`.
   */
  const handleUpdateProjectDescription = async (value: string) => {
    try {
      await projectActions.updateProjectDescription(value);
      notify('success', 'Project description updated.');
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to update project description.');
    }
  };

  /**
   * Opens the delete confirmation with the display name looked up from the
   * current project list.
   * Passed to `ProjectManagerCard` as `onDeleteProject`.
   */
  const openDeleteProjectDialog = (projectId: string) => {
    const target = projectCatalogue.find((project) => project.id === projectId);
    setProjectToDelete({
      id: projectId,
      name: target?.availability === 'available' ? target.name : undefined,
    });
  };

  /**
   * Performs the confirmed delete and resets confirmation state for the dialog
   * used by `DataLoaderDialogs`.
   * Passed to the delete dialog as its confirmation callback.
   */
  const handleConfirmDeleteProject = async () => {
    if (!projectToDelete) return;
    setDeletingProject(true);
    try {
      await projectActions.deleteProject(projectToDelete.id);
      setProjectLoadFailures((current) => {
        const { [projectToDelete.id]: _clearedFailure, ...remaining } = current;
        return remaining;
      });
      notify('success', 'Project deleted.');
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to delete project.');
    } finally {
      setDeletingProject(false);
      setProjectToDelete(null);
    }
  };

  /**
   * Refetches the project list for the manager refresh button without
   * changing the current project selection.
   * Passed to `ProjectManagerCard` as `onRefresh`.
   */
  const handleRefreshProjects = async () => {
    setRefreshingProjects(true);
    try {
      await queryClient.refetchQueries({
        queryKey: queryKeys.projectList,
        exact: true,
      });
      notify('success', 'Project list refreshed.');
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to refresh project list.');
    } finally {
      setRefreshingProjects(false);
    }
  };

  /**
   * Uploads a saved project archive and refreshes project summaries so the
   * manager can show the imported project immediately.
   * Passed to `ProjectManagerCard` as `onUploadZip`.
   * Flow: mark upload busy, send the ZIP through the generated API, refetch project summaries, notify the user, and always clear busy state.
   */
  const handleUploadProjectZip = async (file: File) => {
    setUploadingProjectZip(true);
    try {
      const { response } = await importWorkspaceArchive({
        body: file,
        query: { filename: file.name },
        throwOnError: true,
      });
      await queryClient.refetchQueries({ queryKey: queryKeys.projectList, exact: true });
      const omittedTabs = Number(response.headers.get('x-wordflow-omitted-tab-count') ?? 0);
      const omittedAnalyses = Number(
        response.headers.get('x-wordflow-omitted-analysis-count') ?? 0,
      );
      if (omittedTabs > 0 || omittedAnalyses > 0) {
        const omissions = [];
        if (omittedTabs > 0) {
          omissions.push(`${String(omittedTabs)} unavailable Tab${omittedTabs === 1 ? '' : 's'}`);
        }
        if (omittedAnalyses > 0) {
          omissions.push(
            `${String(omittedAnalyses)} unavailable Analysis record${omittedAnalyses === 1 ? '' : 's'}`,
          );
        }
        notify('info', `Project ZIP uploaded with ${omissions.join(' and ')} omitted.`);
      } else {
        notify('success', `Project ZIP "${file.name}" uploaded.`);
      }
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to upload project ZIP.');
    } finally {
      setUploadingProjectZip(false);
    }
  };

  /**
   * Adds a file-browser path to the active project.
   * Passed to `FileTree` as its add-file action.
   */
  const handleAddFileToProject = async (filename: string, selectedSheet?: string | null) => {
    await projectActions.createNodeFromFile(filename, selectedSheet ?? undefined);
    notify('success', `${filename} added to project.`);
  };

  return {
    projectToDelete,
    deletingProject,
    projectNameAlert,
    refreshingProjects,
    uploadingProjectZip,
    projectLoadFailures,
    projectSelectionOperation,
    // Dialog close handlers are returned with the state they clear because
    // `DataLoaderDialogs` owns only presentation, not project state.
    // Passed to DataLoaderDialogs as projectNameAlert.onClose.
    closeProjectNameAlert: () => {
      setProjectNameAlert(null);
    },
    /**
     * Clears the project pending deletion target after cancel or success.
     * Passed to DataLoaderDialogs as the delete dialog's cancel action.
     */
    closeDeleteProjectDialog: () => {
      setProjectToDelete(null);
    },
    handleCreateProject,
    handleRenameProject,
    handleSaveProject,
    handleSetCurrentProject,
    handleUpdateProjectDescription,
    openDeleteProjectDialog,
    handleConfirmDeleteProject,
    handleRefreshProjects,
    handleUploadProjectZip,
    handleAddFileToProject,
  };
}
