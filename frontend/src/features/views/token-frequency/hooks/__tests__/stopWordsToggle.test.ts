import { describe, expect, it, vi } from 'vitest';

import {
  addStopWordEnablingFilter,
  readStopWordsEnabled,
  STOP_WORDS_ENABLED_SETTING,
} from '../stopWordsToggle';

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

describe('addStopWordEnablingFilter', () => {
  it('switches the filter on before adding a token when it is off', () => {
    const calls: string[] = [];
    addStopWordEnablingFilter(
      {
        enabled: false,
        enable: () => calls.push('enable'),
        addStopWord: (token) => calls.push(`add:${token}`),
      },
      'university',
    );

    expect(calls).toEqual(['enable', 'add:university']);
  });

  it('only adds the token when the filter is already on', () => {
    const enable = vi.fn();
    const addStopWord = vi.fn();
    addStopWordEnablingFilter({ enabled: true, enable, addStopWord }, 'staff');

    expect(enable).not.toHaveBeenCalled();
    expect(addStopWord).toHaveBeenCalledWith('staff');
  });
});
