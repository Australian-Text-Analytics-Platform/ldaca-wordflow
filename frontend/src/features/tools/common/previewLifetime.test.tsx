import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vite-plus/test';
import { useAnalysisPreview } from './useAnalysisPreview';
import { useRetainedPages } from './useRetainedPages';
it('gives repeated submissions fresh identities, removes old pages and cleans up on departure', () => {
  const client = new QueryClient();
  const consume = vi.fn();
  const { result, rerender, unmount } = renderHook(
    ({ active }) => useAnalysisPreview('one', 'tab', active, undefined, consume),
    {
      initialProps: { active: true },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  act(() => result.current.submit({ query: 'same' }));
  expect(result.current.submitted?.generation).toBe(1);
  client.setQueryData(['native', 'one', 'analysis-preview', 'tab', 1], 'old page');
  client.setQueryData(['native', 'two', 'analysis-preview', 'tab', 1], 'other project');
  act(() => result.current.submit({ query: 'same' }));
  expect(result.current.submitted?.generation).toBe(2);
  expect(client.getQueryData(['native', 'one', 'analysis-preview', 'tab', 1])).toBeUndefined();
  act(() => result.current.clear());
  act(() => result.current.submit({ query: 'same' }));
  expect(result.current.submitted?.generation).toBe(3);
  client.setQueryData(['native', 'one', 'analysis-preview', 'tab', 3], 'page');
  rerender({ active: false });
  expect(result.current.submitted).toBeUndefined();
  expect(client.getQueryData(['native', 'one', 'analysis-preview', 'tab', 3])).toBeUndefined();
  unmount();
  expect(client.getQueryData(['native', 'two', 'analysis-preview', 'tab', 1])).toBe(
    'other project',
  );
});
it('retains a bounded last successful page, labels its freshness and never shows another source placeholder', () => {
  const current = { data: 'first', isPlaceholderData: false, isFetching: false, isError: false };
  const { result, rerender } = renderHook(
    ({ scopes, queries }) => useRetainedPages(scopes, queries),
    { initialProps: { scopes: ['A'], queries: [current] } },
  );
  rerender({
    scopes: ['A'],
    queries: [{ ...current, data: undefined as unknown as string, isFetching: true }],
  });
  expect(result.current).toEqual({ pages: ['first'], stale: [true] });
  rerender({ scopes: ['B'], queries: [{ ...current, isPlaceholderData: true }] });
  expect(result.current.pages).toEqual([undefined]);
  rerender({ scopes: ['B'], queries: [{ ...current, data: 'second' }] });
  expect(result.current.pages).toEqual(['second']);
  rerender({ scopes: [], queries: [] });
  expect(result.current.pages).toEqual([]);
});
