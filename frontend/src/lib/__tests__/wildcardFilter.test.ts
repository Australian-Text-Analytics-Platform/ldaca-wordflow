import { describe, expect, it } from 'vite-plus/test';

import { createWildcardMatcher } from '../wildcardFilter';

const COLUMNS = [
  'speaker_id',
  'Speaker_Name',
  'utterance_text',
  'utterance.count',
  'session (2024)',
  'notes',
];

describe('createWildcardMatcher', () => {
  it('returns null for a blank query so callers can skip filtering', () => {
    expect(createWildcardMatcher('')).toBeNull();
    expect(createWildcardMatcher('   ')).toBeNull();
  });
  it('matches case-insensitive substrings for plain queries', () => {
    expect(COLUMNS.filter(createWildcardMatcher('speaker')!)).toEqual([
      'speaker_id',
      'Speaker_Name',
    ]);
    expect(COLUMNS.filter(createWildcardMatcher('TEXT')!)).toEqual(['utterance_text']);
  });

  it('treats * as any run of characters, anchored to the whole name', () => {
    expect(COLUMNS.filter(createWildcardMatcher('utterance*')!)).toEqual([
      'utterance_text',
      'utterance.count',
    ]);
    expect(COLUMNS.filter(createWildcardMatcher('*_id')!)).toEqual(['speaker_id']);
    expect(COLUMNS.filter(createWildcardMatcher('*')!)).toEqual(COLUMNS);
  });

  it('treats ? as exactly one character', () => {
    expect(['a1', 'a12', 'b1'].filter(createWildcardMatcher('a?')!)).toEqual(['a1']);
  });

  it('anchors wildcard queries, so a bare fragment does not match', () => {
    expect(COLUMNS.filter(createWildcardMatcher('speaker*')!)).toEqual([
      'speaker_id',
      'Speaker_Name',
    ]);
    expect(COLUMNS.filter(createWildcardMatcher('*eaker')!)).toEqual([]);
  });

  it('matches regex metacharacters in column names literally', () => {
    expect(COLUMNS.filter(createWildcardMatcher('utterance.')!)).toEqual(['utterance.count']);
    expect(COLUMNS.filter(createWildcardMatcher('(2024)')!)).toEqual(['session (2024)']);
    expect(COLUMNS.filter(createWildcardMatcher('session*')!)).toEqual(['session (2024)']);
  });

  it('preserves the original column order', () => {
    expect(COLUMNS.filter(createWildcardMatcher('*e*')!)).toEqual([
      'speaker_id',
      'Speaker_Name',
      'utterance_text',
      'utterance.count',
      'session (2024)',
      'notes',
    ]);
  });
});
