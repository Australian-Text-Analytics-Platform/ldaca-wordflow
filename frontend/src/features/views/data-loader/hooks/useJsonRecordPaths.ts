import { useQuery } from '@tanstack/react-query';
import { listJsonRecordPaths } from '@/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Where a JSON or JSON Lines file's rows could come from, the default (the
 * place holding most text) first. `member` is a JSON file inside the ZIP at
 * `path`. Used by `useFilePreview` and the batch Add window, which reads a
 * whole batch at one place.
 */
export function useJsonRecordPaths(path: string | null, member: string | null, enabled: boolean) {
  const query = useQuery({
    queryKey: queryKeys.jsonRecordPaths(path ?? '', member),
    queryFn: async () => {
      const { data } = await listJsonRecordPaths({
        query: { path: path ?? '', member },
        throwOnError: true,
      });
      return data.paths;
    },
    enabled: Boolean(path) && enabled,
    staleTime: 5 * 60 * 1000,
  });
  return { paths: query.data ?? null, loading: query.isLoading };
}
