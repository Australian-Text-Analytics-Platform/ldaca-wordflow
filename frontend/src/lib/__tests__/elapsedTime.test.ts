import { describe, expect, it } from 'vitest';
import { arrowDurationMicros, formatElapsed, parseElapsed } from '../elapsedTime';
import { formatterFromSpec } from '../chartHtml/portableFormatter';
import { formatChartDate } from '../chartDates';

describe('elapsed time (issue 324)', () => {
  it('shows minutes under an hour and the fraction only when set', () => {
    expect(formatElapsed(478_542_000)).toBe('7:58.542');
    expect(formatElapsed(478_500_000n)).toBe('7:58.5');
    expect(formatElapsed(5_000_250_000)).toBe('1:23:20.25');
    expect(formatElapsed(60_000_000)).toBe('1:00');
    expect(formatElapsed(-5_000_000)).toBe('-0:05');
  });

  it('reads Arrow durations in their unit', () => {
    // Arrow TimeUnit: 1 is milliseconds, 2 microseconds.
    expect(formatElapsed(arrowDurationMicros(478_542n, 1))).toBe('7:58.542');
    expect(formatElapsed(arrowDurationMicros(478_542_000n, 2))).toBe('7:58.542');
  });

  it('reads typed times like the backend', () => {
    expect(parseElapsed('7:58')).toBe(478_000_000);
    expect(parseElapsed('07:58.5')).toBe(478_500_000);
    expect(parseElapsed('1:23:20')).toBe(5_000_000_000);
    expect(parseElapsed('00:07:58,542')).toBe(478_542_000);
    expect(parseElapsed('7:58', 'hours')).toBe(28_680_000_000);
    expect(parseElapsed('12:60')).toBeNull();
    expect(parseElapsed('soon')).toBeNull();
  });

  it('labels chart axes in seconds the same way, also in the HTML download', () => {
    const label = formatterFromSpec({ kind: 'elapsed' }, formatChartDate);
    expect(label(478.5)).toBe('7:58.5');
    expect(label(3600)).toBe('1:00:00');
    expect(label('x')).toBe('');
  });
});
