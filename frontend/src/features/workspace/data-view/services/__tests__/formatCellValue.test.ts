import { describe, expect, it } from 'vitest';

import { formatCellValue } from '../formatCellValue';

describe('formatCellValue (issue 205)', () => {
  it('reads lists and structs instead of [object Object]', () => {
    expect(formatCellValue(['alpha', 'beta'])).toBe('alpha, beta');
    expect(formatCellValue({ topic_id: 3, coverage: 0.5 })).toBe('topic_id: 3; coverage: 0.5');
    expect(formatCellValue({ toJSON: () => ({ a: 1 }) })).toBe('a: 1');
  });

  it('keeps plain values and empties', () => {
    expect(formatCellValue('text')).toBe('text');
    expect(formatCellValue(12)).toBe('12');
    expect(formatCellValue(false)).toBe('false');
    expect(formatCellValue(null)).toBe('');
    expect(formatCellValue(Symbol('x'))).toBe('');
  });
});
