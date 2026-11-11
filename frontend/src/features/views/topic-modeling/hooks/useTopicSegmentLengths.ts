import { useQueries } from '@tanstack/react-query';

import {
  getTopicSegmentLengths,
  type TopicEmbeddingModel,
  type TopicSegmentationMethod,
  type TopicSegmentLengthsResource,
} from '@/api';
import { useNudgeStore } from '@/features/nudges/nudgeStore';

/**
 * Token counts of the units the segmentation mode keeps whole, from the first
 * documents of each selected Data Block's text column (issue 414). Read only
 * while Suggestions are on; `null` until every one is known or when none is
 * available. Of two Data Blocks it returns the one with the longer units,
 * whose size holds both (Chao, 2026-11-11).
 * Used by: TopicModelingFeature, for TopicSegmentLengthNudge and the estimate
 * Max tokens Auto shows before a run. The run itself measures every text.
 */
export function useTopicSegmentLengths({
  workspaceId,
  sources,
  segmentationMethod,
  embeddingModel,
}: {
  workspaceId: string | null;
  sources: readonly { nodeId: string; column: string }[];
  segmentationMethod: TopicSegmentationMethod;
  embeddingModel: TopicEmbeddingModel;
}): TopicSegmentLengthsResource | null {
  const enabled = useNudgeStore((state) => state.enabled);
  const queries = useQueries({
    queries: sources.map(({ nodeId, column }) => ({
      queryKey: [
        'workspaces',
        workspaceId,
        'nodes',
        nodeId,
        'topic-segment-lengths',
        column,
        segmentationMethod,
        embeddingModel,
      ],
      enabled: enabled && Boolean(workspaceId && nodeId && column),
      staleTime: 60_000,
      retry: false,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const { data } = await getTopicSegmentLengths({
          path: { workspace_id: workspaceId ?? '', node_id: nodeId },
          query: {
            column,
            segmentation_method: segmentationMethod,
            embedding_model: embeddingModel,
          },
          signal,
          throwOnError: true,
        });
        return data;
      },
    })),
  });
  const measured = queries.map((query) => query.data);
  if (measured.length === 0 || measured.some((lengths) => lengths === undefined)) return null;
  return measured.reduce<TopicSegmentLengthsResource | null>((longest, lengths) => {
    if (!lengths) return longest;
    if (!longest) return lengths;
    return (lengths.p90 ?? 0) > (longest.p90 ?? 0) ? lengths : longest;
  }, null);
}
