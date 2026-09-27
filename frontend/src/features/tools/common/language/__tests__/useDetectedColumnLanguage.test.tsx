import { type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { tableFromArrays } from 'apache-arrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshProjectQueries } from '@/features/project/projectChanges';
import { useDetectedColumnLanguage } from '../useDetectedColumnLanguage';

const mocks = vi.hoisted(() => ({ querySql: vi.fn(), detect: vi.fn() }));
vi.mock('@/features/project/api', async (importOriginal) => ({
  ...(await importOriginal()),
  querySql: mocks.querySql,
}));
vi.mock('../languageDetection', () => ({ detectLanguageIso6391: mocks.detect }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.querySql.mockResolvedValue(
    tableFromArrays({ text: ['A document', null, 'another document'] }),
  );
  mocks.detect.mockResolvedValue('en');
});

function setup(column = 'text', enabled = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    ({ selectedColumn, enabled }) =>
      useDetectedColumnLanguage({
        base: '',
        target: { schema: 'quotes"schema', name: 'documents' },
        column: selectedColumn,
        enabled,
      }),
    { wrapper, initialProps: { selectedColumn: column, enabled } },
  );
  return { ...view, client };
}

describe('native column-language recommendations', () => {
  it('defers hidden recommendations and only resamples invalidated sources', async () => {
    const { result, client, rerender } = setup('text', false);
    expect(mocks.querySql).not.toHaveBeenCalled();
    rerender({ selectedColumn: 'text', enabled: true });
    await waitFor(() => expect(result.current.data).toBe('en'));
    rerender({ selectedColumn: 'text', enabled: false });
    await act(() =>
      refreshProjectQueries(client, '', { objects: [{ schema: 'other', name: 'documents' }] }),
    );
    rerender({ selectedColumn: 'text', enabled: true });
    expect(mocks.querySql).toHaveBeenCalledTimes(1);
    rerender({ selectedColumn: 'text', enabled: false });
    await act(() =>
      refreshProjectQueries(client, '', {
        objects: [{ schema: 'quotes"schema', name: 'documents' }],
      }),
    );
    expect(mocks.querySql).toHaveBeenCalledTimes(1);
    rerender({ selectedColumn: 'text', enabled: true });
    await waitFor(() => expect(mocks.querySql).toHaveBeenCalledTimes(2));
  });

  it('samples a quoted column through cancellable read SQL and stores only its recommendation', async () => {
    const { result, client } = setup('my"text');
    await waitFor(() => {
      expect(result.current.data).toBe('en');
    });
    expect(mocks.querySql).toHaveBeenCalledWith(
      '',
      [
        {
          sql: 'SELECT substring(CAST("my""text" AS VARCHAR), 1, 20000) FROM "quotes""schema"."documents" LIMIT 100',
        },
      ],
      expect.any(AbortSignal),
    );
    expect(mocks.detect).toHaveBeenCalledWith(
      'A document another document',
      expect.any(AbortSignal),
      '',
    );
    const cache = JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((query) => ({
          key: query.queryKey,
          data: query.state.data,
        })),
    );
    expect(cache).not.toContain('A document');
    expect(cache).not.toContain('another document');
  });

  it('rechecks after data invalidation and bounds the complete detector input', async () => {
    mocks.querySql.mockResolvedValueOnce(tableFromArrays({ text: ['large '.repeat(5000)] }));
    const { result, client } = setup();
    await waitFor(() => {
      expect(result.current.data).toBe('en');
    });
    expect(mocks.detect.mock.calls[0]?.[0]).toHaveLength(20_000);
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['native', '', 'rows'] });
    });
    expect(mocks.detect).toHaveBeenLastCalledWith(
      'A document another document',
      expect.any(AbortSignal),
      '',
    );
    expect(mocks.querySql).toHaveBeenCalledTimes(2);
  });

  it('ignores obsolete detection after switching columns', async () => {
    let resolveOld!: (language: string) => void;
    mocks.detect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const { result, rerender } = setup();
    await waitFor(() => {
      expect(mocks.detect).toHaveBeenCalledOnce();
    });
    const firstSignal = mocks.querySql.mock.calls[0]?.[2] as AbortSignal;
    rerender({ selectedColumn: 'second', enabled: true });
    await waitFor(() => {
      expect(result.current.data).toBe('en');
    });
    expect(firstSignal.aborted).toBe(true);
    await act(async () => {
      resolveOld('ja');
      await Promise.resolve();
    });
    expect(result.current.data).toBe('en');
  });

  it('keeps failures advisory and supports an explicit retry', async () => {
    mocks.detect.mockRejectedValueOnce(new Error('Model unavailable'));
    const { result, client } = setup();
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(client.getQueryCache().getAll()[0]?.meta).toMatchObject({ reportError: false });
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => {
      expect(result.current.data).toBe('en');
    });
  });

  it('aborts the sample request on unmount before any detection begins', async () => {
    let resolveRead!: (value: ReturnType<typeof tableFromArrays>) => void;
    mocks.querySql.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { unmount } = setup();
    await waitFor(() => {
      expect(mocks.querySql).toHaveBeenCalledOnce();
    });
    const signal = mocks.querySql.mock.calls[0]?.[2] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolveRead(tableFromArrays({ text: ['obsolete'] }));
      await Promise.resolve();
    });
    expect(mocks.detect).not.toHaveBeenCalled();
  });
});
