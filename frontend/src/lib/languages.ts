import type { TokenizerModelInfo } from '@/api';

/** Curated language list for UI selectors. */
export type LanguageModelOption = TokenizerModelInfo;

/**
 * Normalizes stored/user language strings to the two-letter codes used by UI controls.
 * Used by: language detection, tokenizer-model partitioning, and direct normalization tests.
 */
export function normaliseIso6391LanguageCode(code: string | null | undefined): string | null {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim().toLowerCase();
  if (!trimmed) return null;
  const primary = trimmed.split(/[-_]/, 1)[0];
  return primary && /^[a-z]{2}$/.test(primary) ? primary : null;
}

/** A model whose languages include this works for any language written with spaces (issue 339). */
export const ANY_SPACED_LANGUAGE = '*';

/**
 * Languages written without spaces between words: a spaces-and-punctuation
 * tokeniser does not find their words, so it is not recommended for them.
 */
const LANGUAGES_WITHOUT_SPACES = new Set(['zh', 'ja', 'ko', 'th', 'lo', 'km', 'my', 'bo']);

/** Splits tokenizer models into language-matching recommendations and secondary choices. */
/**
 * Used by: src/features/views/common/components/TokenizerModelSelector.tsx, src/lib/__tests__/languages.test.ts.
 * Flow: normalize the language code, return all models as secondary when unknown, otherwise
 * recommend the models made for that language, plus any-spaced-language models for languages
 * written with spaces. Catalogue order is kept, so the first recommendation is the default.
 */
export function partitionTokenizerModelsForLanguage(
  models: readonly LanguageModelOption[],
  code: string | null | undefined,
): { recommended: LanguageModelOption[]; other: LanguageModelOption[] } {
  const normalised = normaliseIso6391LanguageCode(code);
  if (!normalised) {
    return { recommended: [], other: [...models] };
  }
  const fits = (option: LanguageModelOption) =>
    option.languages.includes(normalised) ||
    (option.languages.includes(ANY_SPACED_LANGUAGE) && !LANGUAGES_WITHOUT_SPACES.has(normalised));
  const recommended = models.filter(fits);
  const other = models.filter((option) => !fits(option));
  return { recommended, other };
}
