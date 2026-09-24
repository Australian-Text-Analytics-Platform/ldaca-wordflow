import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { WorkspaceCatalogueItem } from '@/api';
import { importWorkspaceArchive } from '@/api';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import { describeSkippedFiles } from '@/features/workspace/common/skippedFiles';
import { getInvalidWorkspaceNameMessage } from '@/features/workspace/common/workspaceName';
import { queryKeys } from '@/lib/queryKeys';

type Notify = (type: 'success' | 'error' | 'info', message: string, description?: string) => void;

interface DeleteWorkspaceTarget {
  id: string;
  name?: string | null;
}

interface UseDataLoaderWorkspaceActionsParams {
  workspaceCatalogue: WorkspaceCatalogueItem[];
  hasWorkspaceSelected: boolean;
  notify: Notify;
}

/**
 * Owns Data Loader workspace mutations and user-facing notifications. The
 * feature shell consumes this hook to keep workspace cards/dialogs free of API
 * and cache-invalidation details.
 * Used by `DataLoaderFeature`, which passes the returned state and handlers to
 * workspace cards and `DataLoaderDialogs`.
 * Flow: keep transient dialog/busy state, validate workspace names, call generated workspace
 * APIs, refresh workspace data, and return action handlers for cards/dialogs.
 */
export function useDataLoaderWorkspaceActions({
  workspaceCatalogue,
  hasWorkspaceSelected,
  notify,
}: UseDataLoaderWorkspaceActionsParams) {
  const queryClient = useQueryClient();
  const workspaceActions = useWorkspaceActions();
  const [workspaceToDelete, setWorkspaceToDelete] = useState<DeleteWorkspaceTarget | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [workspaceNameAlert, setWorkspaceNameAlert] = useState<string | null>(null);
  const [workspaceLoadFailures, setWorkspaceLoadFailures] = useState<Record<string, string>>({});
  const [workspaceSelectionOperation, setWorkspaceSelectionOperation] = useState<{
    workspaceId: string | null;
    action: 'load' | 'unload';
  } | null>(null);
  const [refreshingWorkspaces, setRefreshingWorkspaces] = useState(false);
  const [uploadingWorkspaceZip, setUploadingWorkspaceZip] = useState(false);

  /**
   * Runs the sole Load/Unload operation, clears an old Load failure before a
   * retry, and records any new Load failure on that Workspace catalogue entry.
   */
  const handleSetCurrentWorkspace = async (
    workspaceId: string | null,
    failureLead?: string,
  ): Promise<boolean> => {
    if (workspaceSelectionOperation) return false;
    if (workspaceId) {
      setWorkspaceLoadFailures((current) => {
        const { [workspaceId]: _clearedFailure, ...remaining } = current;
        return remaining;
      });
    }
    setWorkspaceSelectionOperation({
      workspaceId,
      action: workspaceId ? 'load' : 'unload',
    });
    try {
      await workspaceActions.setCurrentWorkspace(workspaceId);
      return true;
    } catch (error) {
      const message = (error as Error).message || 'Failed to update active project.';
      if (workspaceId) {
        setWorkspaceLoadFailures((current) => ({ ...current, [workspaceId]: message }));
      }
      notify('error', failureLead ? `${failureLead}: ${message}` : message);
      return false;
    } finally {
      setWorkspaceSelectionOperation(null);
    }
  };

  /**
   * Creates a workspace from the card form and reports validation errors back
   * through the dialog state the Data Loader owns.
   * Passed to `ActiveWorkspaceCard` as `onCreate`.
   * Flow: reject empty names, create the workspace, load it when no workspace
   * is already active, surface invalid-name errors inline, and notify success
   * or failure.
   */
  const handleCreateWorkspace = async (name: string, description: string): Promise<boolean> => {
    if (!name) return false;
    try {
      const workspace = await workspaceActions.createWorkspace(name, description || undefined);
      if (!hasWorkspaceSelected) {
        const loaded = await handleSetCurrentWorkspace(
          workspace.id,
          `Project "${name}" was created, but could not be loaded`,
        );
        if (!loaded) {
          return true;
        }
      }
      notify('success', `Project "${name}" created.`);
      return true;
    } catch (error) {
      const message = getInvalidWorkspaceNameMessage(error);
      if (message) {
        setWorkspaceNameAlert(message);
        return false;
      }
      notify('error', (error as Error).message || 'Failed to create project.');
      return false;
    }
  };

  /**
   * Renames the active workspace while preserving the same invalid-name alert
   * path used by create.
   * Passed to `ActiveWorkspaceCard` as `onRename`.
   */
  const handleRenameWorkspace = async (value: string) => {
    try {
      await workspaceActions.renameWorkspace(value);
      notify('success', 'Project renamed.');
    } catch (error) {
      const message = getInvalidWorkspaceNameMessage(error);
      if (message) {
        setWorkspaceNameAlert(message);
        return;
      }
      notify('error', (error as Error).message || 'Failed to rename project.');
    }
  };

  /**
   * Saves the active workspace from either workspace card action, guarded so
   * empty selections never call the backend.
   * Passed to `ActiveWorkspaceCard` as `onSave`.
   */
  const handleSaveWorkspace = async () => {
    if (!hasWorkspaceSelected) return;
    try {
      await workspaceActions.saveWorkspace();
      notify('success', 'Project saved.');
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to save project.');
    }
  };

  /**
   * Persists the active workspace description from the card's inline editor.
   * Passed to `ActiveWorkspaceCard` as `onUpdateDescription`.
   */
  const handleUpdateWorkspaceDescription = async (value: string) => {
    try {
      await workspaceActions.updateWorkspaceDescription(value);
      notify('success', 'Project description updated.');
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to update project description.');
    }
  };

  /**
   * Opens the delete confirmation with the display name looked up from the
   * current workspace list.
   * Passed to `WorkspaceManagerCard` as `onDeleteWorkspace`.
   */
  const openDeleteWorkspaceDialog = (workspaceId: string) => {
    const target = workspaceCatalogue.find((workspace) => workspace.id === workspaceId);
    setWorkspaceToDelete({
      id: workspaceId,
      name: target?.availability === 'available' ? target.name : undefined,
    });
  };

  /**
   * Performs the confirmed delete and resets confirmation state for the dialog
   * used by `DataLoaderDialogs`.
   * Passed to the delete dialog as its confirmation callback.
   */
  const handleConfirmDeleteWorkspace = async () => {
    if (!workspaceToDelete) return;
    setDeletingWorkspace(true);
    try {
      await workspaceActions.deleteWorkspace(workspaceToDelete.id);
      setWorkspaceLoadFailures((current) => {
        const { [workspaceToDelete.id]: _clearedFailure, ...remaining } = current;
        return remaining;
      });
      notify('success', 'Project deleted.');
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to delete project.');
    } finally {
      setDeletingWorkspace(false);
      setWorkspaceToDelete(null);
    }
  };

  /**
   * Refetches the workspace list for the manager refresh button without
   * changing the current workspace selection.
   * Passed to `WorkspaceManagerCard` as `onRefresh`.
   */
  const handleRefreshWorkspaces = async () => {
    setRefreshingWorkspaces(true);
    try {
      await queryClient.refetchQueries({
        queryKey: queryKeys.workspaceList,
        exact: true,
      });
      notify('success', 'Project list refreshed.');
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to refresh project list.');
    } finally {
      setRefreshingWorkspaces(false);
    }
  };

  /**
   * Uploads a saved workspace archive and refreshes workspace summaries so the
   * manager can show the imported workspace immediately.
   * Passed to `WorkspaceManagerCard` as `onUploadZip`.
   * Flow: mark upload busy, send the ZIP through the generated API, refetch workspace summaries, notify the user, and always clear busy state.
   */
  const handleUploadWorkspaceZip = async (file: File) => {
    setUploadingWorkspaceZip(true);
    try {
      const { response } = await importWorkspaceArchive({
        body: file,
        query: { filename: file.name },
        throwOnError: true,
      });
      await queryClient.refetchQueries({ queryKey: queryKeys.workspaceList, exact: true });
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
      setUploadingWorkspaceZip(false);
    }
  };

  /**
   * Adds a file-browser path to the active workspace.
   * Passed to `FileTree` as its add-file action.
   */
  const handleAddFileToWorkspace = async (filename: string, selectedSheet?: string | null) => {
    const node = await workspaceActions.createNodeFromFile(filename, selectedSheet ?? undefined);
    // One toast, so the skip report of a folder or ZIP is never hidden behind it.
    const skipped = node.skipped_files;
    notify(
      'success',
      `${filename} added to project.`,
      skipped && skipped.length > 0 ? describeSkippedFiles(skipped) : undefined,
    );
  };

  return {
    workspaceToDelete,
    deletingWorkspace,
    workspaceNameAlert,
    refreshingWorkspaces,
    uploadingWorkspaceZip,
    workspaceLoadFailures,
    workspaceSelectionOperation,
    // Dialog close handlers are returned with the state they clear because
    // `DataLoaderDialogs` owns only presentation, not workspace state.
    // Passed to DataLoaderDialogs as workspaceNameAlert.onClose.
    closeWorkspaceNameAlert: () => {
      setWorkspaceNameAlert(null);
    },
    /**
     * Clears the workspace pending deletion target after cancel or success.
     * Passed to DataLoaderDialogs as the delete dialog's cancel action.
     */
    closeDeleteWorkspaceDialog: () => {
      setWorkspaceToDelete(null);
    },
    handleCreateWorkspace,
    handleRenameWorkspace,
    handleSaveWorkspace,
    handleSetCurrentWorkspace,
    handleUpdateWorkspaceDescription,
    openDeleteWorkspaceDialog,
    handleConfirmDeleteWorkspace,
    handleRefreshWorkspaces,
    handleUploadWorkspaceZip,
    handleAddFileToWorkspace,
  };
}
