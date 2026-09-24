import { useQuery } from '@tanstack/react-query';
import { listZipTableMembers } from '@/api';
import { queryKeys } from '@/lib/queryKeys';

/** Lists the table files inside one ZIP archive while its Add dialog is open. */
export function useZipTableMembers(zipPath: string | null) {
  const query = useQuery({
    queryKey: queryKeys.zipTableMembers(zipPath ?? ''),
    queryFn: async () => {
      const { data } = await listZipTableMembers({
        query: { path: zipPath ?? '' },
        throwOnError: true,
      });
      return data.members;
    },
    enabled: Boolean(zipPath),
  });
  return { members: query.data ?? [], loading: query.isLoading };
}
