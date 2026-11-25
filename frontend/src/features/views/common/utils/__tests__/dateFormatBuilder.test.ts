import { describe, expect, it } from 'vitest';

import {
  describeFormat,
  buildFormat,
  formatReach,
  IGNORE_PART,
  ignoreUnnamed,
  rolesFor,
  sameFormat,
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

  it('reads a time zone after a space the format does not have, as the parser does (issue 526)', () => {
    const segments = segmentsFromFormat('%Y-%m-%d %H:%M:%S%.f%z', '2020-10-16 15:20:22.000 +0000');
    expect(segments?.slice(-3).map((s) => `${s.kind}:${s.text}:${s.spec}`)).toEqual([
      'field:.000:%.f',
      'literal: :',
      'field:+0000:%z',
    ]);
    // The parts then build the format with the space, which reads the same.
    const built = buildFormat(segments ?? []).format ?? '';
    expect(built).toBe('%Y-%m-%d %H:%M:%S%.f %z');
    expect(sameFormat(built, '%Y-%m-%d %H:%M:%S%.f%z')).toBe(true);
    expect(sameFormat('%d/%m/%Y', '%m/%d/%Y')).toBe(false);
  });

  it('says whether a typed format reads the whole value, a date inside it, or nothing', () => {
    const value = '2020-10-16 15:20:22.000 +0000';
    expect(formatReach('%Y-%m-%d %H:%M:%S%.f %z', value)).toBe('whole');
    expect(formatReach('%Y-%m-%d', value)).toBe('inside');
    expect(formatReach('%d/%m/%Y', value)).toBeNull();
    // Text without a code is not a date format, wherever it is found.
    expect(formatReach('', value)).toBeNull();
    expect(formatReach('-', value)).toBeNull();
  });

  it('marks the parts without a name as ignored and leaves the others', () => {
    const named = segmentsFromValue(['2021', '_', '01', '_', 'Lauren']);
    named[0] = { kind: 'field', text: '2021', spec: '%Y' };
    expect(ignoreUnnamed(named).map((s) => s.spec)).toEqual([
      '%Y',
      '',
      IGNORE_PART,
      '',
      IGNORE_PART,
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
    expect(buildFormat(segments).format).toBe('%m/%d/%Y');

    const bare = segmentsFromValue(['30', '/', '01', '/', '2020']);
    expect(buildFormat(bare).format).toBeNull();
  });

  it('offers menus that fit each part and describes formats in words', () => {
    expect(rolesFor('2020').map((r) => r.label)).toContain('Year');
    expect(rolesFor('Oct').map((r) => r.label)).toContain('Month name, short');
    expect(rolesFor('+1000').map((r) => r.label)).toEqual([
      'Time zone',
      'Ignore (not part of the date)',
    ]);
    expect(describeFormat('%d/%m/%Y %H:%M')).toBe('Day/Month/Year Hour:Minute');
    expect(describeFormat('%Y-%m-%d %H:%M:%S%.f%z')).toBe(
      'Year-Month-Day Hour:Minute:Second.Fraction Time zone',
    );
    expect(describeFormat('%H:%M %z')).toBe('Hour:Minute Time zone');
  });

  it('finds a date inside longer text and ignores the rest', () => {
    const segments = segmentsFromFormat('%Y_%m_%d', '2021_01_17_LaurenLancaster', true);
    expect(segments?.map((s) => (s.kind === 'field' ? `${s.text}=${s.spec}` : s.text))).toEqual([
      '2021=%Y',
      '_',
      '01=%m',
      '_',
      '17=%d',
      '_',
      `LaurenLancaster=${IGNORE_PART}`,
    ]);
    expect(segments && buildFormat(segments)).toEqual({
      format: '%Y_%m_%d',
      inText: true,
      ignoredInside: false,
    });
    const before = segmentsFromFormat('%Y-%m-%d', 'Lauren_2020-12-31', true);
    expect(before && buildFormat(before).format).toBe('%Y-%m-%d');
    expect(segmentsFromFormat('%Y_%m_%d', '2021_01_17_LaurenLancaster')).toBeNull();
  });

  it('names parts one at a time and refuses an ignored part inside the date', () => {
    const bare = segmentsFromValue(['2021', '_', 'Lauren', '_', '01', '_', '17']);
    const named = bare.map((segment, index) =>
      segment.kind === 'field'
        ? { ...segment, spec: ['%Y', IGNORE_PART, '%m', '%d'][index / 2] ?? '' }
        : segment,
    );
    expect(buildFormat(named)).toEqual({ format: null, inText: true, ignoredInside: true });
  });

  it('splits run-together digits by width', () => {
    expect(segmentsFromFormat('%Y%m%d', '20210117')?.map((s) => s.text)).toEqual([
      '2021',
      '01',
      '17',
    ]);
  });
});
