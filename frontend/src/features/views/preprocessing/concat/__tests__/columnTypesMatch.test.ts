import { Dictionary, Field, Float64, Int64, List, Uint32, Utf8 } from 'apache-arrow';
import { describe, expect, it } from 'vitest';

import { columnTypesMatch } from '../columnTypesMatch';

describe('columnTypesMatch (issue 276)', () => {
  it('ignores the dictionary id that depends on column position', () => {
    // Making an earlier column a category shifts later columns' ids.
    const first = new Dictionary(new Utf8(), new Uint32(), 0);
    const shifted = new Dictionary(new Utf8(), new Uint32(), 1);
    expect(columnTypesMatch(first, shifted)).toBe(true);
  });

  it('still tells a category from text, and different categories apart', () => {
    const category = new Dictionary(new Utf8(), new Uint32(), 0);
    expect(columnTypesMatch(category, new Utf8())).toBe(false);
    expect(columnTypesMatch(new Utf8(), category)).toBe(false);
    expect(columnTypesMatch(category, new Dictionary(new Utf8(), new Uint32(), 0, true))).toBe(
      false,
    );
    expect(columnTypesMatch(category, new Dictionary(new Int64(), new Uint32(), 0))).toBe(false);
  });

  it('compares plain and nested types as before', () => {
    expect(columnTypesMatch(new Int64(), new Int64())).toBe(true);
    expect(columnTypesMatch(new Int64(), new Float64())).toBe(false);
    const listOf = (id: number) =>
      new List(new Field('item', new Dictionary(new Utf8(), new Uint32(), id)));
    expect(columnTypesMatch(listOf(0), listOf(4))).toBe(true);
    expect(columnTypesMatch(listOf(0), new List(new Field('item', new Utf8())))).toBe(false);
  });
});
