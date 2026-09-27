import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import * as api from '@/features/project/api';
import { useTabSettings } from './useTabSettings';

vi.mock('@/features/project/api', async (original) => ({
  ...(await original<typeof api>()),
  updateTab: vi.fn(),
}));
it('a delayed display preference response cannot restore an old result or request', async () => {
  const tab: api.Tab = {
    id: 'tab',
    kind: 'concordance',
    name: 'Concordance 1',
    position: 0,
    settings: {},
    analysis: { id: 'old-result', request: null, has_result: true },
  };
  const pending = Promise.withResolvers<api.Tab>();
  vi.mocked(api.updateTab).mockReturnValueOnce(pending.promise);
  const client = new QueryClient();
  const key = ['native', 'base', 'tabs', 'concordance'];
  client.setQueryData(key, [tab]);
  const { result } = renderHook(() => useTabSettings('base', tab), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  act(() => result.current.change({ presentation: 'dispersion' }));
  await waitFor(() => expect(api.updateTab).toHaveBeenCalledOnce());
  const accepted = {
    ...tab,
    analysis: { id: 'submitted-analysis', request: { inputs: [] }, has_result: false },
  };
  client.setQueryData(key, [accepted]);
  await act(async () => pending.resolve({ ...tab, settings: { presentation: 'dispersion' } }));
  await waitFor(() => expect(result.current.isPending).toBe(false));
  expect(client.getQueryData(key)).toEqual([
    { ...accepted, settings: { presentation: 'dispersion' } },
  ]);
});
