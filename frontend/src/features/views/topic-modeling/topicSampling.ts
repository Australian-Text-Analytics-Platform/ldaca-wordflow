import {
  queryWorkspaceSqlTable,
  sqlIdentifier,
  sqlString,
  sqlTable,
  type TopicSegmentationMethod,
} from '@/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Topic sampling (issue 330). Clustering time grows with the square of the
 * segment count. With sampling, the native pipeline finds topics from a
 * sample of segments picked with the run's seed, and gives every other
 * segment the topic of its most similar sampled segment. It is off by
 * default: it saves clustering time only (every segment is still embedded),
 * and a smaller sample merges nearby topics and misses small ones.
 */

/**
 * Timing on an M5 Pro (2026-10-07, all cores, embeddings cached): clustering
 * 107,551 segments took 47 s and 501,591 took 497 s, growing about as the
 * segment count to the power 1.5. Slower computers take several times longer.
 */

/** The suggested sample: clusters in well under a minute on a recent laptop. */
const TOPIC_SAMPLE_SUGGESTION = 100_000;

/** Above this many estimated segments (about 80 s of clustering on the M5 Pro) the note suggests sampling. */
export const TOPIC_SAMPLING_SUGGEST_ABOVE = 150_000;

/**
 * Embedding ran at about 36,000 tokens a second on the M5 Pro, so above this
 * many estimated tokens a first run embeds for minutes (much longer on older
 * computers) and the inputs show a first-run note.
 */
export const TOPIC_FIRST_RUN_NOTE_TOKENS = 5_000_000;

/** The smallest sample the backend accepts. */
const TOPIC_SAMPLE_MIN = 1_000;

/** The grey suggestion in the Segments to sample field for a corpus of about this many segments. */
export const suggestedTopicSampleSize = (_estimatedSegments: number | null): number =>
  TOPIC_SAMPLE_SUGGESTION;

/** A whole sample size of at least TOPIC_SAMPLE_MIN, or `null` (use the suggestion) when blank or unreadable. */
export const sanitizeTopicSampleSize = (value: string): number | null => {
  const raw = Number(value.trim().replaceAll(',', ''));
  if (value.trim() === '' || !Number.isFinite(raw)) return null;
  return Math.max(TOPIC_SAMPLE_MIN, Math.round(raw));
};

/**
 * The smallest topic a sample can still find, in segments of the whole
 * corpus: a topic needs Min topic size segments inside the sample.
 */
export const smallestFindableTopic = (
  minTopicSize: number,
  totalSegments: number,
  sampleSize: number,
): number => Math.ceil((minTopicSize * totalSegments) / Math.max(1, sampleSize));

/** Rough characters per model token for English text, used only for the estimates. */
export const CHARACTERS_PER_TOKEN = 4;

/**
 * SQL estimating how many Topic Segments a text column makes, without
 * tokenising. Automatic packs paragraphs up to the token window, so a
 * document gives about its length over the window (at least one); Paragraph
 * gives one per non-empty line; Sentence one per sentence-ending mark or line.
 * Oversized units that split are not counted, so this is a floor for Paragraph
 * and Sentence.
 */
export const segmentEstimateSql = (
  nodeId: string,
  columnName: string,
  method: TopicSegmentationMethod,
  maxTokens: number,
): string => {
  const text = `COALESCE(CAST(${sqlIdentifier(columnName)} AS VARCHAR), '')`;
  const occurrences = (needle: string) =>
    `(LENGTH(${text}) - LENGTH(REPLACE(${text}, ${sqlString(needle)}, ''))) / ${String(needle.length)}`;
  const perDocument =
    method === 'line'
      ? `${occurrences('\n')} + 1 - ${occurrences('\n\n')}`
      : method === 'sentence'
        ? ['. ', '? ', '! ', '。', '\n'].map(occurrences).join(' + ') + ' + 1'
        : `GREATEST(1, CEIL(LENGTH(${text}) / ${String(CHARACTERS_PER_TOKEN * maxTokens)}.0))`;
  return `SELECT SUM(${perDocument}) AS segments, SUM(LENGTH(${text})) AS characters FROM ${sqlTable(nodeId)}`;
};

/**
 * Estimated Topic Segments and characters in one Data Block's text column,
 * before any sampling percentage.
 */
export const segmentEstimateQuery = (
  workspaceId: string,
  nodeId: string,
  columnName: string,
  method: TopicSegmentationMethod,
  maxTokens: number,
) => ({
  queryKey: queryKeys.topicSegmentEstimate(workspaceId, nodeId, columnName, method, maxTokens),
  queryFn: async () => {
    const response = await queryWorkspaceSqlTable({
      path: { workspace_id: workspaceId },
      body: {
        mode: 'query',
        node_ids: [nodeId],
        sql: segmentEstimateSql(nodeId, columnName, method, maxTokens),
        page: 1,
        page_size: 1,
      },
    });
    const row = response.rows[0];
    return {
      segments: Math.round(Number(row?.segments ?? 0)),
      characters: Math.round(Number(row?.characters ?? 0)),
    };
  },
  enabled: Boolean(workspaceId && nodeId && columnName),
  staleTime: Infinity,
});
