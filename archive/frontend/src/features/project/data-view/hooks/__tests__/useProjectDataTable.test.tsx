import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Field, Utf8 } from 'apache-arrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';

const queryProjectSqlTableMock = vi.hoisted(() => vi.fn());
const useProjectDataMock = vi.hoisted(() => vi.fn());
const useProjectSelectionMock = vi.hoisted(() => vi.fn());
const useProjectStatusMock = vi.hoisted(() => vi.fn());
const useProjectActionsMock = vi.hoisted(() => vi.fn());

vi.mock('@/api', () => ({
  queryProjectSqlTable: queryProjectSqlTableMock,
  sqlOrder: (column: string, descending: boolean) =>
    `"${column}" ${descending ? 'DESC' : 'ASC'} NULLS FIRST`,
  sqlTable: (value: string) => `"${value}"`,
}));
vi.mock('@/features/project/common/hooks/useProjectData', () => ({
  useProjectData: useProjectDataMock,
}));
vi.mock('@/features/project/common/hooks/useProjectSelection', () => ({
  useProjectSelection: useProjectSelectionMock,
}));
vi.mock('@/features/project/common/hooks/useProjectStatus', () => ({
  useProjectStatus: useProjectStatusMock,
}));
vi.mock('@/features/project/common/hooks/useProjectActions', () => ({
  useProjectActions: useProjectActionsMock,
}));

import { useProjectDataTable } from '../useProjectDataTable';

const activateNode = vi.fn();
const reorderSelectedNodes = vi.fn();
const removeNode = vi.fn();

const makeArrowPage = (
  columns: { name: string; field: Field }[] = [
    { name: 'text', field: new Field('text', new Utf8()) },
  ],
  rows: Record<string, unknown>[] = [{ text: 'row' }],
  hasNext = false,
) => ({
  table: {},
  rows,
  columns: columns.map((column) => column.name),
  schema: columns,
  hasNext,
  etag: 'etag-1',
});

const createWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('useProjectDataTable', () => {
  beforeEach(() => {
    activateNode.mockReset();
    reorderSelectedNodes.mockReset();
    removeNode.mockReset();
    queryProjectSqlTableMock.mockReset();
    queryProjectSqlTableMock.mockResolvedValue(makeArrowPage());
    useProjectDataMock.mockReturnValue({
      currentProjectId: 'project-1',
    });
    const selectedNodes = [
      { id: 'node-a', name: 'A', shape: [100, 1] },
      { id: 'node-b', name: 'B', shape: [1_000, 1] },
      { id: 'node-c', name: 'C', shape: [50, 1] },
    ];
    useProjectSelectionMock.mockReturnValue({
      activeNodeId: 'node-b',
      selectedNode: selectedNodes[1],
      selectedNodes,
      selectedNodeIds: selectedNodes.map((node) => node.id),
    });
    useProjectStatusMock.mockReturnValue({ isLoading: { nodeData: false } });
    useProjectActionsMock.mockReturnValue({
      activateNode,
      reorderSelectedNodes,
      removeNode,
      castColumn: vi.fn(),
      renameColumn: vi.fn(),
      deleteColumn: vi.fn(),
      refreshNodeSchema: vi.fn(),
      deleteNode: vi.fn(),
      renameNode: vi.fn(),
      undoNode: vi.fn(),
      redoNode: vi.fn(),
      selectNodes: vi.fn(),
      toggleNodeSelection: vi.fn(),
    });
  });

  it('delegates tab activation, close, and reorder to semantic selection actions', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useProjectDataTable(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.tabs.onTabChange('node-c');
      result.current.tabs.onTabClose('node-a');
      result.current.tabs.onTabReorder(['node-c', 'node-b', 'node-a']);
    });

    expect(activateNode).toHaveBeenCalledWith('node-c');
    expect(removeNode).toHaveBeenCalledWith('node-a');
    expect(reorderSelectedNodes).toHaveBeenCalledWith(['node-c', 'node-b', 'node-a']);
  });

  it('uses one complete request object for the query key and SDK request', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderHook(() => useProjectDataTable(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(queryProjectSqlTableMock).toHaveBeenCalledTimes(1);
    });

    expect(queryProjectSqlTableMock).toHaveBeenLastCalledWith({
      path: { workspace_id: 'project-1' },
      body: {
        mode: 'query',
        node_ids: ['node-b'],
        sql: 'SELECT * FROM "node-b"',
        page: 1,
        page_size: 20,
      },
    });
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .some(
          (query) =>
            JSON.stringify(query.queryKey) ===
            JSON.stringify([
              'projects',
              'project-1',
              'sql',
              {
                nodeIds: ['node-b'],
                sql: 'SELECT * FROM "node-b"',
                page: 1,
                pageSize: 20,
              },
            ]),
        ),
    ).toBe(true);
  });

  it('projects a raw Project SQL page already cached by Annotation', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      queryKeys.projectSql('project-1', ['node-b'], 'SELECT * FROM "node-b"', 1, 20),
      makeArrowPage(),
    );

    const { result } = renderHook(() => useProjectDataTable(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.table.data).toEqual([{ text: 'row' }]);
    expect(result.current.table.columns).toEqual(['text']);
    expect(result.current.table.columnFields.text?.type.toString()).toBe('Utf8');
  });

  it('preserves the schema of an empty class-description Data Block', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      queryKeys.projectSql('project-1', ['node-b'], 'SELECT * FROM "node-b"', 1, 20),
      makeArrowPage(
        [
          { name: 'class', field: new Field('class', new Utf8()) },
          { name: 'description', field: new Field('description', new Utf8()) },
        ],
        [],
      ),
    );

    const { result } = renderHook(() => useProjectDataTable(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.header.isEmptyTable).toBe(true);
    expect(result.current.table.data).toEqual([]);
    expect(result.current.table.columns).toEqual(['class', 'description']);
    expect(result.current.table.columnFields.class?.type.toString()).toBe('Utf8');
    expect(result.current.table.columnFields.description?.type.toString()).toBe('Utf8');
  });

  it('uses the selected Data Block shape as the exact Data View row count', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useProjectDataTable(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.table.rowCount).toBe(1_000);
    expect(result.current.table.hasNext).toBeUndefined();
  });

  it('falls back to Arrow lookahead when the Data Block row count is unknown', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const selectedNode = { id: 'node-b', name: 'B', shape: [null, 1] };
    useProjectSelectionMock.mockReturnValue({
      activeNodeId: selectedNode.id,
      selectedNode,
      selectedNodes: [selectedNode],
      selectedNodeIds: [selectedNode.id],
    });
    queryProjectSqlTableMock.mockResolvedValue(makeArrowPage(undefined, undefined, true));

    const { result } = renderHook(() => useProjectDataTable(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.table.hasNext).toBe(true);
    });
    expect(result.current.table.rowCount).toBeUndefined();
  });

  it('retains the current Data Block page while an uncached sort is fetching', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const sortedPage = deferred<ReturnType<typeof makeArrowPage>>();
    queryProjectSqlTableMock
      .mockResolvedValueOnce(makeArrowPage(undefined, [{ text: 'before-sort' }]))
      .mockReturnValueOnce(sortedPage.promise);

    const { result } = renderHook(() => useProjectDataTable(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.table.data).toEqual([{ text: 'before-sort' }]);
    });

    act(() => {
      result.current.table.onSortingChange?.([{ id: 'text', desc: false }]);
    });

    await waitFor(() => {
      expect(queryProjectSqlTableMock).toHaveBeenCalledTimes(2);
      expect(result.current.table.fetching).toBe(true);
    });
    expect(result.current.table.loading).toBe(false);
    expect(result.current.table.data).toEqual([{ text: 'before-sort' }]);

    act(() => {
      sortedPage.resolve(makeArrowPage(undefined, [{ text: 'after-sort' }]));
    });

    await waitFor(() => {
      expect(result.current.table.fetching).toBe(false);
      expect(result.current.table.data).toEqual([{ text: 'after-sort' }]);
    });
  });

  it('does not retain rows across Data Block ownership changes', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const nextNodePage = deferred<ReturnType<typeof makeArrowPage>>();
    queryProjectSqlTableMock
      .mockResolvedValueOnce(makeArrowPage(undefined, [{ text: 'node-b-row' }]))
      .mockReturnValueOnce(nextNodePage.promise);

    const { result, rerender } = renderHook(() => useProjectDataTable(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.table.data).toEqual([{ text: 'node-b-row' }]);
    });

    const nextNode = { id: 'node-a', name: 'A', shape: [100, 1] };
    useProjectSelectionMock.mockReturnValue({
      activeNodeId: nextNode.id,
      selectedNode: nextNode,
      selectedNodes: [nextNode],
      selectedNodeIds: [nextNode.id],
    });
    rerender();

    await waitFor(() => {
      expect(queryProjectSqlTableMock).toHaveBeenCalledTimes(2);
      expect(result.current.table.loading).toBe(true);
      expect(result.current.table.fetching).toBe(true);
    });
    expect(result.current.table.data).toEqual([]);
  });
});
