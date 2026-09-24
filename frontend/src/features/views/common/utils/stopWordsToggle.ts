/**
 * Tab settings that remember whether each tool's stop words filter is enabled.
 * Stored with the other tab presentation settings (like the token limit) so the
 * toggle survives switching to another analysis tool, reloads, and new runs.
 */
export const STOP_WORDS_ENABLED_SETTINGS = {
  tokenFrequency: 'tokenFrequency.stopWordsEnabled',
  topicModeling: 'topicModeling.stopWordsEnabled',
} as const;

type StopWordsEnabledSetting =
  (typeof STOP_WORDS_ENABLED_SETTINGS)[keyof typeof STOP_WORDS_ENABLED_SETTINGS];

/**
 * Reads a stop words toggle from a tab's settings. Missing or malformed values
 * mean disabled.
 * Used by: TokenFrequencyFeature and TopicModelingFeature.
 */
export const readStopWordsEnabled = (
  settings: Readonly<Record<string, string>>,
  setting: StopWordsEnabledSetting,
): boolean => settings[setting] === 'true';

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
