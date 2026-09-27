import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { clearTab, type Tab } from './api';

const tabsKey = (base: string, tab: Tab) => ['native', base, 'tabs', tab.kind];
const outputKey = (base: string, id: string | null) => ['native', base, 'analyses', id];

function ownsOutput(cache: QueryClient, base: string, tab: Tab, id: string) {
  const tabs = cache.getQueryData<Tab[]>(tabsKey(base, tab));
  const current = tabs === undefined ? tab : tabs.find((item) => item.id === tab.id);
  return current?.analysis?.id === id && current.analysis.has_result;
}

/** Reconcile a confirmed absence without replacing requests, settings or a newer analysis. */
function markOutputAbsent(cache: QueryClient, base: string, tab: Tab, id: string) {
  cache.setQueriesData<Tab[]>({ queryKey: ['native', base, 'tabs'] }, (tabs) =>
    tabs?.map((item) =>
      item.id === tab.id && item.analysis?.id === id
        ? { ...item, analysis: { ...item.analysis, has_result: false } }
        : item,
    ),
  );
}

/** A manifest read can observe Clear before its SSE notification reaches this window. */
export function savedAnalysisQuery<T>(
  cache: QueryClient,
  base: string,
  tab: Tab,
  read: (id: string, signal: AbortSignal) => Promise<T | null>,
) {
  const id = tab.analysis?.has_result ? tab.analysis.id : null;
  // Analysis identity owns the data; the cache and tab are live ownership guards.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: outputKey(base, id),
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      if (!id || !ownsOutput(cache, base, tab, id)) return null;
      let result: T | null;
      try {
        result = await read(id, signal);
      } catch (error) {
        signal.throwIfAborted();
        if (!ownsOutput(cache, base, tab, id)) return null;
        throw error;
      }
      signal.throwIfAborted();
      if (!ownsOutput(cache, base, tab, id)) return null;
      if (result === null) {
        // Older tab reads must not restore has_result after this authoritative response.
        await cache.cancelQueries({ queryKey: tabsKey(base, tab) });
        markOutputAbsent(cache, base, tab, id);
        const projections = {
          predicate: (query: { queryKey: readonly unknown[] }) =>
            query.queryKey.length > 4 &&
            outputKey(base, id).every((part, index) => query.queryKey[index] === part),
        };
        await cache.cancelQueries(projections);
        cache.removeQueries(projections);
      }
      return result;
    },
  });
}

/** Commit cache ownership only after Clear succeeds; failure retains the previous output. */
export async function clearSavedAnalysis(cache: QueryClient, base: string, tab: Tab) {
  const id = tab.analysis?.id;
  if (id) await cache.cancelQueries({ queryKey: outputKey(base, id) });
  try {
    await clearTab(base, tab.id);
  } catch (error) {
    // Resume reads interrupted for a Clear that never committed.
    if (id) void cache.invalidateQueries({ queryKey: outputKey(base, id) });
    throw error;
  }
  await cache.cancelQueries({ queryKey: tabsKey(base, tab) });
  if (id) {
    await cache.cancelQueries({ queryKey: outputKey(base, id) });
    markOutputAbsent(cache, base, tab, id);
    cache.removeQueries({ queryKey: outputKey(base, id) });
  }
  await cache.invalidateQueries({ queryKey: tabsKey(base, tab) });
}
