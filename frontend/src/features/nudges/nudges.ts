/**
 * Suggestions (issue 360): short reminders that appear when a result or run
 * looks off, and outline the settings that may help. They never stop people,
 * need no closing, and come back when the situation happens again. Internally
 * they are "nudges"; the interface calls them Suggestions. Every message,
 * outline target and threshold lives here, so they are easy to tune.
 */

/** Names elements carry in `data-nudge-target`, so a suggestion can outline them. */
export const NUDGE_TARGETS = {
  concordancePageSize: 'concordance-page-size',
  concordanceRun: 'concordance-run',
  topicMinClusterSize: 'topic-min-cluster-size',
  topicMaxClusterSize: 'topic-max-cluster-size',
  topicDocumentSampling: 'topic-document-sampling',
  topicClusterSample: 'topic-cluster-sample',
  tokenizer: 'tokenizer-model',
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
/** A run still in its first steps (segments and embeddings) after this long. */
export const SLOW_START_MS = 5 * 60_000;
/** Steps that count as the first steps of a Topic Modelling run. */
export const SLOW_START_STEPS = 2;

export interface NudgeDefinition {
  title: string;
  message: string;
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
    message:
      'A lower Max topic size splits it into smaller topics. Clear the results first to change it.',
    targets: [NUDGE_TARGETS.topicMaxClusterSize],
  },
  'topic-few-topics': {
    title: 'Only a few topics',
    message:
      'A slightly lower Min topic size finds more topics. Clear the results first to change it.',
    targets: [NUDGE_TARGETS.topicMinClusterSize],
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
  'topic-large-input': {
    title: 'A large input',
    message:
      'For a faster first run, use a sample: fewer documents with Sampling, or fewer segments with Topic sampling.',
    targets: [NUDGE_TARGETS.topicDocumentSampling, NUDGE_TARGETS.topicClusterSample],
  },
} as const satisfies Record<string, NudgeDefinition>;

export type NudgeId = keyof typeof NUDGES;

interface TopicResultShape {
  clusterCount: number;
  largestTopicSize: number;
  clusteredSegments: number;
}

/** Which Topic Modelling result suggestion applies, if any. A giant topic comes first. */
export function topicResultNudge({
  clusterCount,
  largestTopicSize,
  clusteredSegments,
}: TopicResultShape): NudgeId | null {
  if (clusteredSegments > 0 && largestTopicSize / clusteredSegments > GIANT_TOPIC_SHARE) {
    return 'topic-giant-topic';
  }
  if (clusterCount > 0 && clusterCount < FEW_TOPICS) return 'topic-few-topics';
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
