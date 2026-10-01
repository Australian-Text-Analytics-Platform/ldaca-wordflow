import * as projectApi from '@/features/project/api';
import { QueryClient } from '@tanstack/react-query';
import { expect, it, vi } from 'vite-plus/test';

import { refreshProjectQueries } from './projectChanges';
import { schemaQuery } from './projectQueries';

it('shares one schema request for a Data Block and its qualified target, invalidated by object', async () => {
  const read = vi.spyOn(projectApi, 'nodeSchema').mockResolvedValue([]);
  const cache = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const object = { schema: 'data', name: 'Corpus' };
  const logical = schemaQuery('base', 'Corpus');
  const qualified = schemaQuery('base', object);
  await Promise.all([cache.fetchQuery(logical), cache.fetchQuery(qualified)]);
  expect(read).toHaveBeenCalledOnce();
  expect(cache.getQueryCache().getAll()).toHaveLength(1);
  await refreshProjectQueries(cache, 'base', { objects: [{ schema: 'other', name: 'Corpus' }] });
  expect(cache.getQueryState(logical.queryKey)?.isInvalidated).toBe(false);
  await refreshProjectQueries(cache, 'base', { objects: [object] });
  expect(cache.getQueryState(logical.queryKey)?.isInvalidated).toBe(true);
  read.mockRestore();
});
