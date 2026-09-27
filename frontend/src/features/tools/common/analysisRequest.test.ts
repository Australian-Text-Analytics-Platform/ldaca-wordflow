import { describe, expect, it } from 'vitest';
import { decodeAnalysisRequest, emptyConcordance, matchesAnalysisRequest } from './analysisRequest';
const input = {
  source: { schema: 'data', name: 'Corpus' },
  column: 'text',
  tokenizer: 'future-model',
};
describe('saved request compatibility', () => {
  it('restores siblings, reports exact nested originals, and never mutates saved JSON', () => {
    const original = {
      inputs: [{ ...input, tokenizer: 42, extra: '<script>alert(1)</script>' }],
      search: {
        query: 'cat',
        mode: 'future',
        case_sensitive: 'false',
        left_context: -1,
        right_context: 0,
      },
      future: { nested: [1, 2] },
    };
    const before = JSON.stringify(original);
    const { request, issues } = decodeAnalysisRequest('concordance', original);
    expect(request.inputs[0]).toEqual({ ...input, tokenizer: null });
    expect(request.search).toEqual({ ...emptyConcordance.search, query: 'cat', right_context: 0 });
    expect(issues.map((i) => i.path)).toEqual([
      'future',
      'inputs[0].extra',
      'inputs[0].tokenizer',
      'search.mode',
      'search.case_sensitive',
      'search.left_context',
    ]);
    expect(issues.find((i) => i.path === 'future')?.value).toEqual(original.future);
    expect(JSON.stringify(original)).toBe(before);
    expect(matchesAnalysisRequest('concordance', request, original)).toBe(false);
    expect(matchesAnalysisRequest('concordance', request, request)).toBe(true);
  });
  it('omits malformed and excess inputs while retaining usable input order', () => {
    const { request, issues } = decodeAnalysisRequest('frequency', {
      inputs: [null, input, 4, { ...input, column: 'other' }, input],
    });
    expect(request.inputs.map((i) => i.column)).toEqual(['text', 'other']);
    expect(issues.map((i) => i.path)).toEqual(['inputs[0]', 'inputs[2]', 'inputs[4]']);
    expect(request.inputs[0]?.tokenizer).toBe('future-model');
  });
  it.each([false, 1, 'saved', []])('handles malformed root %j', (value) => {
    const decoded = decodeAnalysisRequest('quotation', value);
    expect(decoded.request.input.column).toBe('');
    expect(decoded.issues[0]).toMatchObject({ path: '(request)', value });
  });
  it('defaults missing optional settings without warning and keeps missing input unselected', () => {
    expect(decodeAnalysisRequest('concordance', { search: { query: 'cat' } })).toEqual({
      request: { ...emptyConcordance, search: { ...emptyConcordance.search, query: 'cat' } },
      issues: [],
    });
    expect(decodeAnalysisRequest('quotation', null).issues).toEqual([]);
  });
  it('handles malformed containers independently and does not coerce scalar values', () => {
    const decoded = decodeAnalysisRequest('concordance', {
      inputs: 'Corpus',
      search: { query: 1, regex: 1, left_context: '10', right_context: 51 },
    });
    expect(decoded.request).toEqual(emptyConcordance);
    expect(decoded.issues).toHaveLength(5);
    expect(
      decodeAnalysisRequest('quotation', { input: { source: [], column: 'valid' } }).request.input
        .column,
    ).toBe('valid');
  });
});

it('does not substitute a schema or retain unusable input slots', () => {
  const decoded = decodeAnalysisRequest('frequency', {
    inputs: [{ source: { name: 'Corpus' }, column: 'text' }, input],
  });
  expect(decoded.request.inputs).toEqual([input]);
  expect(decoded.issues[0]?.path).toBe('inputs[0]');
});

it('distinguishes literal dotted keys from nested paths', () => {
  const decoded = decodeAnalysisRequest('concordance', {
    'search.mode': true,
    search: { mode: 'future' },
  });
  expect(decoded.issues.map((issue) => issue.path)).toEqual(['["search.mode"]', 'search.mode']);
});

it('ignores retained tokenizer choices for Text Concordance but compares them in Tokens mode', () => {
  const request = {
    ...emptyConcordance,
    inputs: [
      { source: { schema: 'data', name: 'corpus' }, column: 'text', tokenizer: 'plain_words' },
    ],
  };
  const captured = {
    ...request,
    inputs: request.inputs.map((input) => ({ ...input, tokenizer: null })),
  };
  expect(matchesAnalysisRequest('concordance', captured, request)).toBe(true);
  expect(
    matchesAnalysisRequest(
      'concordance',
      { ...captured, search: { ...captured.search, mode: 'tokens' } },
      { ...request, search: { ...request.search, mode: 'tokens' } },
    ),
  ).toBe(false);
});
