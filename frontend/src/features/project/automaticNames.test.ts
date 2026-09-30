import { expect, it } from 'vitest';
import { suggestColumnName, suggestDataBlockName, suggestDataBlockNames } from './automaticNames';

it('bounds source prefixes, preserves Unicode and never includes execution parameters', () => {
  for (const [sources, expected] of [
    [[], 'data_flt_1'],
    [['---'], 'data_flt_1'],
    [['  Speech / texts! '], 'Speech_texts_flt_1'],
    [['abcdefghijklmnop_more_flt_1'], 'abcdefghijklmnop_flt_1'],
    [['中文研究资料一二三四五六七八九十末'], '中文研究资料一二三四五六七八九十_flt_1'],
    [['speechA-long', 'speechB-long', 'ignored'], 'speechA_speechB_flt_1'],
  ] as const) {
    expect(suggestDataBlockName(sources, 'flt', [])).toBe(expected);
  }
});

it('uses the first free suffix and reserves all outputs in a publication', () => {
  const outputs = [
    { sources: ['abcdefghijklmnop_A'], operation: 'tm' as const },
    { sources: ['abcdefghijklmnop_B'], operation: 'tm' as const },
  ];
  expect(
    suggestDataBlockNames(outputs, ['ABCDEFGHIJKLMNOP_TM_1', 'abcdefghijklmnop_tm_3']).map(
      ({ name }) => name,
    ),
  ).toEqual(['abcdefghijklmnop_tm_2', 'abcdefghijklmnop_tm_4']);
  expect(suggestDataBlockName(['É'], 'sw', ['é_sw_1'])).toBe('É_sw_1');
});

it('keeps column suggestions short without colliding with existing identifiers', () => {
  expect(suggestColumnName([])).toBe('col');
  expect(suggestColumnName(['COL', 'col_3', 'CONC_left_context'])).toBe('col_2');
  expect(suggestColumnName(['col', 'col_2', 'col_3'])).toBe('col_4');
});
