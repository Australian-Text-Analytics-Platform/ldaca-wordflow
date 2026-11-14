import { describe, expect, it } from 'vitest';

import {
  codePointOffsets,
  splitTopicWords,
  typicalityBadge,
  typicalityBand,
  typicalityLabel,
} from '../topicExamplesModel';

const marked = (text: string, words: string[]) =>
  splitTopicWords(text, words)
    .filter((piece) => piece.word)
    .map((piece) => piece.text);

describe('topic examples model (#353)', () => {
  it('marks whole words only, ignoring case', () => {
    expect(marked('Care for the family; familiar CARE', ['care', 'family'])).toEqual([
      'Care',
      'family',
      'CARE',
    ]);
    expect(splitTopicWords('no words here', [])).toEqual([{ text: 'no words here', word: false }]);
  });

  it('finds words inside unspaced scripts', () => {
    expect(marked('我们的学校很好', ['学校'])).toEqual(['学校']);
  });

  it('prefers the longer of two overlapping words', () => {
    expect(marked('new york city', ['new', 'new york'])).toEqual(['new york']);
  });

  it('marks a passage that joined after grouping, on the grouped passages’ scale', () => {
    expect(typicalityBadge({ typicality: 90 })).toMatchObject({ text: 'Top 10%', band: 'high' });
    expect(typicalityBadge({ typicality: 40, joined: true })).toMatchObject({
      text: 'Joined · Top 60%',
      band: 'middle',
    });
    // Less similar than every passage grouping put in the topic.
    expect(typicalityBadge({ typicality: 0, joined: true, outsideTopicRange: true })).toMatchObject(
      { text: 'Joined · Outside', band: 'low' },
    );
  });

  it('labels typicality as a rank within the Topic, in three bands', () => {
    expect(typicalityLabel(100)).toBe('Top 1%');
    expect(typicalityLabel(90)).toBe('Top 10%');
    expect(typicalityLabel(0)).toBe('Top 100%');
    expect(typicalityBand(75)).toBe('high');
    expect(typicalityBand(74)).toBe('middle');
    expect(typicalityBand(25)).toBe('middle');
    expect(typicalityBand(24)).toBe('low');
  });

  it('maps code points to string offsets across emoji', () => {
    expect(codePointOffsets('a😀b')).toEqual([0, 1, 3, 4]);
  });
});
