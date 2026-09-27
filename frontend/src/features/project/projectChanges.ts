import type { components } from '@/api/generated/native';
import type { Query, QueryClient } from '@tanstack/react-query';
import { objectRef, type DataTarget, type ObjectRef } from './api';
import type { Tab } from './api';

export type ChangeScope = components['schemas']['ChangeScope'];

/** Live dependencies only: saved analysis provenance is not a query dependency. */
export const objectDependencies = (...targets: DataTarget[]) => ({
  objects: targets.map(objectRef),
});

const databaseResources = new Set([
  'graph',
  'schema',
  'rows',
  'definition',
  'preprocessing',
  'preprocessing-options',
  'tabs',
  'analyses',
  'analysis-preview',
  'sql-cells',
  'sql-types',
  'project',
]);
const folded = (name: string) => name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
function affectedQuery(query: Query, base: string, change: ChangeScope) {
  const [host, connection, resource] = query.queryKey;
  if (host !== 'native' || connection !== base || typeof resource !== 'string') return false;
  if (change.all) return databaseResources.has(resource) || Boolean(query.meta?.objects);
  if (resource === 'analyses' && change.analysis_ids?.includes(String(query.queryKey[3])))
    return true;
  if (change.resources?.some((name) => name.replaceAll('_', '-') === resource)) return true;
  const dependencies = query.meta?.objects as ObjectRef[] | undefined;
  return Boolean(
    dependencies?.some((dependency) =>
      change.objects?.some(
        (object) =>
          folded(object.schema) === folded(dependency.schema) &&
          folded(object.name) === folded(dependency.name),
      ),
    ),
  );
}

/** One observer owns refresh, including cancellation of requests from an older snapshot. */
export async function refreshProjectQueries(cache: QueryClient, base: string, change: ChangeScope) {
  const predicate = (query: Query) => affectedQuery(query, base, change);
  const priorIds = new Set(
    cache
      .getQueriesData<Tab[]>({ queryKey: ['native', base, 'tabs'] })
      .flatMap(
        ([, values]) => values?.flatMap((tab) => (tab.analysis ? [tab.analysis.id] : [])) ?? [],
      ),
  );
  await cache.cancelQueries({ predicate });
  // Reconcile ownership before refreshing output. Cleared or replaced output must
  // not survive in the cache under an analysis identity retained by Clear.
  await cache.invalidateQueries({
    predicate: (query) => predicate(query) && query.queryKey[2] === 'tabs',
    refetchType: 'all',
  });
  const tabs = cache.getQueriesData<Tab[]>({ queryKey: ['native', base, 'tabs'] });
  const currentIds = new Set(
    tabs.flatMap(
      ([, values]) => values?.flatMap((tab) => (tab.analysis ? [tab.analysis.id] : [])) ?? [],
    ),
  );
  const noOutput = new Set(
    tabs.flatMap(
      ([, values]) =>
        values?.flatMap((tab) =>
          tab.analysis && !tab.analysis.has_result ? [tab.analysis.id] : [],
        ) ?? [],
    ),
  );
  cache.removeQueries({
    predicate: (query) =>
      query.queryKey[0] === 'native' &&
      query.queryKey[1] === base &&
      query.queryKey[2] === 'analyses' &&
      (noOutput.has(String(query.queryKey[3])) ||
        (priorIds.has(String(query.queryKey[3])) && !currentIds.has(String(query.queryKey[3])))),
  });
  await cache.invalidateQueries({
    predicate: (query) => predicate(query) && query.queryKey[2] === 'schema',
  });
  // Clear can commit while schemas load. Let manifests reconcile no-output
  // responses before any dependent projection reads its now-deleted artifacts.
  const manifest = (query: Query) =>
    query.queryKey[2] === 'analyses' && query.queryKey.length === 4;
  await cache.invalidateQueries({ predicate: (query) => predicate(query) && manifest(query) });
  await cache.invalidateQueries({
    predicate: (query) =>
      predicate(query) &&
      !manifest(query) &&
      query.queryKey[2] !== 'schema' &&
      query.queryKey[2] !== 'tabs',
  });
}
