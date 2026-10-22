import { useEffect, useState } from 'react';

import type {
  ProgressDetail,
  TopicClustering,
  TopicEmbeddingModel,
  TopicModelingResponse,
  TopicSegmentLengthsResource,
} from '@/api';
import { useSettingsWalk } from '@/features/guidance/GuidanceContext';
import { NudgeCard } from '@/features/nudges/NudgeCard';
import {
  isLargeTopicInput,
  SLOW_START_MS,
  SLOW_START_STEPS,
  suggestedSegmentTokenCap,
  topicResultNudge,
} from '@/features/nudges/nudges';
import {
  ENGLISH_EMBEDDING_MODEL,
  embeddingModelTokenLimit,
  type CjkTokenizerSource,
} from '../topicEmbeddingModels';

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
    ungroupedShare: ungroupedDocumentShare(result.data),
  });
  if (!id) return null;
  const ungroupedShare = ungroupedDocumentShare(result.data);
  return (
    <NudgeCard
      id={id}
      occurrence={`${analysisId ?? ''}\0${id}`}
      // The share is the point of this one (Chao): "Many (37%) documents are Ungrouped".
      title={
        id === 'topic-many-ungrouped' && ungroupedShare !== null
          ? `Many (${String(Math.round(ungroupedShare * 100))}%) documents are Ungrouped`
          : undefined
      }
    />
  );
}

/** Share of the run's documents with no real Topic (issue 362), or null. */
function ungroupedDocumentShare(data: TopicModelingResponse['data']): number | null {
  const ungrouped = data.ungrouped_documents;
  if (!ungrouped) return null;
  const documents = data.corpus_sizes.reduce((sum, size) => sum + size, 0);
  return documents > 0 ? ungrouped.reduce((sum, size) => sum + size, 0) / documents : null;
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

/**
 * Suggestion after a slow run that read the text on this computer's processor:
 * a Topic Modelling server, if people have access to one. Show me walks to
 * Settings → Servers, where they add it themselves.
 */
export function TopicRemoteGpuNudge({
  show,
  analysisId,
}: {
  show: boolean;
  analysisId: string | null;
}) {
  const startSettingsWalk = useSettingsWalk();
  if (!show) return null;
  return (
    <NudgeCard
      id="topic-remote-gpu"
      occurrence={analysisId ?? ''}
      action={
        startSettingsWalk
          ? {
              label: 'Show me in Settings',
              onApply: () => {
                startSettingsWalk('remote-gpu');
              },
            }
          : undefined
      }
    />
  );
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

/** What the segment-length suggestion calls the units it measured. */
const SEGMENT_UNIT_NAMES: Record<TopicSegmentLengthsResource['unit'], string> = {
  document: 'texts',
  paragraph: 'paragraphs',
  // Line segmentation is called Paragraph in the panel.
  line: 'paragraphs',
  sentence: 'sentences',
};

/**
 * Suggestion before a run when the units the segmentation mode keeps whole are
 * short: a smaller Max tokens holds at least 9 in 10 of them whole (issue
 * 414). Only ever suggests a smaller cap; Apply sets it.
 */
export function TopicSegmentLengthNudge({
  lengths,
  maxSegmentTokens,
  onApply,
  className = 'mx-3 mt-2',
}: {
  lengths: TopicSegmentLengthsResource | null;
  maxSegmentTokens: number;
  onApply: (tokens: number) => void;
  className?: string;
}) {
  if (!lengths) return null;
  const tokens = suggestedSegmentTokenCap({
    p90: lengths.p90,
    current: maxSegmentTokens,
    limit: embeddingModelTokenLimit(lengths.embedding_model),
  });
  if (tokens === null) return null;
  const units = SEGMENT_UNIT_NAMES[lengths.unit];
  return (
    <NudgeCard
      id="topic-segment-length"
      occurrence={`${lengths.column}\0${lengths.segmentation_method}\0${lengths.embedding_model}\0${String(tokens)}`}
      title={`Your ${units} are short: ${String(tokens)} tokens per segment is plenty`}
      detail={`At least 9 in 10 ${units} in the first ${lengths.sampled_documents.toLocaleString()} documents fit in ${String(tokens)} tokens.`}
      action={{
        label: `Use ${String(tokens)} tokens`,
        onApply: () => {
          onApply(tokens);
        },
      }}
      className={className}
    />
  );
}

/**
 * Suggestion before a run when a selected Data Block has a Chinese, Japanese
 * or Korean tokeniser but the English model is chosen (issue 413). Use
 * Multilingual switches to it.
 */
export function TopicEmbeddingModelNudge({
  cjkTokenizer,
  embeddingModel,
  onUseMultilingual,
  className = 'mx-3 mt-2',
}: {
  className?: string;
  cjkTokenizer: CjkTokenizerSource | null;
  embeddingModel: TopicEmbeddingModel;
  onUseMultilingual: () => void;
}) {
  if (!cjkTokenizer || embeddingModel !== ENGLISH_EMBEDDING_MODEL) return null;
  return (
    <NudgeCard
      id="topic-embedding-model"
      occurrence={`${cjkTokenizer.name}\0${cjkTokenizer.tokenizer}`}
      detail={`${cjkTokenizer.name} uses the ${cjkTokenizer.tokenizer} tokeniser.`}
      action={{
        label: 'Use Multilingual',
        onApply: onUseMultilingual,
      }}
      className={className}
    />
  );
}
