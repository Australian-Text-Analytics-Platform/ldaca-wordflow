import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import * as api from '@/features/project/api';
import { useFrequencySettings } from './frequencySettings';
import { useFrequencyState } from './frequencyState';

vi.mock('@/features/project/api', async (original) => ({
  ...(await original<typeof api>()),
  updateTab: vi.fn(),
}));
it('preserves pending choices over commit refreshes and restores saved settings on failure', async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const key = ['native', 'project', 'tabs', 'frequency'];
  const tab: api.Tab = {
    id: 'tab',
    kind: 'frequency',
    name: 'Frequency 1',
    position: 0,
    settings: { colors: {} },
    analysis: null,
  };
  cache.setQueryData(key, [tab]);
  const readTabs = vi.fn(async () => [tab]);
  const first = Promise.withResolvers<api.Tab>();
  const second = Promise.withResolvers<api.Tab>();
  vi.mocked(api.updateTab)
    .mockReset()
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => {
      const tabs = useQuery({ queryKey: key, queryFn: readTabs, staleTime: Infinity });
      return useFrequencySettings('project', tabs.data?.[0] ?? tab, false, []);
    },
    { wrapper },
  );
  let a!: Promise<void>;
  let b!: Promise<void>;
  act(() => {
    a = result.current.persist({ colors: { corpus: '#ff0000' } });
    b = result.current.persist({ stopwordsEnabled: true });
  });
  await waitFor(() => expect(result.current.settings.stopwordsEnabled).toBe(true));
  act(() => cache.setQueryData(key, [tab]));
  expect(result.current.settings.colors).toEqual({ corpus: '#ff0000' });
  expect(api.updateTab).toHaveBeenCalledTimes(1);
  await act(async () => {
    first.resolve({ ...tab, settings: { colors: { corpus: '#ff0000' } } });
    await a;
  });
  await waitFor(() => expect(api.updateTab).toHaveBeenCalledTimes(2));
  expect(result.current.settings.stopwordsEnabled).toBe(true);
  await act(async () => {
    second.reject(new Error('Conflict'));
    await expect(b).rejects.toThrow('Conflict');
  });
  await waitFor(() => expect(result.current.settings.stopwordsEnabled).toBe(false));
  expect(result.current.settings.colors).toEqual({ corpus: '#ff0000' });
  act(() => result.current.change({ filter: 'cat*', display: 'list' }));
  expect(useFrequencyState.getState().display[JSON.stringify(['project', 'tab'])]?.filter).toBe(
    'cat*',
  );
  expect(api.updateTab).toHaveBeenCalledTimes(2);
  cache.clear();
});
