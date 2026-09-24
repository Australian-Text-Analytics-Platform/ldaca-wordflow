import type { TabResource } from '@/api';

/** Another tab's saved stop-word list offered for copying. */
export interface StopWordListSource {
  tabId: string;
  /** "<Tool> · <Tab name>", e.g. "Frequency · Analysis 1". */
  label: string;
  words: string[];
}

const STOP_WORD_TOOL_LABELS = {
  token_frequency: 'Frequency',
  topic_modeling: 'Topic Modeling',
} as const;

/**
 * Lists the other Frequency and Topic Modeling tabs whose saved stop-word list
 * is non-empty, so a tab can copy one into its own list. Each tab's list is
 * already persisted with the tab, so a list appears once its tab has words,
 * disappears when the tab is deleted or its list cleared, and follows tab
 * renames; there is no separate list store.
 * Used by: useStopWordListSources for the shared stop-words dropdown.
 */
export const buildStopWordListSources = (
  tabs: readonly TabResource[],
  currentTabId: string,
): StopWordListSource[] =>
  tabs
    .flatMap((tab) => {
      if (tab.availability !== 'available' || tab.id === currentTabId) return [];
      const { settings } = tab;
      if (settings.kind !== 'token_frequency' && settings.kind !== 'topic_modeling') return [];
      const words = settings.stop_words.words;
      if (words.length === 0) return [];
      return [
        {
          tabId: tab.id,
          label: `${STOP_WORD_TOOL_LABELS[settings.kind]} · ${tab.name}`,
          words,
        },
      ];
    })
    .sort((left, right) => left.label.localeCompare(right.label));
