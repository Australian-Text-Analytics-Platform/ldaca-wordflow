import { describe, expect, it } from 'vitest';

import { normalizeMetadataColumns } from '../metadataColumnSelection';

describe('normalizeMetadataColumns (issue 108)', () => {
  it('keeps column names exactly, including surrounding whitespace', () => {
    expect(normalizeMetadataColumns([' text', 'text', ' text', '', 'ID'])).toEqual([
      ' text',
      'text',
      'ID',
    ]);
  });
});
