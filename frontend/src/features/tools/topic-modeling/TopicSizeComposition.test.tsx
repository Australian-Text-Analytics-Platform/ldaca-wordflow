import { render, screen } from '@testing-library/react';
import { expect, it } from 'vite-plus/test';
import { TopicSizeComposition, topicShare } from './TopicSizeComposition';
import { topicGroupStyle } from './topicModelingGraph';
import { matchTopicWords } from './topicSearch';
import { wrapFigureText } from './topicExport';

it('shows own-population shares in single-input, grouped and unknown-denominator contexts', () => {
  expect(topicShare(1, 10000)).toBe('<0.1%');
  expect(topicShare(11, 200)).toBe('5.5%');
  expect(topicShare(1, 10)).toBe('10%');
  expect(topicShare(0, 10)).toBe('0.0%');
  expect(topicShare(5)).toBeNull();
  const { rerender } = render(
    <TopicSizeComposition
      sizes={[11]}
      corpusCount={1}
      panelNodeIds={[]}
      nodeColors={{}}
      defaultPalette={[]}
      denominators={[200]}
      labels={['研究']}
    />,
  );
  expect(screen.getByText('11 · 5.5%')).toHaveAttribute(
    'title',
    '研究: 11 dominant documents out of 200 documents (5.5%)',
  );
  rerender(
    <TopicSizeComposition
      sizes={[11, 1, 0]}
      corpusCount={3}
      panelNodeIds={[]}
      nodeColors={{}}
      defaultPalette={[]}
      denominators={[200, 10000]}
      labels={['a', 'b', 'Missing']}
    />,
  );
  expect(screen.getByText('1 · <0.1%')).toBeInTheDocument();
  expect(screen.getByText('0')).toHaveAttribute('title', 'Missing: 0 dominant documents');
});

it('blends group-adjusted shares, bounds concentration opacity and keeps escaped word globs', () => {
  const groups = [
    { color: '#000000', count: 100 },
    { color: '#ffffff', count: 10 },
  ];
  expect(topicGroupStyle({ groups, topicCounts: [[10, 1]] }, 0, '#000000')).toEqual({
    fill: 'rgb(128, 128, 128)',
    fillOpacity: 0.25,
  });
  expect(topicGroupStyle({ groups, topicCounts: [[10, 0]] }, 0, '#000000').fillOpacity).toBe(0.8);
  expect(matchTopicWords(['research', 'cat*'], 'res*')).toBe(true);
  expect(matchTopicWords(['research', 'cat*'], 'cat\\*')).toBe(true);
  expect(matchTopicWords(['research', 'cats'], 'cat\\*')).toBe(false);
  expect(wrapFigureText('研究😀研究', 4)).toEqual(['研究', '😀研', '究']);
});
