import { afterEach, expect, it, vi } from 'vitest';
import {
  getAnnotationResult,
  getConcordanceResult,
  getFrequencyResult,
  getPlotResult,
  getQuotationResult,
  getTopicResult,
} from './api';

afterEach(() => vi.unstubAllGlobals());

const readers = [
  { kind: 'frequency', read: getFrequencyResult },
  { kind: 'concordance', read: getConcordanceResult },
  { kind: 'quotation', read: getQuotationResult },
  {
    kind: 'trends',
    read: (base: string, id: string) => getPlotResult(base, id, 'trends'),
  },
  { kind: 'topic-modeling', read: getTopicResult },
  { kind: 'annotation', read: getAnnotationResult },
];

it.each(readers)('accepts a retained $kind analysis without output', async ({ kind, read }) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ kind, result: null })));
  await expect(read('http://test', 'saved')).resolves.toBeNull();
});

it.each(readers)('still rejects unsupported $kind output', async ({ kind, read }) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ kind, result: { version: 99, payload: {} } })),
  );
  await expect(read('http://test', 'saved')).rejects.toThrow(/unsupported|not supported/i);
});

it.each(readers)(
  'does not treat missing or wrong-kind $kind output as Clear',
  async ({ kind, read }) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ kind }))
      .mockResolvedValueOnce(Response.json({ kind: 'wrong-kind', result: null }));
    vi.stubGlobal('fetch', fetch);
    await expect(read('http://test', 'saved')).rejects.toThrow();
    await expect(read('http://test', 'saved')).rejects.toThrow();
  },
);

it('accepts a successful zero-match result as saved output', async () => {
  const result = { version: 1, payload: { corpora: [] }, finished_at: '' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ kind: 'frequency', result })));
  expect((await getFrequencyResult('http://test', 'saved'))?.result).toEqual(result);
});

it.each([null, {}, { corpora: [null] }, { corpora: [{ source: null }] }])(
  'rejects malformed source descriptors before they reach the Frequency request panel: %j',
  async (result) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            kind: 'frequency',
            request: null,
            result: { version: 1, payload: result, finished_at: '' },
          }),
        ),
      ),
    );
    await expect(getFrequencyResult('http://test', 'saved')).rejects.toThrow(
      'source descriptors are invalid',
    );
  },
);
