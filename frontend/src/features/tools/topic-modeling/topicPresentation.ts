import type { TopicWord } from '@/features/tools/topic-modeling/api';
export interface TopicModelingTopic {
  id: number;
  x: number;
  y: number;
  size: number[];
  dominantCounts?: number[];
  colourCounts?: number[];
  total_size: number;
  representative_words: TopicWord[];
}
export const topicRepresentativeText = (topic: TopicModelingTopic) =>
  topic.representative_words.map((term) => term.word).join(', ');
