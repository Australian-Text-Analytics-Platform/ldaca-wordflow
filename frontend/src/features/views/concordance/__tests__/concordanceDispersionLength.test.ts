import { describe, expect, it } from 'vitest';

import { codePointLength, getDispersionTextLength } from '../concordanceDispersionDomain';

describe('dispersion text length (issue 96)', () => {
  it('counts code points, the unit of match offsets, so emoji count once', () => {
    expect(codePointLength('go 😀😀 team')).toBe(10);
    expect(getDispersionTextLength({ text: 'go 😀😀 team', CONC_dispersion: [] }, 'text')).toBe(10);
  });

  it('resolves the column per row and ignores the last-match fallback when text exists', () => {
    const row = {
      body: 'x'.repeat(100),
      CONC_dispersion: [{ CONC_start_idx: 40, CONC_end_idx: 45 }],
    };
    expect(getDispersionTextLength(row, () => 'body')).toBe(100);
    // Without text, the length falls back to the last match's end.
    expect(getDispersionTextLength(row, () => '')).toBe(45);
  });
});
