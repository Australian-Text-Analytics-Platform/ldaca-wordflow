import { describe, expect, it } from 'vitest';

import { moveLabel, naturalCompare, orderedLabels, stackedCategoryOrder } from '../categoryOrder';

describe('category order helpers (issue 318)', () => {
  it('sorts A to Z ignoring case, with numbers inside labels compared as numbers', () => {
    expect(['Q10', 'q9', 'apple', 'Banana'].sort(naturalCompare)).toEqual([
      'apple',
      'Banana',
      'q9',
      'Q10',
    ]);
  });

  it('derives each order mode from the default order', () => {
    expect(orderedLabels(['1', '9', '10'], 'descending', 'value', false)).toEqual(['10', '9', '1']);
    // An ordered category's own order is not A to Z.
    const own = ['High', 'Low', 'Mid'];
    expect(orderedLabels(own, 'current', 'text', true)).toEqual(own);
    expect(orderedLabels(own, 'ascending', 'text', true)).toEqual(['High', 'Low', 'Mid']);
    expect(orderedLabels(['Low', 'Mid', 'High'], 'ascending', 'text', true)).toEqual([
      'High',
      'Low',
      'Mid',
    ]);
  });

  it('orders by row counts, ties in A to Z order', () => {
    const counts = new Map([
      ['a', 1],
      ['b', 3],
      ['c', 1],
    ]);
    expect(orderedLabels(['a', 'b', 'c'], 'most', 'text', false, counts)).toEqual(['b', 'a', 'c']);
    expect(orderedLabels(['a', 'b', 'c'], 'fewest', 'text', false, counts)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  it('moves one value to another position', () => {
    expect(moveLabel(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(moveLabel(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  });

  it('combines Stack orders as the backend does', () => {
    expect(
      stackedCategoryOrder(
        [
          ['Low', 'Mid', 'High'],
          ['Low', 'High'],
        ],
        [],
      ),
    ).toEqual({
      order: ['Low', 'Mid', 'High'],
      kept: true,
    });
    expect(
      stackedCategoryOrder(
        [
          ['b', 'a'],
          ['a', 'b'],
        ],
        [],
      ),
    ).toEqual({
      order: ['a', 'b'],
      kept: false,
    });
    expect(stackedCategoryOrder([['Low', 'High']], ['Extra', 'Low'])).toEqual({
      order: ['Low', 'High', 'Extra'],
      kept: true,
    });
  });
});
