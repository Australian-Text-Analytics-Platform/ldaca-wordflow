import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileBrowserActions } from '../useFileBrowserActions';
import { queryKeys } from '@/lib/queryKeys';

const mocks = vi.hoisted(() => ({
  moveFile: vi.fn(),
  deleteFiles: vi.fn(),
  prepareFileArchive: vi.fn(),
  saveBackendDownload: vi.fn(),
}));

vi.mock('@/lib/download', () => ({ saveBackendDownload: mocks.saveBackendDownload }));

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getRawFile: vi.fn(),
  moveFile: mocks.moveFile,
  deleteFiles: mocks.deleteFiles,
  prepareFileArchive: mocks.prepareFileArchive,
}));

describe('useFileBrowserActions cache policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.moveFile.mockResolvedValue({ data: { message: 'moved' } });
  });

  it('invalidates once after a move while manual refresh remains explicit', async () => {
    const queryClient = new QueryClient();
    const sourcePreview = queryKeys.filePreview('source.csv', 1, 20, null);
    const targetPreview = queryKeys.filePreview('target/source.csv', 1, 20, null);
    queryClient.setQueryData(sourcePreview, { rows: [{ stale: 'source' }] });
    queryClient.setQueryData(targetPreview, { rows: [{ stale: 'target' }] });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const refreshFiles = vi.fn().mockResolvedValue([]);
    const notify = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFileBrowserActions({ refreshFiles, notify }), {
      wrapper,
    });

    await act(async () => {
      await result.current.handleMoveFile('source.csv', 'target');
    });

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(sourcePreview)).toBeUndefined();
    expect(queryClient.getQueryData(targetPreview)).toBeUndefined();
    expect(refreshFiles).not.toHaveBeenCalled();

    invalidateQueries.mockClear();
    await act(async () => {
      await result.current.handleRefreshFiles();
    });

    expect(refreshFiles).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('moves and deletes a selection with one summary each', async () => {
    const queryClient = new QueryClient();
    const notify = vi.fn();
    mocks.moveFile.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('exists'));
    mocks.deleteFiles.mockResolvedValue({ data: { deleted: 3 } });
    const { result } = renderHook(() => useFileBrowserActions({ refreshFiles: vi.fn(), notify }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => {
      await result.current.handleMoveMany(['a.csv', 'b.csv'], 'archive');
      await result.current.handleDeleteMany(['a', 'b', 'c']);
    });

    expect(notify).toHaveBeenCalledWith('success', 'Moved 1 item.');
    expect(notify).toHaveBeenCalledWith('error', 'Could not move 1 item: b.csv');
    expect(mocks.deleteFiles).toHaveBeenCalledWith({
      body: { paths: ['a', 'b', 'c'] },
      throwOnError: true,
    });
    expect(notify).toHaveBeenCalledWith('success', 'Deleted 3 items.');
  });

  it('downloads a selection by registering it, then streaming its ZIP', async () => {
    const queryClient = new QueryClient();
    mocks.prepareFileArchive.mockResolvedValue({
      data: { id: 'abc123', filename: 'wordflow_files.zip', file_count: 2 },
    });
    const { result } = renderHook(
      () => useFileBrowserActions({ refreshFiles: vi.fn(), notify: vi.fn() }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );

    await act(async () => {
      await result.current.handleDownloadMany(['one.csv', 'speeches']);
    });

    expect(mocks.prepareFileArchive).toHaveBeenCalledWith({
      body: { paths: ['one.csv', 'speeches'] },
      throwOnError: true,
    });
    expect(mocks.saveBackendDownload).toHaveBeenCalledWith(
      '/api/user-files/archives/abc123',
      'wordflow_files.zip',
      expect.any(Function),
    );
  });
});
