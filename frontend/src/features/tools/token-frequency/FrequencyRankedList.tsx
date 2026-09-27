import { objectDependencies } from '@/features/project/projectChanges';
import { useRef, type UIEventHandler } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import * as api from '@/features/project/api';

export const FREQUENCY_LIST_CHUNK_SIZE = 200;
const ROW_HEIGHT = 40;
type FrequencyPage = Awaited<ReturnType<typeof api.queryFrequency>>;

/** Keep a continuous scroll range while querying and rendering only nearby rows. */
export function FrequencyRankedList({
  base,
  analysisId,
  query,
  firstPage,
  active,
  label,
  color,
  registerScrollElement,
  onScroll,
  onTokenContextMenu,
  onTokenClick,
}: {
  base: string;
  analysisId: string;
  query: api.FrequencyQuery;
  firstPage: FrequencyPage | undefined;
  active: boolean;
  label: string;
  color: string;
  registerScrollElement: (element: HTMLDivElement | null) => void;
  onScroll: UIEventHandler<HTMLDivElement>;
  onTokenContextMenu?: (token: string) => void;
  onTokenClick?: (token: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = Math.min(firstPage?.totalRows ?? 0, query.limit ?? Infinity);
  // TanStack Virtual's imperative methods must observe its current scroll state.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    initialRect: { width: 0, height: 384 },
    overscan: 8,
    useFlushSync: false,
  });
  const items = virtualizer.getVirtualItems();
  const pages = [
    ...new Set(items.map((item) => Math.floor(item.index / FREQUENCY_LIST_CHUNK_SIZE) + 1)),
  ].filter((page) => page !== 1);
  const chunks = useQueries({
    queries: pages.map((page) => {
      const chunkQuery = { ...query, page, page_size: FREQUENCY_LIST_CHUNK_SIZE };
      return {
        queryKey: ['native', base, 'analyses', analysisId, 'rows', chunkQuery],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          api.queryFrequency(base, analysisId, chunkQuery, signal),
        enabled: active,
        staleTime: Infinity,
        meta: {
          ...objectDependencies(...(query.stopword_source ? [query.stopword_source.source] : [])),
          reportError: false,
        },
      };
    }),
  });
  // The first row is the highest matching count, independent of the visible chunk.
  const maximum = Math.max(1, Number(firstPage?.table.getChild('frequency')?.get(0) ?? 0));
  const failure = chunks.find((chunk) => chunk.isError);
  return (
    <div className="min-w-0">
      <div
        ref={(element) => {
          scrollRef.current = element;
          registerScrollElement(element);
        }}
        role="list"
        aria-label={label}
        aria-busy={chunks.some((chunk) => chunk.isFetching)}
        tabIndex={0}
        className="max-h-96 overflow-y-auto outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        style={{ height: count * ROW_HEIGHT }}
        onScroll={onScroll}
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((item) => {
            const page = Math.floor(item.index / FREQUENCY_LIST_CHUNK_SIZE) + 1;
            const data = page === 1 ? firstPage : chunks[pages.indexOf(page)]?.data;
            const row = item.index % FREQUENCY_LIST_CHUNK_SIZE;
            const token = data?.table.getChild('token')?.get(row) as string | undefined;
            const frequency = data?.table.getChild('frequency')?.get(row) as bigint | undefined;
            const rank = data?.table.getChild('rank')?.get(row) as bigint | undefined;
            return (
              <div
                key={item.key}
                role="listitem"
                aria-posinset={item.index + 1}
                aria-setsize={count}
                className="absolute left-0 top-0 grid w-full grid-cols-[max-content_minmax(0,1fr)_max-content] items-center gap-2 pb-2 rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                style={{ height: ROW_HEIGHT, transform: `translateY(${String(item.start)}px)` }}
                tabIndex={token !== undefined && onTokenContextMenu ? 0 : undefined}
                title={
                  token !== undefined && onTokenContextMenu
                    ? `${token}: right-click or press Shift+F10 to add to stopwords`
                    : token
                }
                onClick={() => {
                  if (token !== undefined) onTokenClick?.(token);
                }}
                onContextMenu={(event) => {
                  if (token === undefined || !onTokenContextMenu) return;
                  event.preventDefault();
                  onTokenContextMenu(token);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && typeof token === 'string') {
                    event.preventDefault();
                    onTokenClick?.(token);
                  }
                  if (
                    token !== undefined &&
                    onTokenContextMenu &&
                    (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
                  ) {
                    event.preventDefault();
                    onTokenContextMenu(token);
                  }
                }}
              >
                <span className="text-label-secondary tabular-nums text-description">
                  {rank === undefined ? '…' : String(rank)}.
                </span>
                <span className="relative min-w-0 overflow-hidden rounded-sm px-2 py-1.5">
                  {frequency !== undefined && (
                    <span
                      data-testid="frequency-bar"
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 opacity-20"
                      style={{
                        width: `${String((Number(frequency) / maximum) * 100)}%`,
                        backgroundColor: color,
                      }}
                    />
                  )}
                  <span className="relative block truncate text-body">
                    {token ?? (failure ? 'Unavailable' : 'Loading…')}
                  </span>
                </span>
                <span className="text-label-secondary tabular-nums text-description">
                  {frequency === undefined ? '' : String(frequency)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {failure && (
        <p role="alert" className="text-label-secondary text-description">
          These rows could not be loaded.{' '}
          <Button
            variant="link"
            onClick={() => {
              void failure.refetch();
            }}
          >
            Retry
          </Button>
        </p>
      )}
    </div>
  );
}
