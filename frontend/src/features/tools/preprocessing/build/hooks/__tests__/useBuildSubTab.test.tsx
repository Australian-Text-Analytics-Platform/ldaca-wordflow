import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Field, Int64 } from 'apache-arrow';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { useBuildSubTab } from '../useBuildSubTab';
import * as api from '@/features/project/api';
import { inputNode } from '@/test/nodeMetadata';

vi.mock('../../../projectPreprocessing', () => ({ previewSql: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('updates automatic columns after schema loading but preserves explicit replacements and edits', async () => {
  const apply = vi.fn().mockResolvedValue({ table_name: 'built' });
  const preview = vi.fn().mockResolvedValue({ data: [], columns: [], pagination: null });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result, rerender } = renderHook(
    ({ names }: { names: string[] }) =>
      useBuildSubTab({
        projectBase: '',
        selectedNodes: [inputNode({ id: 'source', name: 'source' })],
        getColumnInfos: () =>
          names.map((name) => ({ name, typeName: 'Int64', field: new Field(name, new Int64()) })),
        isLoading: { operations: false },
        onAlert: vi.fn(),
        buildColumnPreview: preview,
        buildColumnApply: apply,
      }),
    {
      initialProps: { names: [] },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    },
  );
  expect(result.current.draft.column).toBe('col');
  rerender({ names: ['COL', 'col_2', 'n'] });
  expect(result.current.draft.column).toBe('col_3');
  act(() => result.current.addPart({ id: 'n', kind: 'column', column: 'n', operations: [] }));
  await waitFor(() =>
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ column: 'col_3' }) }),
    ),
  );
  await act(() => result.current.apply.handleApply());
  expect(apply).toHaveBeenLastCalledWith('source', expect.objectContaining({ column: 'col_3' }));
  act(() => result.current.setColumn('n'));
  rerender({ names: ['COL', 'col_2', 'col_3', 'n'] });
  expect(result.current.draft.column).toBe('n');
  await act(() => result.current.apply.handleApply());
  expect(apply).toHaveBeenLastCalledWith('source', expect.objectContaining({ column: 'n' }));
  act(() => result.current.setColumn('my new column'));
  rerender({ names: ['n'] });
  expect(result.current.draft.column).toBe('my new column');
});
it('uses one 350ms debounce and applies the current draft before preview completes', async () => {
  vi.useFakeTimers();
  const preview = vi.fn().mockReturnValue(
    new Promise(() => {
      /* Remains pending to verify advisory previews. */
    }),
  );
  const apply = vi.fn().mockResolvedValue({ table_name: 'built' });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(
    () =>
      useBuildSubTab({
        projectBase: '',
        selectedNodes: [inputNode({ id: 'source', name: 'source' })],
        getColumnInfos: () => [
          { name: 'n', typeName: 'Int64', field: new Field('n', new Int64()) },
        ],
        isLoading: { operations: false },
        onAlert: vi.fn(),
        buildColumnPreview: preview,
        buildColumnApply: apply,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    },
  );
  act(() => {
    result.current.addPart({ id: 'n', kind: 'column', column: 'n', operations: [] });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(349);
  });
  expect(preview).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(preview).toHaveBeenCalledTimes(1);
  act(() => {
    result.current.setColumn('latest');
  });
  expect(result.current.apply.canApply).toBe(true);
  await act(async () => {
    await result.current.apply.handleApply();
  });
  expect(apply).toHaveBeenCalledWith('source', expect.objectContaining({ column: 'latest' }));
});

it('preserves explicit scalar SQL and captures overlapping Apply requests', async () => {
  const apply = vi.fn().mockResolvedValue({ table_name: 'source' });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(
    () =>
      useBuildSubTab({
        projectBase: 'project',
        selectedNodes: [inputNode({ id: 'source', name: 'source' })],
        getColumnInfos: () => [
          { name: 'n', typeName: 'Int64', field: new Field('n', new Int64()) },
        ],
        isLoading: { operations: true },
        onAlert: vi.fn(),
        buildColumnApply: apply,
        buildColumnPreview: vi.fn(),
        previewEnabled: false,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    },
  );
  act(() =>
    result.current.addPart({
      id: 'n',
      kind: 'column',
      column: 'n',
      operations: [
        {
          kind: 'mean',
          arguments: {},
          summary: { kind: 'scalar', source: ['data', 'source'] },
        },
      ],
    }),
  );
  act(() => result.current.editSql());
  expect(result.current.draft.sql?.expression).toContain('SELECT avg("n") FROM "data"."source"');
  expect(result.current.draft.sql?.expression).not.toContain('OVER');
  await act(async () => {
    result.current.setSql('"n" + 1');
    result.current.setColumn('one');
    const first = result.current.apply.handleApply();
    result.current.setSql('"n" + 2');
    result.current.setColumn('two');
    const second = result.current.apply.handleApply();
    await Promise.all([first, second]);
  });
  expect(apply.mock.calls.map((call) => call[1])).toEqual([
    { column: 'one', definition: { mode: 'sql', expression: '"n" + 1' } },
    { column: 'two', definition: { mode: 'sql', expression: '"n" + 2' } },
  ]);
  expect(result.current.draft.visual.roots[0]?.operations[0]?.kind).toBe('mean');
});

it.each(['success', 'failure'])(
  'ignores an obsolete parse %s and retains the current SQL draft',
  async (outcome) => {
    let finish!: () => void;
    const parse = vi.spyOn(api, 'parseExpression').mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finish = () =>
            outcome === 'failure'
              ? reject(new Error('obsolete error'))
              : resolve({ kind: 'literal', literal_type: 'number', value: '1', sql: '1' });
        }),
    );
    const cache = new QueryClient();
    const { result } = renderHook(
      () =>
        useBuildSubTab({
          projectBase: 'project',
          selectedNodes: [inputNode({ id: 'source', name: 'source' })],
          getColumnInfos: () => [
            { name: 'n', typeName: 'Int64', field: new Field('n', new Int64()) },
          ],
          isLoading: { operations: false },
          onAlert: vi.fn(),
          buildColumnApply: vi.fn(),
          buildColumnPreview: vi.fn(),
          previewEnabled: false,
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={cache}>{children}</QueryClientProvider>
        ),
      },
    );
    act(() => result.current.addPart({ id: 'n', kind: 'column', column: 'n', operations: [] }));
    act(() => result.current.editSql());
    act(() => result.current.returnToBuilder());
    await waitFor(() => expect(parse).toHaveBeenCalledTimes(1));
    act(() => result.current.setSql('n + 2'));
    expect(parse.mock.calls[0]?.[2]?.aborted).toBe(true);
    await act(async () => {
      finish();
    });
    expect(result.current.draft.sql?.expression).toBe('n + 2');
    expect(result.current.draft.visual.roots[0]?.kind).toBe('column');
    expect(result.current.parseError).toBeUndefined();
  },
);

it('retains invalid SQL with one inline error and no duplicate notification', async () => {
  const { createProjectQueryClient } = await import('@/features/project/projectErrors');
  const { useSessionErrors } = await import('@/features/diagnostics/sessionErrors');
  useSessionErrors.getState().clear();
  vi.spyOn(api, 'parseExpression').mockRejectedValueOnce(new Error('syntax error at end of input'));
  const cache = createProjectQueryClient();
  const { result } = renderHook(
    () =>
      useBuildSubTab({
        projectBase: 'project',
        selectedNodes: [inputNode({ id: 'source', name: 'source' })],
        getColumnInfos: () => [],
        isLoading: { operations: false },
        onAlert: vi.fn(),
        buildColumnApply: vi.fn(),
        buildColumnPreview: vi.fn(),
        previewEnabled: false,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    },
  );
  act(() => result.current.editSql());
  act(() => result.current.setSql('1 +'));
  act(() => result.current.returnToBuilder());
  await waitFor(() => expect(result.current.parseError).toBe('syntax error at end of input'));
  expect(result.current.draft.sql?.expression).toBe('1 +');
  expect(useSessionErrors.getState().entries).toEqual([]);
});
