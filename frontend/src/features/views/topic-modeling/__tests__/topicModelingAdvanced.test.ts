import { describe, expect, it } from 'vitest';

import { topicRunUsedAdvanced } from '../topicModelingAdvanced';

const run = {
  kind: 'topic_modeling' as const,
  node_ids: ['node-1'],
  node_columns: { 'node-1': 'text' },
};

describe('topicRunUsedAdvanced', () => {
  it('is false for Basic settings, sampling per Data Block, and the old default Max tokens', () => {
    expect(topicRunUsedAdvanced(null)).toBe(false);
    expect(topicRunUsedAdvanced(run)).toBe(false);
    expect(topicRunUsedAdvanced({ ...run, sample_fractions: [0.5] })).toBe(false);
    // Runs saved before Auto recorded a size, usually 256.
    expect(topicRunUsedAdvanced({ ...run, max_segment_tokens: 256 })).toBe(false);
  });

  it('is true for Passages, a smaller Max tokens, a seed or Topic sampling', () => {
    expect(topicRunUsedAdvanced({ ...run, segmentation_method: 'sentence' })).toBe(true);
    expect(topicRunUsedAdvanced({ ...run, max_segment_tokens: 64 })).toBe(true);
    expect(topicRunUsedAdvanced({ ...run, random_seed: 7 })).toBe(true);
    expect(topicRunUsedAdvanced({ ...run, cluster_sample_size: 50_000 })).toBe(true);
  });
});
