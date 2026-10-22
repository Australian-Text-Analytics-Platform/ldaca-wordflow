/**
 * Suggestions (issue 360): short reminders that appear when a result or run
 * looks off, and outline the settings that may help. They never stop people,
 * need no closing, and come back when the situation happens again. Internally
 * they are "nudges"; the interface calls them Suggestions. Every message,
 * outline target and threshold lives here, so they are easy to tune.
 */
import type { DocumentKey } from '@/tutorials/documentationRegistry';

/** Names elements carry in `data-nudge-target`, so a suggestion can outline them. */
export const NUDGE_TARGETS = {
  concordancePageSize: 'concordance-page-size',
  concordanceRun: 'concordance-run',
  topicMinClusterSize: 'topic-min-cluster-size',
  topicMaxClusterSize: 'topic-max-cluster-size',
  topicDocumentSampling: 'topic-document-sampling',
  topicClusterSample: 'topic-cluster-sample',
  topicEmbeddingModel: 'topic-embedding-model',
  topicMaxSegmentTokens: 'topic-max-segment-tokens',
  topicRemoteGpu: 'topic-remote-gpu',
  tokenizer: 'tokenizer-model',
  exportFormat: 'export-format',
} as const;

/**
 * First thresholds (Chao, issue 360): 60% of the Obesity sample corpus, which
 * has 26,163 documents and about 109,800 segments at Automatic, 256 tokens.
 */
export const LARGE_INPUT_DOCUMENTS = 15_700;
export const LARGE_INPUT_SEGMENTS = 66_000;
/** A topic holding more than this share of the clustered segments. */
const GIANT_TOPIC_SHARE = 0.5;
/** Fewer topics than this. */
const FEW_TOPICS = 5;
/**
 * This share of documents with no real Topic (Ungrouped, issue 362). On the
 * Obesity corpus, 37% at Min topic size 10 fell to 30% at 5, with 2,848
 * Topics instead of 782; at 20 everything joined one Topic.
 */
const MANY_UNGROUPED_SHARE = 0.3;
/**
 * Max tokens values the segment-length suggestion offers (issue 414): the
 * lengths Topic Modelling runs on the Mac's GPU, so a smaller cap is one of them.
 */
const SEGMENT_TOKEN_BUCKETS = [32, 64, 128, 256] as const;
/** A run still in its first steps (segments and embeddings) after this long. */
export const SLOW_START_MS = 5 * 60_000;
/** Steps that count as the first steps of a Topic Modelling run. */
export const SLOW_START_STEPS = 2;

export interface NudgeDefinition {
  title: string;
  message: string;
  /** The help section a Learn more link opens, for the harder suggestions (Chao, issue 361). */
  help?: DocumentKey<'tutorial'>;
  /**
   * Outlined while the suggestion shows. Never a destructive control such as
   * Clear or Stop: a pulse must not invite a click that loses work, so those
   * are only named in the message (Chao, issue 360).
   */
  targets: readonly string[];
}

export const NUDGES = {
  'concordance-preview-empty': {
    title: 'No matches yet',
    message:
      'Preview searched only the documents on this page. Show more documents per page, or Run to search them all.',
    targets: [NUDGE_TARGETS.concordancePageSize, NUDGE_TARGETS.concordanceRun],
  },
  'topic-giant-topic': {
    title: 'One topic holds most segments',
    // Both directions and their cost (Chao, issue 361): a fixed Max is used as
    // set; Auto never lowers it.
    message:
      'Max topic size caps how large a topic can be. Set a lower Max and Run again to split it into more, smaller topics, though more text may become Ungrouped; a higher Max keeps topics broad.',
    help: 'analysis.topic-modeling.max-topic-size',
    targets: [NUDGE_TARGETS.topicMaxClusterSize],
  },
  'topic-few-topics': {
    title: 'Only a few topics',
    message: 'A slightly lower Min topic size finds more topics. Change it and Run again.',
    help: 'analysis.topic-modeling.topic-size',
    targets: [NUDGE_TARGETS.topicMinClusterSize],
  },
  'topic-many-ungrouped': {
    title: 'Many documents are Ungrouped',
    // What to do, plainly; why it helps only a little is in Learn more (Chao, 2026-10-10).
    message:
      'To place more documents in topics, lower Min topic size or raise Max topic size, then Run again. The change is usually small.',
    help: 'analysis.topic-modeling.ungrouped',
    targets: [NUDGE_TARGETS.topicMinClusterSize, NUDGE_TARGETS.topicMaxClusterSize],
  },
  'topic-slow-start': {
    title: 'This run is taking a while',
    // Reading the text takes about as long at 128 as at 256 Max tokens on the
    // Obesity corpus (13 and 14 minutes), and Topic sampling only shortens the
    // later grouping step, so fewer documents is the advice that helps here.
    message:
      'Reading the text takes most of a first run. For a faster run, Stop, then lower Sampling to read fewer documents.',
    targets: [NUDGE_TARGETS.topicDocumentSampling],
  },
  'topic-remote-gpu': {
    title: 'Reading the text took a while',
    // Most people have no such server (Chao): say so, and never make it sound needed.
    message:
      'This computer read the text on its processor. If you have access to a GPU server for Topic Modelling, for example through your university, adding it in Settings → Servers makes first runs much faster. Most people don’t have one; Topic Modelling works without it.',
    help: 'analysis.topic-modeling.remote-gpu',
    targets: [],
  },
  'topic-large-input': {
    title: 'A large input',
    message:
      'For a faster first run, use a sample: fewer documents with Sampling, or fewer segments with Topic sampling.',
    help: 'analysis.topic-modeling.topic-sampling',
    targets: [NUDGE_TARGETS.topicDocumentSampling, NUDGE_TARGETS.topicClusterSample],
  },
  'topic-segment-length': {
    // The card's title gives the numbers ("Your sentences are short: 64
    // tokens per segment is plenty"); Apply sets Max tokens (issue 414).
    title: 'Shorter segments are enough',
    message:
      'Apply lowers Max tokens: most stay whole, and the few longer ones are split into pieces of about that size.',
    help: 'analysis.topic-modeling.max-segment-tokens',
    targets: [NUDGE_TARGETS.topicMaxSegmentTokens],
  },
  'topic-embedding-language': {
    title: 'Text in another language',
    message:
      'The English model is trained on English text. The Multilingual model understands about 50 languages, reading up to 128 tokens per segment.',
    help: 'analysis.topic-modeling.embedding-model',
    targets: [NUDGE_TARGETS.topicEmbeddingModel],
  },
  'topic-embedding-model': {
    title: 'Chinese, Japanese or Korean text',
    // English MiniLM scored two unrelated Chinese sentences 0.51 alike and a
    // Chinese sentence and its English translation 0.21; the multilingual
    // model -0.07 and 0.90 (issue 413).
    message:
      'The English model mostly matches shared characters in these languages. The Multilingual model understands them, reading up to 128 tokens per segment.',
    help: 'analysis.topic-modeling.embedding-model',
    targets: [NUDGE_TARGETS.topicEmbeddingModel],
  },
  'excel-cell-limit': {
    title: 'Too long for Excel',
    // Shown after an Excel download or export is refused (issue 397); the
    // detail names the columns. Excel breaks a CSV with such text too.
    message:
      'Excel cells hold at most 32,767 characters. Choose CSV to keep the full text, and open it in LibreOffice Calc or Numbers: Excel splits such text into extra rows.',
    help: 'analysis.export.excel-limit',
    targets: [NUDGE_TARGETS.exportFormat],
  },
} as const satisfies Record<string, NudgeDefinition>;

export type NudgeId = keyof typeof NUDGES;

interface TopicResultShape {
  clusterCount: number;
  largestTopicSize: number;
  clusteredSegments: number;
  /** Share of documents with no real Topic; null for runs before 0.7.12. */
  ungroupedShare?: number | null;
}

/** Which Topic Modelling result suggestion applies, if any: a giant topic, then too few, then many Ungrouped. */
export function topicResultNudge({
  clusterCount,
  largestTopicSize,
  clusteredSegments,
  ungroupedShare = null,
}: TopicResultShape): NudgeId | null {
  if (clusteredSegments > 0 && largestTopicSize / clusteredSegments > GIANT_TOPIC_SHARE) {
    return 'topic-giant-topic';
  }
  if (clusterCount > 0 && clusterCount < FEW_TOPICS) return 'topic-few-topics';
  if (ungroupedShare !== null && ungroupedShare >= MANY_UNGROUPED_SHARE) {
    return 'topic-many-ungrouped';
  }
  return null;
}

/** Whether the documents or segments to model call for a sample first. */
export function isLargeTopicInput({
  documents,
  segments,
  topicSampling,
}: {
  documents: number;
  segments: number | null;
  topicSampling: boolean;
}): boolean {
  if (documents >= LARGE_INPUT_DOCUMENTS) return true;
  return !topicSampling && segments !== null && segments >= LARGE_INPUT_SEGMENTS;
}

/**
 * The Max tokens the segment-length suggestion offers, if any (issue 414):
 * the smallest of the GPU lengths that holds the sampled units' 90th
 * percentile, so at least 9 in 10 units stay whole and at most 1 in 10 is
 * split (Chao: 85 to 90%), within the model's limit, and only when it is
 * below the current setting. It never suggests a larger cap.
 */
export function suggestedSegmentTokenCap({
  p90,
  current,
  limit,
}: {
  /** Tokens that at least 90% of the sampled units fit in; null with no units. */
  p90: number | null;
  current: number;
  limit: number;
}): number | null {
  if (p90 === null) return null;
  const fit = SEGMENT_TOKEN_BUCKETS.find((tokens) => tokens <= limit && tokens >= p90);
  return fit !== undefined && fit < current ? fit : null;
}

/**
 * Suggest a Topic Modelling server after a finished run that read its text on
 * this computer's processor and took at least as long as a slow start, only
 * where people can add one (a desktop) and none is set up.
 */
export function shouldSuggestRemoteGpu({
  state,
  startedAt,
  finishedAt,
  usedEndpoint,
  canAdd,
  anyEndpoints,
  localEmbedding,
}: {
  state: string | null | undefined;
  startedAt: string | null | undefined;
  finishedAt: string | null | undefined;
  usedEndpoint: boolean;
  canAdd: boolean;
  anyEndpoints: boolean;
  localEmbedding: 'gpu' | 'cpu' | undefined;
}): boolean {
  if (state !== 'succeeded' || usedEndpoint || !canAdd || anyEndpoints) return false;
  if (localEmbedding !== 'cpu' || !startedAt || !finishedAt) return false;
  const took = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(took) && took >= SLOW_START_MS;
}
