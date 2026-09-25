import { describe, expect, it } from 'vitest';

import { describeQuoteType, formatQuoteType } from '../quoteTypes';

describe('quote types (issue 174)', () => {
  it.each([
    ['QCQVS', 'QCQVS: The quote in quotation marks, then the verb, then the speaker'],
    ['SVQCQ', 'SVQCQ: The speaker, then the verb, then the quote in quotation marks'],
    ['SVC', 'SVC: The speaker, then the verb, then the quote (reported speech)'],
    ['AccordingTo', 'AccordingTo: Attributed with "according to"'],
  ])('describes %s', (code, expected) => {
    expect(formatQuoteType(code)).toBe(expected);
  });

  it('describes floating and heuristic quotes', () => {
    expect(describeQuoteType('QCQ')).toMatch(/continues the previous quote/);
    expect(describeQuoteType('Heuristic')).toMatch(/fallback rule/);
  });

  it('leaves unknown or empty codes as they are', () => {
    expect(formatQuoteType('')).toBe('');
    expect(formatQuoteType('XYZ')).toBe('XYZ');
    expect(formatQuoteType('VS')).toBe('VS');
  });
});
