import { describe, expect, it } from 'vitest';
import { BUNDLED_REGISTRY } from '@/tutorials/bundledRegistry';
import { helpMenuTopics, parseHelpMenuTopic } from '../helpMenuTopics';

describe('desktop Help menu topics', () => {
  it('lists every help section titled with its page', () => {
    const topics = helpMenuTopics(BUNDLED_REGISTRY);
    const count =
      Object.keys(BUNDLED_REGISTRY.tutorial).length +
      Object.keys(BUNDLED_REGISTRY.info).length +
      Object.keys(BUNDLED_REGISTRY.reference).length;
    expect(topics).toHaveLength(count);
    expect(topics).toContainEqual({
      id: 'tutorial:analysis.quotation.context-length',
      title: 'Quotation context length (Quotation Extraction)',
    });
    expect(new Set(topics.map((topic) => topic.id)).size).toBe(count);
  });

  it('reads a topic id back, refusing unknown kinds', () => {
    expect(parseHelpMenuTopic('tutorial:analysis.annotation.thinking')).toEqual({
      kind: 'tutorial',
      key: 'analysis.annotation.thinking',
    });
    expect(parseHelpMenuTopic('other:x')).toBeNull();
    expect(parseHelpMenuTopic('nokind')).toBeNull();
  });
});
