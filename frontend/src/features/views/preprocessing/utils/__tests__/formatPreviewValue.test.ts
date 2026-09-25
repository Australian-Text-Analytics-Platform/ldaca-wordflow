import { describe, expect, it } from 'vitest';

import { formatPreviewValue, isEmptyValue } from '../typeUtils';

describe('formatPreviewValue (issue 176)', () => {
  it.each([null, undefined, Number.NaN, '', '   '])('shows %j as an empty cell', (value) => {
    expect(isEmptyValue(value)).toBe(true);
    expect(formatPreviewValue(value)).toBe('');
  });

  it('keeps ordinary values', () => {
    expect(formatPreviewValue('text')).toBe('text');
    expect(formatPreviewValue(0)).toBe('0');
    expect(formatPreviewValue(false)).toBe('false');
    expect(formatPreviewValue({ a: 1 })).toBe('{"a":1}');
  });
});
