/** A Wordflow classic stop-word list offered in the stop-words dropdown. */
export interface WordflowClassicStopwordList {
  /** ISO 639-1 code; also the key into the lazily loaded word data. */
  iso6391: string;
  name: string;
  /** Size of the restored list, shown in the dropdown before it is loaded. */
  wordCount: number;
}

/** Languages covered by Wordflow's classic built-in lists, in display order. */
export const WORDFLOW_CLASSIC_STOPWORD_LISTS: readonly WordflowClassicStopwordList[] = [
  { iso6391: 'zh', name: 'Chinese', wordCount: 746 },
  { iso6391: 'en', name: 'English', wordCount: 231 },
  { iso6391: 'fr', name: 'French', wordCount: 146 },
  { iso6391: 'de', name: 'German', wordCount: 131 },
  { iso6391: 'ja', name: 'Japanese', wordCount: 310 },
  { iso6391: 'ko', name: 'Korean', wordCount: 679 },
  { iso6391: 'es', name: 'Spanish', wordCount: 151 },
];

/**
 * Loads one Wordflow classic stop-word list on demand.
 * Used by: StopWordsLanguageSelect for its "Wordflow classic lists" group.
 */
export async function loadWordflowClassicStopwords(iso6391: string): Promise<string[]> {
  const { WORDFLOW_CLASSIC_STOPWORDS } = await import('./wordflowClassicStopwordsData');
  const words = WORDFLOW_CLASSIC_STOPWORDS[iso6391];
  if (!words) throw new Error(`No Wordflow classic stop-word list for "${iso6391}"`);
  return [...words];
}
