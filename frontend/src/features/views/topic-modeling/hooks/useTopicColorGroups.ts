import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryTopicColorGroups } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import {
  buildTopicColorScheme,
  type TopicColorScheme,
} from '../components/results/topicModelingGraph';

interface UseTopicColorGroupsOptions {
  workspaceId: string | null;
  analysisId: string | null;
  /** Metadata colours are offered for single-corpus results only. */
  singleCorpus: boolean;
  clusterCount: number | null;
  topNTopics: number | null;
  column: string | null;
}

/**
 * Loads the eligible "Colour by" columns and, once one is chosen, per-Topic
 * counts split by that column's values for the applied projection.
 */
export function useTopicColorGroups({
  workspaceId,
  analysisId,
  singleCorpus,
  clusterCount,
  topNTopics,
  column,
}: UseTopicColorGroupsOptions) {
  const ready =
    Boolean(workspaceId && analysisId) &&
    singleCorpus &&
    clusterCount !== null &&
    clusterCount > 0 &&
    topNTopics !== null;
  const fetchGroups = async (requestColumn: string | null) => {
    const { data } = await queryTopicColorGroups({
      path: { workspace_id: workspaceId ?? '', analysis_id: analysisId ?? '' },
      body: {
        cluster_count: clusterCount ?? 0,
        top_n_topics: topNTopics ?? 0,
        column: requestColumn,
      },
      throwOnError: true,
    });
    return data;
  };
  const listingQuery = {
    cluster_count: clusterCount ?? 0,
    top_n_topics: topNTopics ?? 0,
    column: null,
  };
  const columnsQuery = useQuery({
    queryKey: queryKeys.topicColorGroups(workspaceId ?? '', analysisId ?? '', listingQuery),
    queryFn: () => fetchGroups(null),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
  const columns = ready ? (columnsQuery.data?.columns ?? []) : [];
  const counts = columnsQuery.data?.column_value_counts ?? [];
  // Shown after each name in the Colour by list (issue 153).
  const columnValueCounts = Object.fromEntries(
    columns.flatMap((name, index) => {
      const count = counts[index];
      return count === undefined ? [] : [[name, count] as const];
    }),
  );
  const activeColumn = column !== null && columns.includes(column) ? column : null;
  const groupsQuery = useQuery({
    queryKey: queryKeys.topicColorGroups(workspaceId ?? '', analysisId ?? '', {
      ...listingQuery,
      column: activeColumn,
    }),
    queryFn: () => fetchGroups(activeColumn),
    enabled: ready && activeColumn !== null,
    placeholderData: keepPreviousData,
  });
  let scheme: TopicColorScheme | null = null;
  const groups = groupsQuery.data;
  if (activeColumn !== null && groups?.column === activeColumn) {
    // Placeholder data from another cluster count has the wrong Topic ids.
    if (groups.topic_counts.length === clusterCount) scheme = buildTopicColorScheme(groups);
  }
  return {
    columns,
    columnValueCounts,
    activeColumn,
    scheme,
    pending: groupsQuery.isFetching,
    error:
      groupsQuery.error instanceof Error
        ? groupsQuery.error.message
        : columnsQuery.error instanceof Error
          ? columnsQuery.error.message
          : null,
  };
}
