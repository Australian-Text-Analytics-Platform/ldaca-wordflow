import { describe, expect, it } from 'vitest';

import { displayDateTime } from '@/lib/displayDateTime';

describe('displayDateTime (issue 205)', () => {
  it('shows decoded timestamps year first, without the time zone', () => {
    expect(displayDateTime('2020-01-30T00:00:00.000Z')).toBe('2020-01-30 00:00');
    expect(displayDateTime('2020-10-16T21:23:59.000Z')).toBe('2020-10-16 21:23:59');
    expect(displayDateTime('2020-10-16T21:23:59.250Z')).toBe('2020-10-16 21:23:59.250');
  });

  it('leaves other text alone', () => {
    expect(displayDateTime('2020-01-30')).toBe('2020-01-30');
    expect(displayDateTime('hello')).toBe('hello');
  });
});
