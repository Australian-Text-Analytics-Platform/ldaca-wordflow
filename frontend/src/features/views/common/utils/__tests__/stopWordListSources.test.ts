import { describe, expect, it } from 'vitest';

import type { TabResource, TabSettings } from '@/api';
import { buildStopWordListSources } from '../stopWordListSources';

const tab = (id: string, name: string, settings: TabSettings): TabResource => ({
  availability: 'available',
  id,
  name,
  kind: settings.kind,
  settings,
  created_at: '2026-09-24T00:00:00Z',
  modified_at: '2026-09-24T00:00:00Z',
  revision: 1,
});

const frequency = (words: string[]): TabSettings => ({
  kind: 'token_frequency',
  stop_words: { words },
});

const topics = (words: string[]): TabSettings => ({
  kind: 'topic_modeling',
  stop_words: { words },
  projection_selection: null,
  words_per_topic: 15,
});

describe('buildStopWordListSources', () => {
  it('offers other Frequency and Topic Modeling tabs with saved words', () => {
    const sources = buildStopWordListSources(
      [
        tab('current', 'Analysis 1', frequency(['own'])),
        tab('topics-1', 'Analysis 1', topics(['staff', 'university'])),
        tab('freq-2', 'Analysis 2', frequency(['the'])),
      ],
      'current',
    );

    expect(sources).toEqual([
      { tabId: 'freq-2', label: 'Frequency · 2', words: ['the'] },
      { tabId: 'topics-1', label: 'Topic Modeling · 1', words: ['staff', 'university'] },
    ]);
  });

  it('skips empty lists, tools without stop words, and unavailable tabs', () => {
    const sources = buildStopWordListSources(
      [
        tab('empty', 'Analysis 3', frequency([])),
        tab('concordance', 'Analysis 1', { kind: 'concordance' }),
        {
          availability: 'unavailable',
          id: 'gone',
        } as TabResource,
      ],
      'current',
    );

    expect(sources).toEqual([]);
  });
});
