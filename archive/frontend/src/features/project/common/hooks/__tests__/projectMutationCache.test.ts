import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';
import {
  invalidateNodeProjectQueries,
  invalidateProjectSummaries,
} from '../projectMutationCache';

const createClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });

describe('projectMutationCache', () => {
  it('refreshes the Project list without invalidating Project detail resources', () => {
    const queryClient = createClient();
    const graphKey = queryKeys.projectGraph('project-1');
    queryClient.setQueryData(queryKeys.projectList, [{ id: 'project-1' }]);
    queryClient.setQueryData(graphKey, { nodes: [], edges: [] });

    invalidateProjectSummaries(queryClient);

    expect(queryClient.getQueryState(queryKeys.projectList)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(graphKey)?.isInvalidated).toBe(false);
  });

  it('invalidates every node-dependent data projection and leaves unrelated nodes fresh', () => {
    const queryClient = createClient();
    const graphKey = queryKeys.projectGraph('project-1');
    const nodeOneSql = queryKeys.projectSql(
      'project-1',
      ['node-1'],
      'SELECT * FROM "node-1"',
      1,
      20,
    );
    const nodeTwoSql = queryKeys.projectSql(
      'project-1',
      ['node-2'],
      'SELECT * FROM "node-2"',
      1,
      20,
    );
    const nodeOneUnique = queryKeys.columnUniqueValues('project-1', 'node-1', 'kind');
    const nodeTwoUnique = queryKeys.columnUniqueValues('project-1', 'node-2', 'kind');
    const nodeOnePreview = queryKeys.preprocessingPreview(
      'project-1',
      'filter',
      ['node-1'],
      { conditions: [] },
      1,
      10,
    );
    const nodeTwoPreview = queryKeys.preprocessingPreview(
      'project-1',
      'filter',
      ['node-2'],
      { conditions: [] },
      1,
      10,
    );

    for (const key of [
      graphKey,
      nodeOneSql,
      nodeTwoSql,
      nodeOneUnique,
      nodeTwoUnique,
      nodeOnePreview,
      nodeTwoPreview,
    ]) {
      queryClient.setQueryData(key, {});
    }

    invalidateNodeProjectQueries(queryClient, 'project-1', 'node-1', {
      includeData: true,
    });

    expect(queryClient.getQueryState(graphKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(nodeOneSql)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(nodeOneUnique)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(nodeOnePreview)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(nodeTwoSql)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(nodeTwoUnique)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(nodeTwoPreview)?.isInvalidated).toBe(false);
  });
});
