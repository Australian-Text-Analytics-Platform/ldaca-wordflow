import { describe, expect, it } from 'vitest';

import { createdBlockName } from '../createdBlockName';

describe('createdBlockName (issue 205)', () => {
  it('names the created Data Block for the success toast', () => {
    expect(createdBlockName({ id: 'x', name: 'speeches_2020' })).toBe('speeches_2020');
    expect(createdBlockName(undefined, 'requested')).toBe('requested');
    expect(createdBlockName(null)).toBe('the new Data Block');
  });
});
