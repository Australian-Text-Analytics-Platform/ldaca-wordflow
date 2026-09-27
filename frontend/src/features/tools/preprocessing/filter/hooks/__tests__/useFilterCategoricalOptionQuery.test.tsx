import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Dictionary, Field, Uint8, Utf8 } from 'apache-arrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const preview = vi.hoisted(() => vi.fn());
vi.mock('../../../projectPreprocessing', () => ({ previewSql: preview }));
import { useFilterCategoricalOptionQuery } from '../useFilterCategoricalOptionQuery';
const args = {
  projectBase: 'http://project',
  nodeId: 'table',
  column: 'speaker',
  searchQuery: '',
  columnOption: {
    name: 'speaker',
    typeName: 'Dictionary<Uint8,Utf8>',
    field: new Field('speaker', new Dictionary(new Utf8(), new Uint8())),
  },
};
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}
const result = (data: unknown[], has_next = false) => ({ data, pagination: { has_next } });
beforeEach(() => preview.mockReset());
describe('native categorical options', () => {
  it('keeps NULL and exact counts', async () => {
    preview.mockResolvedValue(
      result([
        { value: null, count: '2' },
        { value: 'Alice', count: '9007199254740993' },
      ]),
    );
    const view = renderHook(() => useFilterCategoricalOptionQuery(args), { wrapper });
    await waitFor(() => expect(view.result.current.options).toHaveLength(2));
    expect(view.result.current.options[1]?.count).toBe('9007199254740993');
    expect(preview).toHaveBeenCalledWith(
      'http://project',
      expect.stringContaining('GROUP BY'),
      1,
      500,
      expect.any(AbortSignal),
    );
  });
  it('appends independent pages without duplicate option values', async () => {
    preview
      .mockResolvedValueOnce(result([{ value: 'Alice' }], true))
      .mockResolvedValueOnce(result([{ value: 'Alice' }, { value: 'Bob' }]));
    const view = renderHook(() => useFilterCategoricalOptionQuery(args), { wrapper });
    await waitFor(() => expect(view.result.current.hasNext).toBe(true));
    await act(async () => {
      await view.result.current.loadMore();
    });
    await waitFor(() =>
      expect(view.result.current.options.map((option) => option.value)).toEqual(['Alice', 'Bob']),
    );
  });
  it('debounces literal searches and passes cancellation signals', async () => {
    preview.mockResolvedValue(result([{ value: 'Alice' }]));
    const view = renderHook(
      ({ searchQuery }) => useFilterCategoricalOptionQuery({ ...args, searchQuery }),
      { wrapper, initialProps: { searchQuery: '' } },
    );
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    view.rerender({ searchQuery: 'ali*' });
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(preview.mock.calls[1]?.[1]).toContain(
      'contains(lower(CAST("value" AS VARCHAR)), lower(\'ali*\'))',
    );
  });
});
