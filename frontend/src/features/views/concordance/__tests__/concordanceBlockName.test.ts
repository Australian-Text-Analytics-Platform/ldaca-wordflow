import { describe, expect, it } from 'vitest';

import { concordanceNameSuffix } from '../concordanceBlockName';

describe('concordanceNameSuffix (issue 457)', () => {
  it('names a result after its search term', () => {
    expect(concordanceNameSuffix(false, 'climate')).toBe('concordance_climate');
    expect(concordanceNameSuffix(true, 'climate')).toBe('concordance_documents_climate');
  });

  it('keeps a regular expression or several terms as typed', () => {
    expect(concordanceNameSuffix(false, String.raw`child\w*`)).toBe('concordance_child-w*');
    expect(concordanceNameSuffix(false, 'jobs, growth')).toBe('concordance_jobs, growth');
  });

  it('collapses spaces, replaces control characters and path separators, and cuts to 20', () => {
    expect(concordanceNameSuffix(false, '  cost   of\tliving ')).toBe('concordance_cost of living');
    expect(concordanceNameSuffix(false, 'and/or')).toBe('concordance_and-or');
    expect(concordanceNameSuffix(false, 'the cost of living crisis in Australia')).toBe(
      'concordance_the cost of living c',
    );
  });

  it('falls back to the plain ending without a term', () => {
    expect(concordanceNameSuffix(false, '   ')).toBe('concordance');
    expect(concordanceNameSuffix(true, '')).toBe('concordance_documents');
  });
});
