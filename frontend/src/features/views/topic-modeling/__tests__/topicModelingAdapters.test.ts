import { describe, expect, it } from 'vitest';
import type { TopicModelingTopic } from '@/api';
import { matchChecklistOption } from '@/features/views/common/checklistSearch';
import {
  filterTopicRepresentativeWords,
  matchedTopicWords,
  sliceTopicRepresentativeWords,
  topicMatchColorVariable,
  topicRepresentativeText,
  topicSearchTerms,
} from '../topicModelingAdapters';

const topic: TopicModelingTopic = {
  id: 0,
  representative_words: [
    { word: 'the', occurrence_count: 20 },
    { word: 'climate', occurrence_count: 8 },
    { word: 'policy', occurrence_count: 5 },
    { word: 'future', occurrence_count: 3 },
    { word: 'energy', occurrence_count: 2 },
  ],
  size: [4],
  total_size: 4,
  x: 0,
  y: 0,
};

describe('topic representative-word projections', () => {
  it('filters before applying the visual slice', () => {
    const filtered = filterTopicRepresentativeWords([topic], new Set(['the']));
    const displayed = sliceTopicRepresentativeWords(filtered, 3);

    expect(displayed[0]?.representative_words.map((term) => term.word)).toEqual([
      'climate',
      'policy',
      'future',
    ]);
    expect(topicRepresentativeText(displayed[0]!)).toBe('climate, policy, future');
  });

  it('keeps all filtered candidates available beside the visual projection', () => {
    const filtered = filterTopicRepresentativeWords([topic], new Set(['the']));
    const displayed = sliceTopicRepresentativeWords(filtered, 3);

    expect(filtered[0]?.representative_words).toHaveLength(4);
    expect(displayed[0]?.representative_words).toHaveLength(3);
    expect(topic.representative_words).toHaveLength(5);
  });
});

describe('matchedTopicWords (issue 342)', () => {
  it('returns every word that matches a wildcard search', () => {
    const words = ['family', 'care', 'familiarisation', 'home'];
    expect([...matchedTopicWords(words, 'famil*', matchChecklistOption).keys()]).toEqual([
      'family',
      'familiarisation',
    ]);
  });

  it('returns nothing without a search', () => {
    expect(matchedTopicWords(['family'], '  ', matchChecklistOption).size).toBe(0);
  });
});

describe('multi-term search (issue 434)', () => {
  it('splits at spaces, commas and other punctuation, keeping wildcards, hyphens and apostrophes', () => {
    expect(topicSearchTerms('chil, home house')).toEqual(['chil', 'home', 'house']);
    expect(topicSearchTerms(' gs*;covid-19 / don’t，家庭。Home home ')).toEqual([
      'gs*',
      'covid-19',
      'don’t',
      '家庭',
      'Home',
    ]);
    expect(topicSearchTerms(' , ')).toEqual([]);
  });

  it('gives each matching word the first term it matches', () => {
    const words = ['child', 'children', 'chill', 'home', 'homeless', 'house', 'housing', 'tax'];
    expect(
      Object.fromEntries(matchedTopicWords(words, 'chil, home house', matchChecklistOption)),
    ).toEqual({
      child: 0,
      children: 0,
      chill: 0,
      home: 1,
      homeless: 1,
      house: 2,
    });
    expect(Object.fromEntries(matchedTopicWords(words, 'hous*', matchChecklistOption))).toEqual({
      house: 0,
      housing: 0,
    });
  });

  it('colours terms orange first, then the other chart colours, repeating after six', () => {
    expect(topicMatchColorVariable(0)).toBe('var(--vscode-charts-orange, #d18616)');
    expect(topicMatchColorVariable(1)).toBe('var(--vscode-charts-blue, #1a5cff)');
    expect(topicMatchColorVariable(6)).toBe(topicMatchColorVariable(0));
  });
});
