import { Label } from '@/components/ui/label';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationJump,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/Pagination';
import { buildPaginationRange } from '@/components/ui/paginationRange';
import { cn } from '@/lib/utils';

/** Default page-size options shared by every server-backed paginated table. */
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export interface TablePaginationFooterProps {
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** Zero-based current page index (real changing value from the consumer). */
  pageIndex: number;
  /** Current page size (real changing value from the consumer). */
  pageSize: number;
  /** Trustworthy total row count used to derive exact page bounds. */
  rowCount?: number;
  /** Cheap page lookahead used only when an exact total is unavailable. */
  hasNext?: boolean;
  /** Options shown in the page-size dropdown. */
  pageSizeOptions?: number[];
  /**
   * Whether to render the page-size selector. Hidden when the consumer is
   * read-only (page navigation stays available, page-size change does not).
   */
  showPageSize?: boolean;
  /** Context-specific label for the page-size selector. */
  pageSizeLabel?: React.ReactNode;
  /** Optional summary rendered after the page-size selector. */
  pageSizeSummary?: React.ReactNode;
  /** Show an inline loading indicator next to the page controls. */
  loading?: boolean;
  /** Trailing actions such as Add to Project buttons. */
  children?: React.ReactNode;
  /** Tight project styling (native select, smaller paddings). */
  compact?: boolean;
  /** Additional CSS class for the outer wrapper. */
  className?: string;
}

/** Controlled paging for exact totals and lookahead-only transports. */
export function TablePaginationFooter({
  onPageChange,
  onPageSizeChange,
  pageIndex,
  pageSize,
  rowCount,
  hasNext,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  showPageSize = true,
  pageSizeLabel = 'Rows per page',
  pageSizeSummary,
  loading = false,
  children,
  compact = false,
  className,
}: TablePaginationFooterProps) {
  const totalPages =
    rowCount === undefined ? undefined : pageSize > 0 ? Math.ceil(rowCount / pageSize) : 0;
  const pageCount = totalPages ?? pageIndex + 1 + (hasNext ? 1 : 0);

  if (compact && totalPages === 0) return null;

  const currentPage = pageIndex + 1; // 0-indexed → 1-indexed for display
  const safeTotalPages = Math.max(pageCount, 1);
  const normalizedOptions = Array.from(new Set([...pageSizeOptions, pageSize])).sort(
    (a, b) => a - b,
  );
  const paginationRange = buildPaginationRange(
    currentPage,
    totalPages === undefined ? undefined : safeTotalPages,
    hasNext,
  );

  const canPrev = pageIndex > 0;
  const canNext = totalPages === undefined ? Boolean(hasNext) : pageIndex < pageCount - 1;

  /** Converts a display page number back into TanStack's zero-based page index. */
  const goToPage = (page: number) => {
    onPageChange(page - 1);
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-t border-surface-border bg-panel/40',
        compact ? 'px-3 py-1.5' : 'px-4 py-3',
        className,
      )}
    >
      {/* Left: Page size selector */}
      <div className="flex flex-wrap items-center gap-2">
        {showPageSize && (
          <>
            <Label className="whitespace-nowrap text-body text-description">{pageSizeLabel}</Label>
            <select
              aria-label={typeof pageSizeLabel === 'string' ? pageSizeLabel : 'Rows per page'}
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-8 rounded-md border border-input-border bg-editor px-2 text-foreground"
            >
              {normalizedOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </>
        )}
        {pageSizeSummary ? (
          <span className="text-body text-description">{pageSizeSummary}</span>
        ) : null}
      </div>

      {/* Center: Pagination buttons */}
      <Pagination className="w-auto min-w-0 flex-1 basis-40">
        <PaginationContent className="flex-wrap">
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(event) => {
                event.preventDefault();
                if (canPrev) onPageChange(pageIndex - 1);
              }}
              className={cn(!canPrev && 'pointer-events-none opacity-50')}
              aria-disabled={!canPrev}
              tabIndex={!canPrev ? -1 : undefined}
            />
          </PaginationItem>

          {paginationRange.map((item, index) => (
            <PaginationItem key={`${String(item)}-${String(index)}`}>
              {item === 'dots' && totalPages !== undefined ? (
                <PaginationJump totalPages={safeTotalPages} onPageChange={goToPage} />
              ) : item === 'dots' ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    if (item !== currentPage) goToPage(item);
                  }}
                  isActive={item === currentPage}
                  size="default"
                >
                  {item}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}

          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(event) => {
                event.preventDefault();
                if (canNext) onPageChange(pageIndex + 1);
              }}
              className={cn(!canNext && 'pointer-events-none opacity-50')}
              aria-disabled={!canNext}
              tabIndex={!canNext ? -1 : undefined}
            />
          </PaginationItem>

          {loading && (
            <PaginationItem>
              <div className="ml-1 h-4 w-4 animate-spin rounded-full border-2 border-surface-border-foreground border-t-transparent" />
            </PaginationItem>
          )}
        </PaginationContent>
      </Pagination>

      {/* Right: Extra controls (e.g. Add to Project) */}
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
