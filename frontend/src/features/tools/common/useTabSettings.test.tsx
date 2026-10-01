import * as analysesApi from '@/features/tools/common/analysisApi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vite-plus/test';
import { useTabSettings } from './useTabSettings';

vi.mock('@/features/tools/common/analysisApi', async (original) => ({
  ...(await original<object>()),
  updateTab: vi.fn(),
}));
it('a delayed display preference response cannot restore an old result or request', async () => {
  const tab: analysesApi.Tab = {
    id: 'tab',
    kind: 'concordance',
    name: 'Concordance 1',
    position: 0,
    settings: {},
    analysis: {
      request_status: { status: 'supported', request: { kind: 'frequency', request: null } },
      id: 'old-result',
      request: null,
      has_result: true,
    },
  };
  const pending = Promise.withResolvers<analysesApi.Tab>();
  vi.mocked(analysesApi.updateTab).mockReturnValueOnce(pending.promise);
  const client = new QueryClient();
  const key = ['native', 'base', 'tabs', 'concordance'];
  client.setQueryData(key, [tab]);
  const { result } = renderHook(() => useTabSettings('base', tab), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  act(() => result.current.change({ presentation: 'dispersion' }));
  await waitFor(() => expect(analysesApi.updateTab).toHaveBeenCalledOnce());
  const accepted = {
    ...tab,
    analysis: {
      request_status: {
        status: 'supported',
        request: { kind: 'frequency', request: { inputs: [] } },
      },
      id: 'submitted-analysis',
      request: { inputs: [] },
      has_result: false,
    },
  };
  client.setQueryData(key, [accepted]);
  await act(async () => pending.resolve({ ...tab, settings: { presentation: 'dispersion' } }));
  await waitFor(() => expect(result.current.isPending).toBe(false));
  expect(client.getQueryData(key)).toEqual([
    { ...accepted, settings: { presentation: 'dispersion' } },
  ]);
});
