import { useReducer, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { deleteFiles, getRawFile, moveFile } from '@/api';
import type { FileTreeDirectory } from '@/features/views/data-loader/types';
import {
  createFileBrowserCitationState,
  fileBrowserCitationReducer,
} from './fileBrowserCitationState';
import { refreshFilePathQuery, refreshMovedFileQueries } from './fileCache';

type Notify = (type: 'success' | 'error' | 'info', message: string) => void;

interface UseFileBrowserActionsParams {
  refreshFiles: () => Promise<unknown>;
  notify: Notify;
}

/**
 * Owns file-browser side effects that are not simple rendering. Data Loader
 * uses this hook for refresh, drag-to-move, and citation README preview state.
 * Used by `DataLoaderFeature`, which passes its move/citation handlers to `FileTree`.
 * Flow: wrap file refresh/move/citation operations with loading state and notifications, then
 * expose handlers consumed by FileTree and DataLoaderFeature.
 */
export function useFileBrowserActions({ refreshFiles, notify }: UseFileBrowserActionsParams) {
  const queryClient = useQueryClient();
  const [citation, dispatchCitation] = useReducer(
    fileBrowserCitationReducer,
    undefined,
    createFileBrowserCitationState,
  );
  const [refreshingFiles, setRefreshingFiles] = useState(false);

  /**
   * Refreshes the server-backed file tree and surfaces the result through the
   * Data Loader toast channel.
   * Passed to the Data Loader file-browser refresh button.
   */
  const handleRefreshFiles = async () => {
    setRefreshingFiles(true);
    try {
      await refreshFiles();
      notify('success', 'File list refreshed.');
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to refresh file list.');
    } finally {
      setRefreshingFiles(false);
    }
  };

  /**
   * Moves a file into a target directory for `FileTree` drop events, then
   * invalidates the browser query so the row appears in its new location.
   * Passed to `FileTree` as `onMoveFile`.
   */
  const handleMoveFile = async (sourcePath: string, targetDirectoryPath: string) => {
    try {
      await moveFile({
        body: { source_path: sourcePath, target_directory_path: targetDirectoryPath },
        throwOnError: true,
      });
      await refreshMovedFileQueries(queryClient, sourcePath, targetDirectoryPath);
      notify('success', `Moved ${String(sourcePath.split('/').at(-1))}.`);
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to move file.');
    }
  };

  /**
   * Moves a multi-selection (issue 138) one entry at a time, then reports one
   * summary. A clash or failure on one entry does not stop the rest.
   */
  const handleMoveMany = async (sourcePaths: string[], targetDirectoryPath: string) => {
    const failed: string[] = [];
    for (const sourcePath of sourcePaths) {
      try {
        await moveFile({
          body: { source_path: sourcePath, target_directory_path: targetDirectoryPath },
          throwOnError: true,
        });
        await refreshMovedFileQueries(queryClient, sourcePath, targetDirectoryPath);
      } catch {
        failed.push(sourcePath);
      }
    }
    const moved = sourcePaths.length - failed.length;
    if (moved > 0) notify('success', `Moved ${String(moved)} item${moved === 1 ? '' : 's'}.`);
    if (failed.length > 0) {
      notify(
        'error',
        `Could not move ${String(failed.length)} item${failed.length === 1 ? '' : 's'}: ${failed.join(', ')}`,
      );
    }
  };

  /** Deletes a multi-selection in one backend call (issue 138). */
  const handleDeleteMany = async (paths: string[]) => {
    try {
      const { data } = await deleteFiles({ body: { paths }, throwOnError: true });
      await Promise.all(paths.map((path) => refreshFilePathQuery(queryClient, path)));
      notify('success', `Deleted ${String(data.deleted)} item${data.deleted === 1 ? '' : 's'}.`);
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to delete the selection.');
    }
  };

  /**
   * Opens the citation dialog and loads README content when the selected folder
   * has a citation file.
   * Passed to `FileTree` as `onOpenCitation`.
   * Steps: open the dialog, handle folders without README files, fetch README text, then clear
   * loading state after success or error.
   */
  const openCitation = async (directory: FileTreeDirectory, readmePath: string | null) => {
    if (!readmePath) {
      dispatchCitation({ type: 'openWithoutReadme', directory });
      return;
    }

    dispatchCitation({ type: 'startLoading', directory, path: readmePath });
    try {
      const { data } = await getRawFile({
        parseAs: 'text',
        query: { path: readmePath },
        throwOnError: true,
      });
      const rawContent = data;
      dispatchCitation({ type: 'loaded', content: rawContent });
    } catch (error) {
      dispatchCitation({ type: 'failed' });
      notify('error', (error as Error).message || 'Failed to load citation.');
    }
  };

  /**
   * Resets citation-preview state for the dialog close action.
   * Passed to `DataLoaderDialogs` through the returned citation state.
   */
  const closeCitation = () => {
    dispatchCitation({ type: 'close' });
  };

  return {
    citationDirectory: citation.directory,
    citationPath: citation.path,
    citationContent: citation.content,
    citationLoading: citation.loading,
    refreshingFiles,
    handleRefreshFiles,
    handleMoveFile,
    handleMoveMany,
    handleDeleteMany,
    openCitation,
    closeCitation,
  };
}
