// Accept commas and newlines so pasted grouped stop-word lists survive a round
// trip through any analysis editor.
const STOPWORD_SEPARATOR_RE = /[,\n\r]+/;

/** Normalizes editable stop-word text with stable, lower-case deduplication. */
export function parseStopWordsText(text: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];

  text
    .split(STOPWORD_SEPARATOR_RE)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean)
    .forEach((word) => {
      if (seen.has(word)) return;
      seen.add(word);
      words.push(word);
    });

  return words;
}

/** Formats normalized stop words for comma-separated editors. */
export function formatStopWords(words: string[]): string {
  return words.join(', ');
}

/** Appends default stop words to editable text without adding duplicates. */
export function mergeStopWordsText(existingText: string, appendedWords: string[]): string[] {
  return parseStopWordsText(formatStopWords([existingText, formatStopWords(appendedWords)]));
}

/**
 * Puts a right-clicked word at the front of a stop-word list, so the newest
 * words show first. Returns the same array when the word is already listed.
 * Used by: Topic Modelling's word cloud right-click (Frequency does the same
 * in its own text-based flow).
 */
export function addStopWordFirst(words: string[], word: string): string[] {
  const normalized = word.trim().toLowerCase();
  if (!normalized || words.some((existing) => existing.toLowerCase() === normalized)) return words;
  return [normalized, ...words];
}

/** Sorts stop words alphabetically, as Frequency's Sort button does. */
export function sortStopWords(words: string[]): string[] {
  return words.toSorted((a, b) => a.localeCompare(b));
}

/** How many hidden words the preview line names before giving the count of the rest. */
const STOP_WORDS_PREVIEW_COUNT = 8;

/** "the, and, of … and 12 more": the line under a folded stop-word list. */
export function stopWordsPreview(words: readonly string[]): string {
  return words.length > STOP_WORDS_PREVIEW_COUNT
    ? `${words.slice(0, STOP_WORDS_PREVIEW_COUNT).join(', ')} and ${String(words.length - STOP_WORDS_PREVIEW_COUNT)} more`
    : words.join(', ');
}
