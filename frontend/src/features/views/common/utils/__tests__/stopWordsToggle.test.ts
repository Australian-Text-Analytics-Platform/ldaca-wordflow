import { describe, expect, it, vi } from 'vitest';

import {
  addStopWordEnablingFilter,
  readStopWordsEnabled,
  STOP_WORDS_ENABLED_SETTINGS,
} from '../stopWordsToggle';

describe('readStopWordsEnabled', () => {
  const { tokenFrequency, topicModeling } = STOP_WORDS_ENABLED_SETTINGS;

  it('reads the persisted tab setting for the given tool', () => {
    expect(readStopWordsEnabled({ [tokenFrequency]: 'true' }, tokenFrequency)).toBe(true);
    expect(readStopWordsEnabled({ [tokenFrequency]: 'false' }, tokenFrequency)).toBe(false);
    expect(readStopWordsEnabled({ [topicModeling]: 'true' }, topicModeling)).toBe(true);
  });

  it('keeps each tool on its own setting', () => {
    expect(readStopWordsEnabled({ [tokenFrequency]: 'true' }, topicModeling)).toBe(false);
  });

  it('treats a missing or malformed setting as disabled', () => {
    expect(readStopWordsEnabled({}, tokenFrequency)).toBe(false);
    expect(readStopWordsEnabled({ [tokenFrequency]: 'yes' }, tokenFrequency)).toBe(false);
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
