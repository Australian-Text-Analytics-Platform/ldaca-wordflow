import { describe, expect, it } from 'vitest';

import {
  describeFormat,
  formatFromSegments,
  rolesFor,
  segmentsFromFormat,
  segmentsFromValue,
} from '../dateFormatBuilder';

describe('date format builder (issue 322)', () => {
  it('lines a detected format up against a value', () => {
    const segments = segmentsFromFormat('%d/%m/%Y %H:%M', '30/01/2020 14:05');

    expect(segments?.map((s) => (s.kind === 'field' ? `${s.text}=${s.spec}` : s.text))).toEqual([
      '30=%d',
      '/',
      '01=%m',
      '/',
      '2020=%Y',
      ' ',
      '14=%H',
      ':',
      '05=%M',
    ]);
  });

  it('reads Twitter dates, ISO times with fractions and zones', () => {
    expect(
      segmentsFromFormat('%a %b %d %H:%M:%S %z %Y', 'Thu Oct 01 23:59:59 +0000 2020'),
    ).not.toBeNull();
    const iso = segmentsFromFormat('%Y-%m-%dT%H:%M:%S%.f%:z', '2020-10-01T23:59:59.123+10:00');
    expect(iso?.filter((s) => s.kind === 'field').map((s) => s.text)).toEqual([
      '2020',
      '10',
      '01',
      '23',
      '59',
      '59',
      '.123',
      '+10:00',
    ]);
  });

  it('gives up when the format does not read the value', () => {
    expect(segmentsFromFormat('%Y-%m-%d', '30/01/2020')).toBeNull();
  });

  it('rebuilds the format when a part is renamed, and waits for unnamed parts', () => {
    const segments = segmentsFromFormat('%d/%m/%Y', '03/01/2020');
    if (!segments) throw new Error('expected segments');
    segments[0] = { ...segments[0], spec: '%m' };
    segments[2] = { ...segments[2], spec: '%d' };
    expect(formatFromSegments(segments)).toBe('%m/%d/%Y');

    const bare = segmentsFromValue(['30', '/', '01', '/', '2020']);
    expect(formatFromSegments(bare)).toBeNull();
  });

  it('offers menus that fit each part and describes formats in words', () => {
    expect(rolesFor('2020').map((r) => r.label)).toContain('Year');
    expect(rolesFor('Oct').map((r) => r.label)).toContain('Month name, short');
    expect(rolesFor('+1000').map((r) => r.label)).toEqual(['Time zone']);
    expect(describeFormat('%d/%m/%Y %H:%M')).toBe('Day/Month/Year Hour:Minute');
  });
});
