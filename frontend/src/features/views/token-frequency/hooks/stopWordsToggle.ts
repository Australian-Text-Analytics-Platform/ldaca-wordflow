/**
 * Tab setting that remembers whether the stop words filter is enabled.
 * Stored with the other tab presentation settings (like the token limit) so it
 * survives switching to another analysis tool, reloads, and new runs.
 */
export const STOP_WORDS_ENABLED_SETTING = 'tokenFrequency.stopWordsEnabled';

/**
 * Reads the stop words toggle from a tab's settings. Missing or malformed
 * values mean disabled.
 * Used by: TokenFrequencyFeature.
 */
export const readStopWordsEnabled = (settings: Readonly<Record<string, string>>): boolean =>
  settings[STOP_WORDS_ENABLED_SETTING] === 'true';

interface StopWordRightClick {
  enabled: boolean;
  enable: () => void;
  addStopWord: (token: string) => void;
}

/**
 * Adds a right-clicked token to the stop words, switching the filter on first
 * when it is off so the right-click is never silently ignored.
 * Used by: TokenFrequencyFeature for word cloud and token list right-clicks.
 */
export const addStopWordEnablingFilter = (
  { enabled, enable, addStopWord }: StopWordRightClick,
  token: string,
): void => {
  if (!enabled) enable();
  addStopWord(token);
};
