import { queryOptions, useQuery } from '@tanstack/react-query';
import { listTabs } from '@/api';
import { queryKeys } from '@/lib/queryKeys';

/** One authoritative Tab collection shared by every analysis view and desktop quick access. */
const projectTabsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: queryKeys.projectTabs(projectId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data } = await listTabs({
        path: { workspace_id: projectId },
        throwOnError: true,
      });
      return data;
    },
  });

export function useProjectTabResources(projectId: string | null | undefined) {
  return useQuery({
    ...projectTabsQueryOptions(projectId ?? '__none__'),
    enabled: Boolean(projectId),
  });
}
