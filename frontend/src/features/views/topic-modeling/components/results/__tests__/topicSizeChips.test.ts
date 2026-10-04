import { describe, expect, it } from 'vitest';
import { formatGroupShare, topicSizeChips } from '../topicSizeChips';

const presentation = {
  panelNodeIds: ['a', 'b'],
  nodeColors: {},
  defaultPalette: ['#2563eb', '#dc2626'],
};

describe('topic size chips show each count with its share of its group (issue 307)', () => {
  it('formats shares with few digits', () => {
    expect(formatGroupShare(296, 3729)).toBe('7.9%');
    expect(formatGroupShare(353, 2871)).toBe('12%');
    expect(formatGroupShare(1, 15)).toBe('6.7%');
    expect(formatGroupShare(15, 15)).toBe('100%');
    expect(formatGroupShare(0, 15)).toBe('0%');
    expect(formatGroupShare(1, 5000)).toBe('<0.1%');
    expect(formatGroupShare(2, 1000)).toBe('0.2%');
    expect(formatGroupShare(3, 0)).toBeNull();
    expect(formatGroupShare(353, 2871, true)).toBe('12.3%');
  });

  it('follows each colour-by count with its share, and gives the totals on hover', () => {
    const model = topicSizeChips({
      ...presentation,
      corpusCount: 1,
      sizes: [650],
      total: 650,
      topicId: 0,
      colorScheme: {
        column: 'chamber',
        groups: [
          { label: 'House', color: '#2563eb', documentCount: 3729, missing: false },
          { label: 'Senate', color: '#dc2626', documentCount: 2871, missing: false },
          { label: 'Committee', color: '#16a34a', documentCount: 15, missing: false },
        ],
        topicCounts: [[296, 353, 1]],
      },
    });
    expect(model?.chips.map((chip) => chip.text)).toEqual(['296 · 7.9%', '353 · 12%', '1 · 6.7%']);
    expect(model?.chips[1]?.title).toBe('Senate: 353 of 2,871 documents (12.3%)');
  });

  it('labels the chips in the hover card', () => {
    const model = topicSizeChips({
      ...presentation,
      corpusCount: 1,
      sizes: [5],
      total: 5,
      topicId: 0,
      showLabels: true,
      colorScheme: {
        column: 'chamber',
        groups: [{ label: 'House', color: '#2563eb', documentCount: 50, missing: false }],
        topicCounts: [[5]],
      },
    });
    expect(model?.chips[0]?.text).toBe('House 5 · 10%');
  });

  it('gives two Data Blocks their share of each Data Block', () => {
    const model = topicSizeChips({
      ...presentation,
      corpusCount: 2,
      sizes: [40, 9],
      total: 49,
      corpusSizes: [400, 1200],
    });
    expect(model?.chips.map((chip) => chip.text)).toEqual(['40 · 10%', '9 · 0.8%']);
    expect(model?.chips[1]?.title).toBe('9 of 1,200 documents (0.8%)');
  });

  it('shows the count alone when the group size is unknown', () => {
    const model = topicSizeChips({ ...presentation, corpusCount: 1, sizes: [7], total: 7 });
    expect(model?.chips[0]?.text).toBe('7');
  });
});
