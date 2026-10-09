/**
 * Ungrouped (issue 362): the segments the clustering leaves out of every Topic
 * (HDBSCAN noise, BERTopic's outliers), shown as a grey bubble and a Topic list
 * entry so the documents in it are not lost silently. It is not ranked in Top
 * topics per document and holds only the documents with no real Topic.
 */
import type { TopicModelingTopic } from '@/api';

const UNGROUPED_TOPIC_ID = -1;
const UNGROUPED_LABEL = 'Ungrouped';
/** A constant light fill: set apart from the coloured Topics, not a dark hole. */
export const UNGROUPED_BUBBLE_OPACITY = 0.3;

export const isUngrouped = (topicId: number): boolean => topicId === UNGROUPED_TOPIC_ID;

/** "Topic 5", or "Ungrouped". */
export const topicLabel = (topicId: number): string =>
  isUngrouped(topicId) ? UNGROUPED_LABEL : `Topic ${String(topicId)}`;

/** "T5" on a bubble, or "Ungrouped". */
export const topicShortLabel = (topicId: number): string =>
  isUngrouped(topicId) ? UNGROUPED_LABEL : `T${String(topicId)}`;

/**
 * The Ungrouped entry for a result: its documents per Data Block, no words.
 * Null for results made before 0.7.12 (no counts) or with none ungrouped.
 */
export function ungroupedTopic(
  data: { ungrouped_documents?: number[] | null } | null | undefined,
): TopicModelingTopic | null {
  const sizes = data?.ungrouped_documents;
  if (!sizes) return null;
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total === 0) return null;
  return {
    id: UNGROUPED_TOPIC_ID,
    representative_words: [],
    size: sizes,
    total_size: total,
    // Placed in a corner by the bubble layout, not by these coordinates.
    x: 0,
    y: 0,
  };
}
