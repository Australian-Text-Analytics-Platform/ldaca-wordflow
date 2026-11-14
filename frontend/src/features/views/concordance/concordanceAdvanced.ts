/**
 * Concordance's advanced settings: the search mode (Tokens, with a tokeniser
 * per Data Block), Ignore punctuation, and, in the results, the Combined view
 * of two Data Blocks. Basic searches the text as written, with punctuation
 * ignored, and keeps the results of two Data Blocks separated (Chao).
 */
export const BASIC_CONCORDANCE_SEARCH_MODE = 'regex' as const;
export const BASIC_CONCORDANCE_IGNORE_PUNCTUATION = true;

/** Whether a saved Concordance request used an advanced setting. */
export function concordanceRunUsedAdvanced(request: unknown): boolean {
  if (!request || typeof request !== 'object') return false;
  const fields = request as { search_mode?: unknown; ignore_punctuation?: unknown };
  return fields.search_mode === 'tokens' || fields.ignore_punctuation === false;
}
