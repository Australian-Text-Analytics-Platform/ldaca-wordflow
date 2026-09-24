import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { useDataLoaderWorkspaceActions } from '../useDataLoaderWorkspaceActions';

const mocks = vi.hoisted(() => ({ createNodeFromFile: vi.fn() }));

vi.mock('@/features/workspace/common/hooks/useWorkspaceActions', () => ({
  useWorkspaceActions: () => ({ createNodeFromFile: mocks.createNodeFromFile }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('useDataLoaderWorkspaceActions add file', () => {
  it('reports skipped files in the same toast as the added Data Block', async () => {
    mocks.createNodeFromFile.mockResolvedValueOnce({
      skipped_files: [{ extension: 'parquet', reason: 'unsupported_type', count: 4 }],
    });
    mocks.createNodeFromFile.mockResolvedValueOnce({ skipped_files: null });
    const notify = vi.fn();
    const { result } = renderHook(
      () =>
        useDataLoaderWorkspaceActions({
          workspaceCatalogue: [],
          hasWorkspaceSelected: true,
          notify,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleAddFileToWorkspace('reddit');
      await result.current.handleAddFileToWorkspace('notes.txt');
    });

    expect(notify).toHaveBeenNthCalledWith(
      1,
      'success',
      'reddit added to project.',
      '4 files skipped while loading: parquet - 4',
    );
    expect(notify).toHaveBeenNthCalledWith(2, 'success', 'notes.txt added to project.', undefined);
  });

  it('adds several table files with one summary and lists failures', async () => {
    mocks.createNodeFromFile.mockReset();
    mocks.createNodeFromFile
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('bad file'))
      .mockResolvedValueOnce({});
    const notify = vi.fn();
    const { result } = renderHook(
      () =>
        useDataLoaderWorkspaceActions({
          workspaceCatalogue: [],
          hasWorkspaceSelected: true,
          notify,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleAddFilesToWorkspace(['a.csv', 'b.csv', 'c.parquet']);
    });

    expect(notify).toHaveBeenCalledWith('success', '2 Data Blocks added to project.');
    expect(notify).toHaveBeenCalledWith('error', '1 file could not be added.', 'b.csv');
  });
});
