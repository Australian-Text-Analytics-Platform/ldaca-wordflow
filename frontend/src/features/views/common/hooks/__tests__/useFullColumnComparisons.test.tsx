import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useCodeCombinations, useFullColumnComparisons } from '../useFullColumnComparisons';

const queryWorkspaceSqlTable = vi.hoisted(() => vi.fn());

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  queryWorkspaceSqlTable,
}));

describe('useFullColumnComparisons', () => {
  it('shares canonical Codebook classes between the query key and SQL', async () => {
    queryWorkspaceSqlTable.mockResolvedValue({
      columns: ['__reference', '__comparison', '__count'],
      rows: [{ __reference: 'job', __comparison: 'covid', __count: 2 }],
      hasNext: false,
      etag: 'revision-1',
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useFullColumnComparisons({
          workspaceId: 'workspace-1',
          nodeIds: ['node-1'],
          sql: 'SELECT * FROM "node-1"',
          referenceColumn: 'annotation',
          comparisonColumns: ['reviewer'],
          classOptions: [' job ', 'covid', 'job', ''],
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current[0]?.isSuccess).toBe(true);
    });
    expect(queryWorkspaceSqlTable).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          sql: expect.stringContaining("IN ('job', 'covid')"),
        }),
      }),
    );
    expect(client.getQueryCache().getAll()[0]?.queryKey).toEqual([
      'workspaces',
      'workspace-1',
      'annotation-column-comparisons',
      {
        nodeIds: ['node-1'],
        sql: 'SELECT * FROM "node-1"',
        referenceColumn: 'annotation',
        comparisonColumn: 'reviewer',
        classOptions: ['job', 'covid'],
      },
    ]);
  });

  it('counts every coder’s codes per row for the multi-coder Alpha, two coders or more', async () => {
    queryWorkspaceSqlTable.mockReset().mockResolvedValue({
      columns: ['__coder_0', '__coder_1', '__coder_2', '__count'],
      rows: [
        { __coder_0: 'job', __coder_1: 'job', __coder_2: null, __count: 3 },
        { __coder_0: 'job', __coder_1: 'covid', __coder_2: 'job', __count: 1 },
      ],
      hasNext: false,
      etag: 'revision-1',
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useCodeCombinations({
          workspaceId: 'workspace-1',
          nodeIds: ['node-1'],
          sql: 'SELECT * FROM "node-1"',
          columns: ['annotation', 'reviewer', 'model'],
          classOptions: ['job', 'covid'],
          enabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual([
      { values: ['job', 'job', null], count: 3 },
      { values: ['job', 'covid', 'job'], count: 1 },
    ]);
    const sql = String(queryWorkspaceSqlTable.mock.calls[0]?.[0]?.body?.sql);
    expect(sql).toContain('>= 2');
    expect(sql).toContain('GROUP BY "__coder_0", "__coder_1", "__coder_2"');
  });

  it('waits until Alpha is chosen with two comparisons', () => {
    queryWorkspaceSqlTable.mockReset();
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(
      () =>
        useCodeCombinations({
          workspaceId: 'workspace-1',
          nodeIds: ['node-1'],
          sql: 'SELECT 1',
          columns: ['annotation', 'reviewer'],
          classOptions: ['job'],
          enabled: true,
        }),
      { wrapper },
    );
    expect(queryWorkspaceSqlTable).not.toHaveBeenCalled();
  });
});
