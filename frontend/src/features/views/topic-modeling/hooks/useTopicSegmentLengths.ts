import { useQuery } from '@tanstack/react-query';

import {
  getTopicSegmentLengths,
  type TopicEmbeddingModel,
  type TopicSegmentationMethod,
  type TopicSegmentLengthsResource,
} from '@/api';
import { useNudgeStore } from '@/features/nudges/nudgeStore';

/**
 * Token counts of the units the segmentation mode keeps whole, from the first
 * documents of a Data Block's text column (issue 414). Read only while
 * Suggestions are on; `null` until known or when unavailable.
 * Used by: TopicModelingFeature, for TopicSegmentLengthNudge in the panel.
 */
export function useTopicSegmentLengths({
  workspaceId,
  nodeId,
  column,
  segmentationMethod,
  embeddingModel,
}: {
  workspaceId: string | null;
  nodeId: string | null;
  column: string;
  segmentationMethod: TopicSegmentationMethod;
  embeddingModel: TopicEmbeddingModel;
}): TopicSegmentLengthsResource | null {
  const enabled = useNudgeStore((state) => state.enabled);
  const query = useQuery({
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
    queryFn: async ({ signal }) => {
      const { data } = await getTopicSegmentLengths({
        path: { workspace_id: workspaceId ?? '', node_id: nodeId ?? '' },
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
  });
  return query.data ?? null;
}
