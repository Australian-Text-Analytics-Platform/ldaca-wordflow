import { act, renderHook, waitFor } from '@testing-library/react';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import * as api from '@/features/project/api';
import { useStopwords } from './useStopwords';
vi.mock('@/features/project/api', async (original) => ({
  ...(await original<typeof api>()),
  prepareStopwords: vi.fn(),
  readStopwords: vi.fn(),
}));
it('captures the selected View and corpus inputs before asynchronous preparation', async () => {
  const pending = Promise.withResolvers<api.StopwordSource>();
  vi.mocked(api.prepareStopwords).mockImplementationOnce(() => pending.promise);
  vi.mocked(api.readStopwords).mockResolvedValue([]);
  const onSelect = vi.fn().mockResolvedValue(undefined);
  const errors = vi.fn();
  const client = new QueryClient({
    mutationCache: new MutationCache({ onError: errors }),
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const original = { source: { schema: 'data', name: 'original' }, column: 'word' };
  const other = { source: { schema: 'data', name: 'other' }, column: 'text' };
  const { result, rerender } = renderHook(
    ({ selected, inputs }) => useStopwords({ base: '', selected, inputs, active: false, onSelect }),
    {
      initialProps: { selected: original, inputs: [original] },
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  act(() => {
    result.current.edit.mutate();
  });
  await waitFor(() => expect(api.prepareStopwords).toHaveBeenCalledOnce());
  rerender({ selected: other, inputs: [other] });
  await act(async () => {
    pending.resolve({
      source: { schema: 'data', name: 'original_stopwords' },
      column: 'word',
    });
  });
  await waitFor(() => expect(result.current.edit.isSuccess).toBe(true));
  expect(onSelect).toHaveBeenCalledWith({
    source: { schema: 'data', name: 'original_stopwords' },
    column: 'word',
  });
  expect(api.prepareStopwords).toHaveBeenCalledWith('', original, [original]);
  expect(result.current.edit.data?.inputs).toEqual([original]);
  vi.mocked(api.prepareStopwords).mockRejectedValueOnce(new Error('Missing table'));
  act(() => {
    result.current.edit.mutate();
  });
  await waitFor(() => expect(errors).toHaveBeenCalledOnce());
});
