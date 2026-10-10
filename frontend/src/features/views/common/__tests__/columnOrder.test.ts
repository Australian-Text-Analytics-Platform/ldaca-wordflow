import { describe, expect, it } from 'vitest';
import { moveColumn, orderColumns, readColumnLayout, tabColumnLayout } from '../columnOrder';

describe('column order (issue 373)', () => {
  it('keeps the saved order and places new columns after their default neighbour', () => {
    expect(orderColumns(['left', 'match', 'right', 'L1', 'R1'], ['R1', 'left', 'match'])).toEqual([
      'R1',
      'left',
      'match',
      'right',
      'L1',
    ]);
    // A newly shown column joins after its default neighbour (party after match);
    // a saved name no longer shown is dropped.
    expect(
      orderColumns(['left', 'match', 'party', 'year'], ['match', 'left', 'year', 'gone']),
    ).toEqual(['match', 'party', 'left', 'year']);
    expect(orderColumns(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  it('moves a column to the place of the one it is dropped on', () => {
    expect(moveColumn(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveColumn(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
    expect(moveColumn(['a', 'b'], 'a', 'missing')).toEqual(['a', 'b']);
  });

  it('saves shown columns and order as one tab setting, skipping unchanged writes', () => {
    const writes: [string, string][] = [];
    const settings: Record<string, string> = {};
    const setSetting = (key: string, value: string) => {
      writes.push([key, value]);
      settings[key] = value;
    };
    tabColumnLayout(settings, setSetting, 'k').setShown(['party']);
    tabColumnLayout(settings, setSetting, 'k').setOrder(['party', 'left']);
    tabColumnLayout(settings, setSetting, 'k').setShown((previous) => previous);
    expect(readColumnLayout(settings.k)).toEqual({ shown: ['party'], order: ['party', 'left'] });
    expect(writes).toHaveLength(2);
    expect(readColumnLayout('not json')).toEqual({ shown: [], order: [] });
  });
});
