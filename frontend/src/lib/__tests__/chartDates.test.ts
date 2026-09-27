import { describe, expect, it } from 'vitest';

import { formatChartDate, parsePeriodLabel } from '../chartDates';

describe('chart dates (issue 213)', () => {
  it('reads every Trends period label the backend writes', () => {
    expect(parsePeriodLabel('2020-10-18')).toBe(Date.UTC(2020, 9, 18));
    expect(parsePeriodLabel('2020-10-18 14:05')).toBe(Date.UTC(2020, 9, 18, 14, 5));
    expect(parsePeriodLabel('2020-10-18 14:05:09')).toBe(Date.UTC(2020, 9, 18, 14, 5, 9));
    expect(parsePeriodLabel('2020-10')).toBe(Date.UTC(2020, 9, 1));
    expect(parsePeriodLabel('2020-Q4')).toBe(Date.UTC(2020, 9, 1));
    expect(parsePeriodLabel('2020')).toBe(Date.UTC(2020, 0, 1));
    // %W weeks start on Monday: week 42 of 2020 starts on Monday 19 October.
    expect(parsePeriodLabel('2020-W42')).toBe(Date.UTC(2020, 9, 19));
    expect(parsePeriodLabel('Speeches')).toBeNull();
  });

  it('writes one fixed, readable format whatever the browser locale', () => {
    const ms = Date.UTC(2020, 9, 18, 14, 5, 9);
    expect(formatChartDate(ms, 'day')).toBe('18 Oct 2020');
    expect(formatChartDate(ms, 'minute')).toBe('18 Oct 2020 14:05');
    expect(formatChartDate(ms, 'second')).toBe('18 Oct 2020 14:05:09');
    expect(formatChartDate(ms, 'month')).toBe('Oct 2020');
    expect(formatChartDate(ms, 'quarter')).toBe('2020 Q4');
    expect(formatChartDate(ms, 'year')).toBe('2020');
  });
});
