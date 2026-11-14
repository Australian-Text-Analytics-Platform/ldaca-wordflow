import { describe, expect, it } from 'vitest';

import { isWideText, textWidthUnits, WIDE_COLUMN_THRESHOLD } from '../columnWidth';

describe('column width', () => {
  it('limits a value too long for the limited width, such as a file address', () => {
    // 107 characters: under the old 120-character rule it kept its full width.
    expect(
      isWideText(
        'https://data.ldaca.edu.au/api/stream?id=arcp%3A%2F%2Fname%2Cdoi10.25949%252F24629712.v1&path=A01a-plain.txt',
      ),
    ).toBe(true);
    expect(isWideText('A01a-plain.txt')).toBe(false);
    expect(isWideText('a'.repeat(WIDE_COLUMN_THRESHOLD))).toBe(false);
    expect(isWideText('a'.repeat(WIDE_COLUMN_THRESHOLD + 1))).toBe(true);
  });

  it('counts Chinese, Japanese and Korean characters as twice as wide', () => {
    expect(textWidthUnits('abc')).toBe(3);
    expect(textWidthUnits('日本語')).toBe(6);
    expect(isWideText('語'.repeat(22))).toBe(false);
    expect(isWideText('語'.repeat(23))).toBe(true);
  });
});
