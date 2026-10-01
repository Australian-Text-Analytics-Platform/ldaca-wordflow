import { useState } from 'react';

/** Keep one successful page per current display slot, never another source's page. */
export function useRetainedPages<Page>(
  scopes: string[],
  queries: {
    data: Page | undefined;
    isPlaceholderData: boolean;
    isFetching: boolean;
    isError: boolean;
  }[],
) {
  const [retained, setRetained] = useState<{ scope: string; page?: Page }[]>([]);
  const next = scopes.map((scope, index) => ({
    scope,
    page:
      queries[index]?.data && !queries[index]?.isPlaceholderData
        ? queries[index]?.data
        : retained[index]?.scope === scope
          ? retained[index]?.page
          : undefined,
  }));
  if (
    next.length !== retained.length ||
    next.some(
      (item, index) => item.scope !== retained[index]?.scope || item.page !== retained[index]?.page,
    )
  )
    setRetained(next);
  return {
    pages: next.map((item) => item.page),
    stale: next.map((item, index) =>
      Boolean(
        item.page &&
        (queries[index]?.isFetching ||
          queries[index]?.isError ||
          queries[index]?.isPlaceholderData ||
          !queries[index]?.data),
      ),
    ),
  };
}
