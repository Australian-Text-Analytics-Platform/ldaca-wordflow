import { describe, expect, it } from 'vitest';

import { readStopWordsEnabled, STOP_WORDS_ENABLED_SETTING } from '../stopWordsToggle';

describe('readStopWordsEnabled', () => {
  it('reads the persisted tab setting', () => {
    expect(readStopWordsEnabled({ [STOP_WORDS_ENABLED_SETTING]: 'true' })).toBe(true);
    expect(readStopWordsEnabled({ [STOP_WORDS_ENABLED_SETTING]: 'false' })).toBe(false);
  });

  it('treats a missing or malformed setting as disabled', () => {
    expect(readStopWordsEnabled({})).toBe(false);
    expect(readStopWordsEnabled({ [STOP_WORDS_ENABLED_SETTING]: 'yes' })).toBe(false);
  });
});
