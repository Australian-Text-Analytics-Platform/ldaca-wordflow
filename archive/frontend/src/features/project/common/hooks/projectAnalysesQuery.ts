import { infiniteQueryOptions } from '@tanstack/react-query';
import { listAnalyses, type AnalysisPage } from '@/api';
import { queryKeys } from '@/lib/queryKeys';

const PROJECT_ANALYSES_PAGE_SIZE = 500;

/**
 * Defines the sole cache shape for a Project's paginated Analysis collection.
 * Every observer sharing projectAnalyses must consume InfiniteData<AnalysisPage>.
 */
export const projectAnalysesQueryOptions = (projectId: string | null) =>
  infiniteQueryOptions({
    queryKey: projectId
      ? queryKeys.projectAnalyses(projectId)
      : queryKeys.inactiveProjectAnalyses,
    queryFn: async ({ pageParam }): Promise<AnalysisPage> => {
      if (!projectId) throw new Error('Missing project ID');
      const { data } = await listAnalyses({
        path: { workspace_id: projectId },
        query: { page: pageParam, page_size: PROJECT_ANALYSES_PAGE_SIZE },
        throwOnError: true,
      });
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (page) => (page.page < page.total_pages ? page.page + 1 : undefined),
    enabled: Boolean(projectId),
  });
