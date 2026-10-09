import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('stopword', () => {
  mocks.load();
  return { eng: ['The', 'a', 'INC', ''], fra: ['le', 'the', ' Inc '], jpn: ['の'] };
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('bundled stopwords', () => {
  it('keeps the selector and unsupported choices independent of the list chunk', async () => {
    const { listSupportedStopwordLanguages, loadMergedStopwords } = await import('../stopwords');
    expect(listSupportedStopwordLanguages()).toContainEqual({ iso6391: 'en', name: 'English' });
    expect(await loadMergedStopwords({ languages: ['xx', null] })).toEqual({
      byLanguage: [],
      merged: [],
    });
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('merges regional and three-letter language choices once, case-insensitively', async () => {
    const { loadMergedStopwords } = await import('../stopwords');
    expect(await loadMergedStopwords({ languages: ['en-US', 'eng', 'fr', 'xx'] })).toEqual({
      byLanguage: [
        { language: 'en', words: ['The', 'a', 'INC'] },
        { language: 'fr', words: ['le', 'the', 'Inc'] },
      ],
      merged: ['The', 'a', 'INC', 'le'],
    });
    expect(mocks.load).toHaveBeenCalledOnce();
  });

  it('appends lists and clicked tokens without changing existing spellings', async () => {
    const { mergeStopwords } = await import('../stopwords');
    expect(mergeStopwords('The, a\n Inc', ['the', 'INC', 'le', ' '])).toEqual([
      'The',
      'a',
      'Inc',
      'le',
    ]);
  });
});

it('offers the approved LDaCA lists separately and excludes unproven classic lists', async () => {
  const { listSupportedStopwordLanguages, loadMergedStopwords } = await import('../stopwords');
  const choices = listSupportedStopwordLanguages();
  expect(choices.find((item) => item.iso6391 === 'ldaca:en')?.name).toBe(
    'English (LDaCA provided)',
  );
  expect(choices.some((item) => ['ldaca:de', 'ldaca:zh'].includes(item.iso6391))).toBe(false);
  expect(choices.some((item) => item.iso6391 === 'de')).toBe(true);
  expect(choices.some((item) => item.iso6391 === 'zh')).toBe(true);
  const result = await loadMergedStopwords({ languages: ['ldaca:en', 'ldaca:en', 'ldaca:ja'] });
  expect(result.byLanguage.map((group) => group.words.length)).toEqual([231, 310]);
  expect(mocks.load).not.toHaveBeenCalled();
});
