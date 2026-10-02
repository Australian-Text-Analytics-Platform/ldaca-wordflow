import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFiles } from '../useFiles';
import { queryKeys } from '@/lib/queryKeys';

const mocks = vi.hoisted(() => ({
  createFolder: vi.fn(),
  deleteFile: vi.fn(),
  downloadFile: vi.fn(),
  saveBackendDownload: vi.fn(),
  getUserFileResource: vi.fn(),
  listUserFiles: vi.fn(),
  uploadFile: vi.fn(),
  uploadFileWithProgress: vi.fn(),
}));

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  createFolder: mocks.createFolder,
  deleteFile: mocks.deleteFile,
  downloadFile: mocks.downloadFile,
  getUserFileResource: mocks.getUserFileResource,
  listUserFiles: mocks.listUserFiles,
  uploadFile: mocks.uploadFile,
}));
vi.mock('@/lib/download', () => ({ saveBackendDownload: mocks.saveBackendDownload }));
vi.mock('@/lib/backend/uploadTransport', () => ({
  uploadFileWithProgress: mocks.uploadFileWithProgress,
}));

/** Creates the real query-cache boundary used by useFiles mutation tests. */
function makeWrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useFiles cache policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listUserFiles.mockResolvedValue({ data: [] });
    mocks.uploadFile.mockResolvedValue({ data: { message: 'uploaded' } });
    mocks.createFolder.mockResolvedValue({ data: { type: 'directory', path: 'corpus' } });
    mocks.getUserFileResource.mockResolvedValue({
      data: { type: 'directory', path: 'corpus' },
    });
    mocks.deleteFile.mockResolvedValue({ data: { message: 'deleted' } });
    mocks.saveBackendDownload.mockResolvedValue({
      omittedTabCount: 0,
      omittedAnalysisCount: 0,
    });
  });

  it('keeps coordinated uploads path-aware and defers refresh until the batch ends', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const replacedPreviewKey = queryKeys.filePreview('a.csv', 1, 20, null);
    queryClient.setQueryData(replacedPreviewKey, { rows: [{ stale: true }] });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useFiles(), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => {
      expect(mocks.listUserFiles).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.uploadFileAtPath(new File(['a'], 'a.csv'), 'corpus/a.csv');
      await result.current.createUploadDirectory('corpus/nested');
      await result.current.getUploadResource('corpus');
    });

    // Uploads go through the progress transport, not the generated client (issue 260).
    expect(mocks.uploadFileWithProgress).toHaveBeenCalledWith(
      expect.any(File),
      'corpus/a.csv',
      undefined,
    );
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(mocks.createFolder).toHaveBeenCalledWith({
      body: { name: 'nested', parent_path: 'corpus' },
      throwOnError: true,
    });
    expect(mocks.getUserFileResource).toHaveBeenCalledWith({
      query: { path: 'corpus' },
      throwOnError: true,
    });
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(replacedPreviewKey)).toEqual({ rows: [{ stale: true }] });
    expect(result.current).toHaveProperty('refreshFiles');

    invalidateQueries.mockClear();
    await act(async () => {
      await result.current.handleDeleteFile('a.csv');
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(1);

    invalidateQueries.mockClear();
    const readsBeforeRefresh = mocks.listUserFiles.mock.calls.length;
    await act(async () => {
      await result.current.refreshFiles();
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(mocks.listUserFiles).toHaveBeenCalledTimes(readsBeforeRefresh + 1);
  });

  it('hands a refused delete to the caller so the Data Loader can say why', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const refusal = new Error('corpus is receiving an upload.');
    mocks.deleteFile.mockRejectedValue(refusal);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onError = vi.fn();
    const { result } = renderHook(() => useFiles(), {
      wrapper: makeWrapper(queryClient),
    });

    let deleted: boolean | undefined;
    await act(async () => {
      deleted = await result.current.handleDeleteFile('corpus', onError);
    });

    expect(deleted).toBe(false);
    expect(onError).toHaveBeenCalledWith(refusal);
  });

  it('keeps directories but hides User Files that are not loadable', async () => {
    mocks.listUserFiles.mockResolvedValue({
      data: [
        {
          name: 'figures',
          path: 'figures',
          type: 'directory',
          size_bytes: null,
          file_type: null,
          modified_at: 1,
          loadable: false,
        },
        {
          name: 'chart.png',
          path: 'figures/chart.png',
          type: 'file',
          size_bytes: 64,
          file_type: 'unknown',
          modified_at: 1,
          loadable: false,
        },
        {
          name: 'records.csv',
          path: 'records.csv',
          type: 'file',
          size_bytes: 32,
          file_type: 'csv',
          modified_at: 1,
          loadable: true,
        },
      ],
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useFiles(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.completeFileTree).toHaveLength(2);
      expect(result.current.fileTree).toEqual([
        {
          name: 'figures',
          path: 'figures',
          type: 'directory',
          children: [],
        },
        {
          name: 'records.csv',
          path: 'records.csv',
          type: 'file',
          size: 32,
          size_bytes: 32,
          modified_at: 1,
          file_type: 'csv',
          loadable: true,
        },
      ]);
    });
  });

  it('routes User File downloads through the backend streaming boundary', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useFiles(), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(mocks.listUserFiles).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.handleDownloadFile('folder/report 1.csv');
    });

    expect(mocks.saveBackendDownload).toHaveBeenCalledWith(
      '/api/user-files/content?path=folder%2Freport+1.csv',
      'folder/report 1.csv',
      expect.any(Function),
    );
  });
});
