import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { useDataLoaderWorkspaceActions } from '../useDataLoaderWorkspaceActions';

const mocks = vi.hoisted(() => ({
  createNodeFromFile: vi.fn(),
  createNodeFromJsonFiles: vi.fn(),
}));

vi.mock('@/features/workspace/common/hooks/useWorkspaceActions', () => ({
  useWorkspaceActions: () => ({
    createNodeFromFile: mocks.createNodeFromFile,
    createNodeFromJsonFiles: mocks.createNodeFromJsonFiles,
  }),
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
      'reddit added to Project.',
      '4 files skipped while loading: parquet - 4',
    );
    expect(notify).toHaveBeenNthCalledWith(2, 'success', 'notes.txt added to Project.', undefined);
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
      await result.current.handleAddFilesToWorkspace([
        { id: 'a.csv', label: 'a.csv', path: 'a.csv' },
        { id: 'w\u0000Empty', label: 'w.xlsx › Empty', path: 'w.xlsx', sheet: 'Empty' },
        { id: 'c.parquet', label: 'c.parquet', path: 'c.parquet' },
      ]);
    });

    expect(mocks.createNodeFromFile).toHaveBeenCalledWith('w.xlsx', 'Empty', undefined, undefined);
    // The failures go to a window the user closes, not a toast; the reason is
    // given, such as an empty sheet (issue 323).
    expect(notify).not.toHaveBeenCalled();
    expect(result.current.batchAddReport).toEqual({
      title: '1 table could not be added',
      summary: '2 Data Blocks added to Project. These tables were left out:',
      items: [{ path: 'w.xlsx › Empty', reason: 'bad file' }],
    });
    act(() => {
      result.current.closeBatchAddReport();
    });
    expect(result.current.batchAddReport).toBeNull();
  });

  it('adds ZIP table members through their archive', async () => {
    mocks.createNodeFromFile.mockReset();
    mocks.createNodeFromFile.mockResolvedValue({});
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
      await result.current.handleAddFilesToWorkspace(
        [
          { id: 'tables/a.csv', label: 'tables/a.csv', path: 'tables/a.csv' },
          { id: 's', label: 'book.ods › Two', path: 'book.ods', sheet: 'Two' },
        ],
        'bundle.zip',
      );
    });

    expect(mocks.createNodeFromFile).toHaveBeenCalledWith(
      'bundle.zip',
      undefined,
      'tables/a.csv',
      undefined,
    );
    expect(mocks.createNodeFromFile).toHaveBeenCalledWith(
      'bundle.zip',
      'Two',
      'book.ods',
      undefined,
    );
    expect(notify).toHaveBeenCalledWith('success', '2 Data Blocks added to Project.');
  });

  it('reads only the JSON tables of a batch at the chosen place', async () => {
    mocks.createNodeFromFile.mockReset();
    mocks.createNodeFromFile.mockResolvedValue({});
    const { result } = renderHook(
      () =>
        useDataLoaderWorkspaceActions({
          workspaceCatalogue: [],
          hasWorkspaceSelected: true,
          notify: vi.fn(),
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleAddFilesToWorkspace(
        [
          { id: 'a.csv', label: 'a.csv', path: 'ocr/a.csv' },
          { id: 'p1.json', label: 'p1.json', path: 'ocr/p1.json' },
        ],
        undefined,
        '/pages/parsing_res_list',
      );
    });

    expect(mocks.createNodeFromFile).toHaveBeenCalledWith(
      'ocr/a.csv',
      undefined,
      undefined,
      undefined,
    );
    expect(mocks.createNodeFromFile).toHaveBeenCalledWith(
      'ocr/p1.json',
      undefined,
      undefined,
      '/pages/parsing_res_list',
    );
  });

  it('adds JSON files as one Data Block and says so', async () => {
    mocks.createNodeFromJsonFiles.mockResolvedValue({ name: 'ocr_records' });
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
      await result.current.handleAddJsonFilesToWorkspace(
        ['ocr/p1.json', 'ocr/p2.json'],
        '/pages/parsing_res_list',
        'ocr.zip',
      );
    });

    expect(mocks.createNodeFromJsonFiles).toHaveBeenCalledWith(
      ['ocr/p1.json', 'ocr/p2.json'],
      '/pages/parsing_res_list',
      'ocr.zip',
    );
    expect(notify).toHaveBeenCalledWith(
      'success',
      'ocr_records added to Project: 2 JSON files as one Data Block.',
    );
  });

  it('names the JSON files a batch left out in a window, not a toast', async () => {
    mocks.createNodeFromJsonFiles.mockResolvedValue({
      name: 'ocr_records',
      skipped_json_files: [{ path: 'p2.json', reason: 'Not valid JSON (line 1)' }],
    });
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
      await result.current.handleAddJsonFilesToWorkspace(['ocr/p1.json', 'ocr/p2.json'], null);
    });

    expect(notify).not.toHaveBeenCalled();
    expect(result.current.batchAddReport).toEqual({
      title: '1 JSON file was left out',
      summary:
        'ocr_records was added to Project with the rows of 1 of 2 files. These files were left out:',
      items: [{ path: 'p2.json', reason: 'Not valid JSON (line 1)' }],
    });
  });
});
