import { useQuery } from '@tanstack/react-query';
import { listWorkbookSheets } from '@/api';
import { queryKeys } from '@/lib/queryKeys';

/** The query reading several workbooks' sheet names, keyed by path. */
export const workbookSheetsQuery = (paths: readonly string[]) => ({
  queryKey: queryKeys.workbookSheets(paths),
  queryFn: async ({ signal }: { signal?: AbortSignal }) => {
    const { data } = await listWorkbookSheets({
      body: { paths: [...paths] },
      signal,
      throwOnError: true,
    });
    return new Map(data.workbooks.map((workbook) => [workbook.path, workbook.sheets]));
  },
  staleTime: 60 * 1000,
});

/**
 * Sheet names of the workbooks an Add window lists (issue 323). Reading the
 * names loads no sheet. A workbook that can't be read gets no sheets, so it
 * loads its first sheet as before.
 */
export function useWorkbookSheets(paths: readonly string[]) {
  const query = useQuery({
    ...workbookSheetsQuery(paths),
    enabled: paths.length > 0,
  });
  return {
    sheetsOf: (path: string) => query.data?.get(path) ?? null,
    loading: paths.length > 0 && query.isLoading,
  };
}
