import { describe, expect, it } from 'vitest';

import { interpolateColor } from '../../../topicModelingAdapters';
import { topicCorpusLegend } from '../topicModelingGraph';

describe('topicCorpusLegend (issue 281)', () => {
  const presentation = {
    corpusCount: 2,
    panelNodeIds: ['a', 'b'],
    nodeColors: { a: '#2563eb', b: '#dc2626' },
    defaultPalette: ['#111111', '#222222'],
  };

  it('names both Data Blocks, their colours and the blend between them', () => {
    expect(topicCorpusLegend(presentation, ['Housing 2023', 'Housing 2008'])).toEqual([
      { label: 'Housing 2023', color: '#2563eb' },
      {
        label: 'In between: shared by both, by share of each',
        color: interpolateColor('#2563eb', '#dc2626', 0.5),
      },
      { label: 'Housing 2008', color: '#dc2626' },
    ]);
  });

  it('is absent for one Data Block', () => {
    expect(topicCorpusLegend({ ...presentation, corpusCount: 1 }, ['Housing'])).toBeNull();
  });
});
