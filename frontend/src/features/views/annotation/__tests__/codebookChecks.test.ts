import { describe, expect, it } from 'vitest';
import {
  checkCodebook,
  codebookSuggestions,
  mergedDescription,
  resolveCode,
  withoutRepeatedRows,
} from '../codebookChecks';

const row = (code: string, description: string) => ({ class: code, description });

describe('checkCodebook', () => {
  it('finds repeated rows, codes with different descriptions and shared descriptions', () => {
    const rows = [
      row('protest', 'Reports of protests'),
      row('university', 'University policy'),
      row('Protest ', 'Reports of  protests'),
      row('university', 'Campus news'),
      row('campus', 'Campus news'),
      row('', 'ignored'),
    ];
    const check = checkCodebook(rows);

    expect(check.repeatedRows).toEqual([2]);
    expect(check.codesWithSeveralDescriptions).toEqual([
      { name: 'university', key: 'university', descriptions: ['University policy', 'Campus news'] },
    ]);
    expect(check.sharedDescriptions).toEqual([{ codes: ['university', 'campus'] }]);
    expect([...check.rowsToMark].sort()).toEqual([1, 2, 3, 4]);
    expect(codebookSuggestions(rows, check)).toEqual([
      '“Protest” appears more than once with the same description. Remove the repeated rows.',
      '“university” has 2 different descriptions. Choose one, merge them, or rename one of the codes.',
      '“university” and “campus” have the same description. Give each code its own description, or merge them into one code.',
    ]);
  });

  it('finds nothing in a clean codebook', () => {
    const check = checkCodebook([row('a', 'one'), row('b', 'two'), row('c', '')]);
    expect(check.rowsToMark.size).toBe(0);
  });
});

describe('fixing a codebook', () => {
  it('removes only rows that repeat an earlier row', () => {
    const rows = [row('a', 'one'), row('b', 'two'), row('A', 'one')];
    expect(withoutRepeatedRows(rows)).toEqual([row('a', 'one'), row('b', 'two')]);
  });

  it('keeps one row per code with the chosen or merged description', () => {
    const rows = [row('a', 'one'), row('b', 'two'), row('a', 'uno')];
    expect(resolveCode(rows, 'a', 'uno')).toEqual([row('a', 'uno'), row('b', 'two')]);
    expect(resolveCode(rows, 'a', mergedDescription(['one', 'uno']))).toEqual([
      row('a', 'one; uno'),
      row('b', 'two'),
    ]);
  });
});
