import { describe, expect, it } from 'vitest';

import { describeQuoteType, explainQuoteType } from '../quoteTypes';

describe('quote types (issue 174)', () => {
  it.each([
    ['QCQVS', 'The quote in quotation marks, then the verb, then the speaker.'],
    ['SVQCQ', 'The speaker, then the verb, then the quote in quotation marks.'],
    ['SVC', 'The speaker, then the verb, then the quote (reported speech).'],
    ['AccordingTo', 'Attributed with "according to".'],
  ])('explains %s', (code, expected) => {
    expect(explainQuoteType(code)).toBe(expected);
  });

  it('describes floating and heuristic quotes', () => {
    expect(describeQuoteType('QCQ')).toMatch(/continues the previous quote/);
    expect(describeQuoteType('Heuristic')).toMatch(/fallback rule/);
  });

  it('leaves unknown or empty codes as they are', () => {
    expect(explainQuoteType('')).toBeNull();
    expect(explainQuoteType('XYZ')).toBeNull();
    expect(explainQuoteType('VS')).toBeNull();
  });
});
