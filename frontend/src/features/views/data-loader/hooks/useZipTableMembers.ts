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
      return data;
    },
    enabled: Boolean(zipPath),
  });
  return {
    members: query.data?.members ?? [],
    // ZIPs inside, which are not opened (issue 323).
    nestedArchives: query.data?.nested_archives ?? [],
    // Text documents inside, which Texts mode makes rows of; null until listed.
    textDocuments: query.data ? (query.data.text_documents ?? 0) : null,
    loading: query.isLoading,
  };
}
