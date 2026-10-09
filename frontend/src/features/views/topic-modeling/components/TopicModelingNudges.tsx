import { useEffect, useState } from 'react';

import type { ProgressDetail, TopicClustering, TopicModelingResponse } from '@/api';
import { NudgeCard } from '@/features/nudges/NudgeCard';
import {
  isLargeTopicInput,
  SLOW_START_MS,
  SLOW_START_STEPS,
  topicResultNudge,
} from '@/features/nudges/nudges';

/**
 * Suggestion on a result with one giant topic or only a few topics (issue
 * 360). Only for the topics the run found: after people merge topics with the
 * Topics slider, a few large topics are what they asked for.
 */
export function TopicResultNudge({
  result,
  clustering,
  analysisId,
}: {
  result: TopicModelingResponse | null;
  clustering: TopicClustering | null;
  analysisId: string | null;
}) {
  if (!result || !clustering) return null;
  if (clustering.cluster_count !== clustering.default_cluster_count) return null;
  // Segments with segments: a topic's total_size counts documents, while
  // largest_topic_size counts the segments of the largest topic the
  // clustering made (of the sample, with Topic sampling).
  const id = topicResultNudge({
    clusterCount: clustering.default_cluster_count,
    largestTopicSize: clustering.largest_topic_size ?? 0,
    clusteredSegments: clustering.clustered_segments ?? result.data.segment_count,
  });
  if (!id) return null;
  return <NudgeCard id={id} occurrence={`${analysisId ?? ''}\0${id}`} />;
}

const toMs = (value: string | number) =>
  typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);

/** Suggestion when a run is still segmenting or reading the text after five minutes. */
export function TopicSlowStartNudge({
  taskId,
  startedAt,
  detail,
}: {
  taskId: string | null | undefined;
  startedAt: string | number | null | undefined;
  detail: ProgressDetail | null | undefined;
}) {
  const start = startedAt == null ? Number.NaN : toMs(startedAt);
  const [now, setNow] = useState(() => Date.now());
  const waiting = !Number.isNaN(start) && now - start < SLOW_START_MS;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 10_000);
    return () => {
      clearInterval(timer);
    };
  }, [waiting]);
  if (Number.isNaN(start) || waiting || !detail || detail.step > SLOW_START_STEPS) return null;
  return <NudgeCard id="topic-slow-start" occurrence={taskId ?? ''} className="mt-3" />;
}

/** Suggestion before a run on many documents or segments: use a sample first. */
export function TopicLargeInputNudge({
  documents,
  segments,
  topicSampling,
  occurrence,
}: {
  documents: number;
  segments: number | null;
  topicSampling: boolean;
  occurrence: string;
}) {
  if (!isLargeTopicInput({ documents, segments, topicSampling })) return null;
  // The notes below give the numbers; the card keeps to its advice.
  return <NudgeCard id="topic-large-input" occurrence={occurrence} className="mx-3 mt-2" />;
}
