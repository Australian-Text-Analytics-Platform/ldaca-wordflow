import { describe, expect, it } from 'vitest';

import { normalizeIsoDraft } from '../dateTimeHelpers';

describe('normalizeIsoDraft (issue 205)', () => {
  it('accepts dates and times typed the way the tables show them', () => {
    expect(normalizeIsoDraft('2020-01-30')).toBe('2020-01-30T00:00:00+00:00');
    expect(normalizeIsoDraft('2020-01-30 14:05')).toBe('2020-01-30T14:05:00+00:00');
    expect(normalizeIsoDraft('2020-01-30T14:05:00Z')).toBe('2020-01-30T14:05:00+00:00');
  });
});
