import { expect, it, vi } from 'vitest';
import { prepareStopwords } from '@/features/project/api';
import { frequencySettings } from '../../token-frequency/frequencySettings';

it('ignores legacy stopword arrays instead of creating an alternative word store', () => {
  expect(frequencySettings({ stopwords: ['cat'], stopwordsEnabled: true })).toMatchObject({
    stopwordSource: null,
    stopwordsEnabled: false,
  });
});

it('sends only stopword fields when corpus inputs also contain execution settings', async () => {
  const input = {
    source: { schema: 'data', name: 'Corpus' },
    column: 'text',
    tokenizer: 'native:plain_words_en',
  };
  const selected = {
    source: { schema: 'data', name: 'Corpus_stopwords' },
    column: 'word',
  };
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(selected));
  try {
    expect(await prepareStopwords('http://project', null, [input])).toEqual(selected);
    const init = fetch.mock.calls[0]?.[1];
    expect(JSON.parse(init?.body as string)).toEqual({
      selected: null,
      inputs: [{ source: input.source, column: 'text' }],
    });
  } finally {
    fetch.mockRestore();
  }
});
