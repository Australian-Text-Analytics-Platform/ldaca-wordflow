import { useQuery } from '@tanstack/react-query';
import { MAX_TRENDS_GROUPS, uniqueValueCountQuery } from '../trendsGroups';

interface UniqueValueCountProps {
  workspaceId: string;
  nodeId: string;
  columnName: string;
}

/**
 * Rendered by: SequentialAnalysisParameterPanel to show cardinality hints for candidate group-by columns.
 * Flow: query distinct values for the selected column, then render loading,
 * error, or the returned count.
 */
export function UniqueValueCount({ workspaceId, nodeId, columnName }: UniqueValueCountProps) {
  const { data, isLoading, error } = useQuery(
    uniqueValueCountQuery(workspaceId, nodeId, columnName),
  );

  if (isLoading) {
    return <span className="text-label-secondary text-description px-2">Loading…</span>;
  }

  // Pill is a nice-to-have hint, not load-bearing. Render nothing on
  // error so we don't flag the user with a red "Error" badge — most
  // failure modes such as transient backend hiccups are recoverable on their own
  // and don't warrant a prominent error UI on a parameter dropdown.
  if (error || !data) {
    return null;
  }

  // Too many groups to draw (issue 326): Run is blocked and this says why.
  if (data.unique_count > MAX_TRENDS_GROUPS) {
    return (
      <span className="rounded-sm bg-panel px-2 py-1 text-label-secondary text-error">
        {data.unique_count.toLocaleString()} unique: too many groups (at most{' '}
        {MAX_TRENDS_GROUPS.toLocaleString()})
      </span>
    );
  }
  return (
    <span className="text-label-secondary text-description bg-panel px-2 py-1 rounded-sm">
      {data.unique_count} unique{data.has_null ? ' + null' : ''}
    </span>
  );
}
