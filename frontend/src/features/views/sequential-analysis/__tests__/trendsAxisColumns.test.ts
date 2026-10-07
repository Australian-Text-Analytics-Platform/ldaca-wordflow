import {
  Bool,
  DateDay,
  Decimal,
  DurationMillisecond,
  Field,
  Float64,
  Int64,
  IntervalDayTime,
  TimeMicrosecond,
  TimestampMicrosecond,
  Utf8,
} from 'apache-arrow';
import { describe, expect, it } from 'vitest';

import {
  elapsedFrequency,
  elapsedUnit,
  isTrendsAxisField,
  isTrendsDateField,
  trendsAxisRank,
} from '../trendsAxisColumns';

const field = (type: ConstructorParameters<typeof Field>[1]) => new Field('column', type, true);

describe('Trends axis columns (issue 316)', () => {
  it('offers dates, date-times and numbers', () => {
    expect(isTrendsAxisField(field(new DateDay()))).toBe(true);
    expect(isTrendsAxisField(field(new TimestampMicrosecond()))).toBe(true);
    expect(isTrendsAxisField(field(new Int64()))).toBe(true);
    expect(isTrendsAxisField(field(new Float64()))).toBe(true);
    expect(isTrendsAxisField(field(new Decimal(2, 10)))).toBe(true);
  });

  it('offers elapsed time and ranks it with dates, before numbers (issue 324)', () => {
    expect(isTrendsAxisField(field(new DurationMillisecond()))).toBe(true);
    expect(trendsAxisRank(field(new DurationMillisecond()))).toBe(0);
    expect(trendsAxisRank(field(new Int64()))).toBe(1);
    expect(elapsedFrequency('elapsed', 'monthly')).toBe('minute');
    expect(elapsedFrequency('elapsed', 'custom')).toBe('custom');
    expect(elapsedFrequency('datetime', 'monthly')).toBe('monthly');
    expect(elapsedUnit('elapsed', 'weeks')).toBe('minutes');
  });

  it('does not offer times of day, intervals, text or booleans', () => {
    expect(isTrendsAxisField(field(new TimeMicrosecond()))).toBe(false);
    expect(isTrendsAxisField(field(new IntervalDayTime()))).toBe(false);
    expect(isTrendsAxisField(field(new Utf8()))).toBe(false);
    expect(isTrendsAxisField(field(new Bool()))).toBe(false);
  });

  it('treats only dates and date-times as calendar axes', () => {
    expect(isTrendsDateField(field(new DateDay()))).toBe(true);
    expect(isTrendsDateField(field(new TimestampMicrosecond()))).toBe(true);
    expect(isTrendsDateField(field(new Int64()))).toBe(false);
    expect(isTrendsDateField(field(new TimeMicrosecond()))).toBe(false);
  });
});
