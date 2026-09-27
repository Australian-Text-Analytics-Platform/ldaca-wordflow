import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { objectDependencies, refreshProjectQueries } from './projectChanges';

it('refreshes only live dependencies, preserving independent and immutable results', async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const resources = [
    { key: ['schema', 'main', 'words'], objects: [{ schema: 'main', name: 'words' }] },
    { key: ['rows', 'main', 'words'], objects: [{ schema: 'main', name: 'words' }] },
    { key: ['analyses', 'saved', 'rows'], objects: [{ schema: 'main', name: 'words' }] },
    { key: ['rows', 'other', 'words'], objects: [{ schema: 'other', name: 'words' }] },
    { key: ['analyses', 'saved'], objects: [] },
    { key: ['graph', 'logical'], objects: [] },
  ];
  const readers = resources.map(() => vi.fn(async () => 'data'));
  const unsubscribes = resources.map((resource, index) =>
    new QueryObserver(cache, {
      queryKey: ['native', 'project', ...resource.key],
      queryFn: readers[index],
      meta: objectDependencies(...resource.objects),
      staleTime: Infinity,
    }).subscribe(vi.fn()),
  );
  await vi.waitFor(() => expect(cache.isFetching()).toBe(0));
  await refreshProjectQueries(cache, 'project', { objects: [{ schema: 'MAIN', name: 'WORDS' }] });
  expect(readers.map((read) => read.mock.calls.length)).toEqual([2, 2, 2, 1, 1, 1]);
  await refreshProjectQueries(cache, 'project', { resources: ['graph'] });
  expect(readers.map((read) => read.mock.calls.length)).toEqual([2, 2, 2, 1, 1, 2]);
  await refreshProjectQueries(cache, 'project', { all: true });
  expect(readers.map((read) => read.mock.calls.length)).toEqual([3, 3, 3, 2, 2, 3]);
  unsubscribes.forEach((unsubscribe) => unsubscribe());
  cache.clear();
});

it('marks inactive dependencies stale without reading them, excluding other projects', async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const read = vi.fn(async () => 'data');
  for (const base of ['project', 'elsewhere'])
    await cache.fetchQuery({
      queryKey: ['native', base, 'rows', 'main', 'words'],
      queryFn: read,
      meta: objectDependencies({ schema: 'main', name: 'words' }),
      staleTime: Infinity,
    });
  await refreshProjectQueries(cache, 'project', { objects: [{ schema: 'main', name: 'words' }] });
  expect(read).toHaveBeenCalledTimes(2);
  expect(cache.getQueryState(['native', 'project', 'rows', 'main', 'words'])?.isInvalidated).toBe(
    true,
  );
  expect(cache.getQueryState(['native', 'elsewhere', 'rows', 'main', 'words'])?.isInvalidated).toBe(
    false,
  );
  cache.clear();
});

it('invalidates only named analysis outputs and removes cleared output under its retained identity', async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const readers = [vi.fn(async () => 'first'), vi.fn(async () => 'second')];
  const unsubscribes = readers.map((queryFn, index) =>
    new QueryObserver(cache, {
      queryKey: ['native', 'project', 'analyses', String(index)],
      queryFn,
      staleTime: Infinity,
    }).subscribe(vi.fn()),
  );
  await vi.waitFor(() => expect(cache.isFetching()).toBe(0));
  await refreshProjectQueries(cache, 'project', { analysis_ids: ['0'] });
  expect(readers.map((fn) => fn.mock.calls.length)).toEqual([2, 1]);
  unsubscribes.forEach((fn) => fn());
  cache.setQueryData(
    ['native', 'project', 'tabs', 'frequency'],
    [
      {
        id: 'tab',
        kind: 'frequency',
        name: 'Frequency 1',
        position: 0,
        settings: {},
        analysis: { id: '0', request: { inputs: [] }, has_result: false },
      },
    ],
  );
  await refreshProjectQueries(cache, 'project', { resources: ['tabs'], analysis_ids: ['0'] });
  expect(cache.getQueryData(['native', 'project', 'analyses', '0'])).toBeUndefined();
  expect(cache.getQueryData(['native', 'project', 'analyses', '1'])).toBe('second');
  cache.clear();
});

it('drops a replaced analysis and ignores its late response without refreshing unrelated output', async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let analysis = { id: 'old', request: {}, has_result: true };
  const tabKey = ['native', 'project', 'tabs', 'frequency'];
  const readTabs = vi.fn(async () => [
    { id: 'tab', kind: 'frequency', name: 'Frequency 1', position: 0, settings: {}, analysis },
  ]);
  const stopTabs = new QueryObserver(cache, {
    queryKey: tabKey,
    queryFn: readTabs,
  }).subscribe(vi.fn());
  await vi.waitFor(() => expect(cache.isFetching()).toBe(0));
  const late = Promise.withResolvers<string>();
  const outputKey = ['native', 'project', 'analyses', 'old'];
  const readOutput = vi.fn(() => late.promise);
  const stopOutput = new QueryObserver(cache, {
    queryKey: outputKey,
    queryFn: readOutput,
  }).subscribe(vi.fn());
  cache.setQueryData(['native', 'project', 'analyses', 'independent'], 'untouched');
  analysis = { id: 'new', request: {}, has_result: false };
  await refreshProjectQueries(cache, 'project', {
    resources: ['tabs'],
    analysis_ids: ['old', 'new'],
  });
  late.resolve('obsolete');
  await Promise.resolve();
  expect(cache.getQueryData(outputKey)).toBeUndefined();
  expect(cache.getQueryData(['native', 'project', 'analyses', 'independent'])).toBe('untouched');
  stopOutput();
  stopTabs();
  cache.clear();
});
