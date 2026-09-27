import { QueryCache, QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import * as api from './api';
import { refreshProjectQueries } from './projectChanges';
import { clearSavedAnalysis, savedAnalysisQuery } from './savedAnalysis';

const base = 'http://test';
const tab: api.Tab = {
  id: 'tab',
  kind: 'frequency',
  name: 'Frequency 1',
  position: 0,
  settings: { colors: ['blue'] },
  analysis: { id: 'saved', request: { inputs: [] }, has_result: true },
};
const tabKey = ['native', base, 'tabs', 'frequency'];
const outputKey = ['native', base, 'analyses', 'saved'];
const pageKey = [...outputKey, 'rows'];
const independentKey = ['native', base, 'analyses', 'independent'];
const clients: QueryClient[] = [];
const subscriptions: (() => void)[] = [];

function setup() {
  const errors = vi.fn();
  const cache = new QueryClient({
    queryCache: new QueryCache({ onError: errors }),
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(cache);
  cache.setQueryData(tabKey, [tab]);
  return { cache, errors };
}

afterEach(() => {
  subscriptions.splice(0).forEach((stop) => stop());
  clients.splice(0).forEach((cache) => cache.clear());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('handles Clear overtaking the output phase of a broad refresh before its SSE event', async () => {
  const { cache, errors } = setup();
  let hasResult = true;
  const readTabs = vi.fn(async () => [
    { ...tab, analysis: { ...tab.analysis, has_result: hasResult } },
  ]);
  subscriptions.push(
    new QueryObserver(cache, {
      queryKey: tabKey,
      queryFn: readTabs,
    }).subscribe(vi.fn()),
  );
  const schemaGate = Promise.withResolvers<string>();
  const readSchema = vi
    .fn()
    .mockResolvedValueOnce('schema')
    .mockImplementation(() => schemaGate.promise);
  subscriptions.push(
    new QueryObserver(cache, {
      queryKey: ['native', base, 'schema', 'data', 'source'],
      queryFn: readSchema,
    }).subscribe(vi.fn()),
  );
  const fetch = vi.fn(async () =>
    Response.json({
      id: 'saved',
      kind: 'frequency',
      request: {},
      result: hasResult ? { version: 1, payload: { corpora: [] }, finished_at: '' } : null,
    }),
  );
  vi.stubGlobal('fetch', fetch);
  subscriptions.push(
    new QueryObserver(
      cache,
      savedAnalysisQuery(cache, base, tab, (id, signal) =>
        api.getFrequencyResult(base, id, signal),
      ),
    ).subscribe(vi.fn()),
  );
  const readPage = vi.fn(async () => {
    if (!hasResult) throw new Error('Analysis result is unavailable');
    return 'old page';
  });
  subscriptions.push(
    new QueryObserver(cache, {
      queryKey: pageKey,
      queryFn: readPage,
    }).subscribe(vi.fn()),
  );
  cache.setQueryData(independentKey, 'independent');
  await vi.waitFor(() => expect(cache.isFetching()).toBe(0));
  const refresh = refreshProjectQueries(cache, base, { all: true });
  await vi.waitFor(() => expect(readSchema).toHaveBeenCalledTimes(2));
  // Simulate a committed Clear in another window while this window's refresh is paused.
  hasResult = false;
  schemaGate.resolve('schema');
  await refresh;
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(readPage).toHaveBeenCalledOnce();
  expect(errors).not.toHaveBeenCalled();
  expect(cache.getQueryData(outputKey)).toBeNull();
  expect(cache.getQueryData(pageKey)).toBeUndefined();
  expect(cache.getQueryData<api.Tab[]>(tabKey)?.[0]?.analysis?.has_result).toBe(false);
  await refreshProjectQueries(cache, base, { resources: ['tabs'], analysis_ids: ['saved'] });
  expect(cache.getQueryData(outputKey)).toBeUndefined();
  expect(cache.getQueryData(independentKey)).toBe('independent');
});

it('commits Clear to tab ownership and removes only its output, ignoring an older tab response', async () => {
  const { cache } = setup();
  cache.setQueryData(outputKey, 'manifest');
  cache.setQueryData(pageKey, 'page');
  cache.setQueryData(independentKey, 'independent');
  const oldTabs = Promise.withResolvers<api.Tab[]>();
  const pendingTabs = cache
    .fetchQuery({
      queryKey: tabKey,
      queryFn: vi.fn(() => oldTabs.promise),
      staleTime: 0,
    })
    .catch(() => undefined);
  const clear = Promise.withResolvers<undefined>();
  vi.spyOn(api, 'clearTab').mockImplementation(() => clear.promise);
  const clearing = clearSavedAnalysis(cache, base, tab);
  await vi.waitFor(() => expect(api.clearTab).toHaveBeenCalledOnce());
  expect(cache.getQueryData(outputKey)).toBe('manifest');
  clear.resolve(undefined);
  await clearing;
  oldTabs.resolve([tab]);
  await pendingTabs;
  expect(cache.getQueryData<api.Tab[]>(tabKey)?.[0]).toEqual({
    ...tab,
    analysis: { ...tab.analysis, has_result: false },
  });
  expect(cache.getQueryData(outputKey)).toBeUndefined();
  expect(cache.getQueryData(pageKey)).toBeUndefined();
  expect(cache.getQueryData(independentKey)).toBe('independent');
});

it('does not start a stale manifest read after Clear has reconciled ownership', async () => {
  const { cache } = setup();
  vi.spyOn(api, 'clearTab').mockResolvedValue(undefined);
  await clearSavedAnalysis(cache, base, tab);
  const read = vi.fn(async () => 'stale');
  await expect(cache.fetchQuery(savedAnalysisQuery(cache, base, tab, read))).resolves.toBeNull();
  expect(read).not.toHaveBeenCalled();
});

it('keeps existing output and ownership when Clear fails', async () => {
  const { cache } = setup();
  cache.setQueryData(outputKey, 'manifest');
  cache.setQueryData(pageKey, 'page');
  vi.spyOn(api, 'clearTab').mockRejectedValue(new Error('Protected table'));
  await expect(clearSavedAnalysis(cache, base, tab)).rejects.toThrow('Protected table');
  expect(cache.getQueryData(tabKey)).toEqual([tab]);
  expect(cache.getQueryData(outputKey)).toBe('manifest');
  expect(cache.getQueryData(pageKey)).toBe('page');
});

it.each(['output', 'error'] as const)(
  'ignores late $0 from a replaced analysis',
  async (outcome) => {
    const { cache, errors } = setup();
    const late = Promise.withResolvers<string>();
    const read = vi.fn(() => late.promise);
    const pending = cache.fetchQuery(savedAnalysisQuery(cache, base, tab, read));
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    const replacement = { ...tab, analysis: { id: 'replacement', request: {}, has_result: true } };
    cache.setQueryData(tabKey, [replacement]);
    if (outcome === 'error') late.reject(new Error('Deleted analysis'));
    else late.resolve('obsolete output');
    await expect(pending).resolves.toBeNull();
    expect(cache.getQueryData(tabKey)).toEqual([replacement]);
    expect(errors).not.toHaveBeenCalled();
  },
);

it('resumes an interrupted initial manifest load when Clear fails', async () => {
  const { cache } = setup();
  const first = Promise.withResolvers<string>();
  const read = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValue('manifest');
  subscriptions.push(
    new QueryObserver(cache, savedAnalysisQuery(cache, base, tab, read)).subscribe(vi.fn()),
  );
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
  vi.spyOn(api, 'clearTab').mockRejectedValue(new Error('Clear failed'));
  await expect(clearSavedAnalysis(cache, base, tab)).rejects.toThrow('Clear failed');
  await vi.waitFor(() => expect(cache.getQueryData(outputKey)).toBe('manifest'));
  first.resolve('obsolete');
  await first.promise;
  expect(cache.getQueryData(outputKey)).toBe('manifest');
  expect(cache.getQueryData(tabKey)).toEqual([tab]);
});

it('cancels projections and stale tab reads when a manifest confirms no output', async () => {
  const { cache, errors } = setup();
  const oldTabs = Promise.withResolvers<api.Tab[]>();
  const oldPage = Promise.withResolvers<string>();
  const tabs = cache
    .fetchQuery({ queryKey: tabKey, queryFn: vi.fn(() => oldTabs.promise), staleTime: 0 })
    .catch(() => undefined);
  const page = cache
    .fetchQuery({ queryKey: pageKey, queryFn: vi.fn(() => oldPage.promise) })
    .catch(() => undefined);
  await expect(
    cache.fetchQuery(savedAnalysisQuery(cache, base, tab, async () => null)),
  ).resolves.toBeNull();
  oldTabs.resolve([tab]);
  oldPage.resolve('obsolete page');
  await Promise.all([tabs, page]);
  expect(cache.getQueryData<api.Tab[]>(tabKey)?.[0]?.analysis?.has_result).toBe(false);
  expect(cache.getQueryData(pageKey)).toBeUndefined();
  expect(errors).not.toHaveBeenCalled();
});

it('still reports a genuine current-result loading failure to the query error owner', async () => {
  const { cache, errors } = setup();
  const failure = new Error('Unsupported result version');
  await expect(
    cache.fetchQuery(
      savedAnalysisQuery(cache, base, tab, async () => {
        throw failure;
      }),
    ),
  ).rejects.toBe(failure);
  expect(errors).toHaveBeenCalledOnce();
  expect(errors.mock.calls[0]?.[0]).toBe(failure);
  expect(cache.getQueryData(tabKey)).toEqual([tab]);
});
