import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import {
  decodeAnalysisRequest,
  defaultAnalysisRequest,
  emptyConcordance,
  matchesAnalysisRequest,
  useRequestRestoration,
} from './analysisRequest';
describe('saved request compatibility', () => {
  it('keeps unsupported provenance inspectable and requires a local reset', () => {
    const original = { inputs: [{ column: 42 }], future: { nested: [1, 2] } };
    const analysis = {
      request: original,
      request_status: { status: 'unsupported' as const, reason: 'Unknown field future' },
    };
    const before = JSON.stringify(original);
    const { result } = renderHook(() => useRequestRestoration('frequency', analysis));
    expect(result.current.blocked).toBe(true);
    expect(result.current.issues[0]?.value).toBe(original);
    const change = (request: unknown) => {
      expect(request).toEqual({ inputs: [] });
    };
    act(() => result.current.reset(change));
    expect(result.current.blocked).toBe(false);
    expect(JSON.stringify(original)).toBe(before);
    expect(result.current.issues).toHaveLength(1);
  });
  it('retains recognized missing inputs without treating live availability as format compatibility', () => {
    const request = {
      inputs: [
        { source: { schema: 'data', name: 'missing' }, column: 'text', tokenizer: 'missing-model' },
      ],
    };
    const status = {
      status: 'supported' as const,
      request: { kind: 'frequency' as const, request },
    };
    expect(decodeAnalysisRequest('frequency', status)).toEqual({ request, issues: [] });
    expect(matchesAnalysisRequest('frequency', request, status)).toBe(true);
  });
  it('rejects kind mismatch and does not match unsupported requests', () => {
    expect(
      decodeAnalysisRequest('quotation', {
        status: 'supported',
        request: { kind: 'frequency', request: { inputs: [] } },
      }).issues,
    ).toHaveLength(1);
    expect(
      matchesAnalysisRequest(
        'frequency',
        { inputs: [] },
        { status: 'unsupported', reason: 'unknown' },
      ),
    ).toBe(false);
    const request = defaultAnalysisRequest('frequency');
    request.inputs.push({ source: { name: 'x' }, column: 'text', tokenizer: 't' });
    expect(defaultAnalysisRequest('frequency').inputs).toEqual([]);
  });
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
