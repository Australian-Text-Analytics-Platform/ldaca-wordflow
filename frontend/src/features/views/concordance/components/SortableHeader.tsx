import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import { DraggableTableHead } from '@/features/views/common/components/ColumnDragHandle';
import type { PaginationState } from '../hooks/useConcordanceTaskFlow';
import { GeneratedColumnLabel } from '@/features/views/common/components/GeneratedColumnLabel';
import { alignmentClassForColumn } from './concordanceTableModel';

interface Props {
  columnKey: string;
  label: string;
  paginationKey: string;
  requestNodeId: string;
  nodePagination: PaginationState;
  onSort: (columnKey: string, paginationKey: string, requestNodeId: string) => void;
  /** The column the click sorts by, when not the header's own (issue 241). */
  sortKey?: string;
  /** Tooltip saying what the header sorts by. */
  hint?: string;
}

/**
 * Rendered by: ConcordanceTableNodeBlock as the concordance table's reusable sortable header affordance.
 */
export function SortableHeader({
  columnKey,
  label,
  paginationKey,
  requestNodeId,
  nodePagination,
  onSort,
  sortKey = columnKey,
  hint,
}: Props) {
  const nodeState = nodePagination[paginationKey] ?? { sortBy: '', descending: false };
  // A context header also shows as sorted while its own text is the sort key
  // (sorted with Highlight L1/R1 for sorting off, then switched on).
  const isSorted = nodeState.sortBy === sortKey || nodeState.sortBy === columnKey;
  const sortIcon = isSorted ? (nodeState.descending ? '▼' : '▲') : '▲▼';
  // The grip moves the column; the rest of the header sorts (issue 373).
  return (
    <DraggableTableHead
      id={columnKey}
      label={label}
      className={`px-3 py-2 ${alignmentClassForColumn(columnKey) || 'text-left'} text-label-secondary font-medium uppercase tracking-wider cursor-pointer hover:bg-panel ${isSorted ? 'text-link' : 'text-description'}`}
      onClick={() => {
        onSort(sortKey, paginationKey, requestNodeId);
      }}
    >
      <DisabledReasonTooltip reason={hint} side="bottom">
        <div className="inline-flex items-center space-x-1">
          <GeneratedColumnLabel name={label} />
          <span className={`text-label-secondary ${isSorted ? 'text-link' : 'text-description'}`}>
            {sortIcon}
          </span>
        </div>
      </DisabledReasonTooltip>
    </DraggableTableHead>
  );
}
