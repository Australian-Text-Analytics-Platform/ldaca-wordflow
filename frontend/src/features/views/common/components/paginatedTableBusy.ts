/**
 * Props for a paginated table body while its next page or sort is loading
 * (issue 209). The current rows stay in place, dimmed, instead of being
 * swapped for a single processing row: that swap shrank the table, and the
 * browser scrolled it back to the top. Show `PaginatedTableProcessingRow` only
 * while there are no rows yet.
 */
export const busyTableBodyProps = (busy: boolean) =>
  busy ? { 'aria-busy': true, className: 'pointer-events-none opacity-60 transition-opacity' } : {};
