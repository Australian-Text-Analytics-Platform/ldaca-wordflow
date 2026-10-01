import * as transportApi from '@/api/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vite-plus/test';
import { useNodePreferences } from './useNodePreferences';

vi.mock('@/api/client', async (original) => ({
  ...(await original<object>()),
  request: vi.fn(),
}));
it('persists immediately, serializes choices, and refreshes only graph defaults', async () => {
  const first = Promise.withResolvers<undefined>();
  vi.mocked(transportApi.request).mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
  const client = new QueryClient();
  client.setQueryData(['native', 'base', 'graph', 'logical'], {});
  client.setQueryData(['native', 'base', 'analyses', 'saved'], { request: 'unchanged' });
  const { result } = renderHook(() => useNodePreferences('base'), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  act(() => {
    result.current('Corpus 文', { preference: 'document_column', value: 'text' });
    result.current('Corpus 文', { preference: 'color', value: '#123abc' });
  });
  await waitFor(() => expect(transportApi.request).toHaveBeenCalledTimes(1));
  expect(transportApi.request).toHaveBeenCalledWith(
    'base',
    '/api/project/nodes/{table_name}/preferences',
    'patch',
    {
      path: { table_name: 'Corpus 文' },
      body: { preference: 'document_column', value: 'text' },
    },
  );
  await act(async () => first.resolve(undefined));
  await waitFor(() => expect(transportApi.request).toHaveBeenCalledTimes(2));
  expect(client.getQueryState(['native', 'base', 'graph', 'logical'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['native', 'base', 'analyses', 'saved'])?.isInvalidated).toBe(false);
});
