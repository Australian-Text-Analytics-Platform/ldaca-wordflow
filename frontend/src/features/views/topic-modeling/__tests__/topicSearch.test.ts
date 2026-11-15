import { describe, expect, it } from 'vitest';

import { matchChecklistOption } from '@/features/views/common/checklistSearch';

import { matchedTopicWords, topicSearchTerms } from '../topicModelingAdapters';
import { assignSearchTermSlots, sameSearchTerms, toggleSearchWord } from '../topicSearch';

const slotsFor = (steps: string[]) => {
  let previous = '';
  let slots = new Map<string, number>();
  for (const query of steps) {
    slots = assignSearchTermSlots(topicSearchTerms(previous), slots, topicSearchTerms(query));
    previous = query;
  }
  return slots;
};

describe('toggleSearchWord', () => {
  it('adds a clicked word to the front and removes it on a second click', () => {
    expect(toggleSearchWord('rent', 'house')).toBe('house, rent');
    expect(toggleSearchWord('house, rent', 'House')).toBe('rent');
    expect(toggleSearchWord('', 'house')).toBe('house');
  });

  it('never removes a wildcard term, only the exact word', () => {
    expect(toggleSearchWord('hous*', 'house')).toBe('house, hous*');
    expect(toggleSearchWord('house, hous*', 'house')).toBe('hous*');
  });

  it('adds a word lit only by a longer match as its own term', () => {
    expect(toggleSearchWord('house', 'household')).toBe('household, house');
  });

  it('keeps wildcard characters in a clicked word literal', () => {
    expect(toggleSearchWord('', 'what?')).toBe('what\\?');
    expect(toggleSearchWord('what\\?', 'what?')).toBe('');
  });
});

describe('assignSearchTermSlots', () => {
  it('keeps each term colour when a new term is added in front', () => {
    const slots = slotsFor(['house', 'rent, house']);
    expect(slots.get('house')).toBe(0);
    expect(slots.get('rent')).toBe(1);
  });

  it('gives a freed colour to the next new term', () => {
    const slots = slotsFor(['house', 'rent, house', 'rent', 'tax, rent']);
    expect(slots.get('rent')).toBe(1);
    expect(slots.get('tax')).toBe(0);
  });

  it('keeps the colour while a term is typed or edited in place', () => {
    const slots = slotsFor(['rent', 'rent, h', 'rent, ho', 'rent, hou']);
    expect(slots.get('rent')).toBe(0);
    expect(slots.get('hou')).toBe(1);
  });

  it('colours matches by slot rather than position', () => {
    const slots = slotsFor(['house', 'rent, house']);
    const matched = matchedTopicWords(
      ['house', 'rent'],
      'rent, house',
      matchChecklistOption,
      slots,
    );
    expect(matched.get('house')).toBe(0);
    expect(matched.get('rent')).toBe(1);
  });
});

describe('sameSearchTerms', () => {
  it('ignores separators and case', () => {
    expect(sameSearchTerms('House rent', 'house, rent')).toBe(true);
    expect(sameSearchTerms('house', 'house, rent')).toBe(false);
  });
});
