import { describe, expect, it } from 'vitest';

import { clampDisplayTokenLimit, DEFAULT_TOKEN_LIMIT } from '../utils';

describe('analysis common utils', () => {
  it.each([
    ['missing preference', undefined, DEFAULT_TOKEN_LIMIT, false],
    ['cleared preference', null, DEFAULT_TOKEN_LIMIT, false],
    ['nonfinite preference', Infinity, DEFAULT_TOKEN_LIMIT, false],
    ['zero', 0, 1, true],
    ['negative', -4, 1, true],
    ['fractional limit', 3.9, 3, false],
    ['valid limit', 40, 40, false],
  ] as const)('normalizes %s before storing a display limit', (_label, value, limit, wasClamped) => {
    expect(clampDisplayTokenLimit(value)).toEqual({ limit, wasClamped });
  });
});
