import { describe, expect, it } from 'vitest';

import {
  type CodeCombination,
  type ConfusionCount,
  calculateKrippendorffsAlpha,
  calculateOrdinalAlpha,
  multiCoderAgreement,
} from '../columnComparisonModel';

// Three coders over 31 texts, some coded by only one or two of them. Reference
// values from the krippendorff package on the same data: nominal; ordinal on
// the three levels (Not applicable dropped); and the same distance as Wordflow
// with Not applicable outside the scale (ordinal between levels over the
// widest, 1 against Not applicable).
const COMBINATIONS: CodeCombination[] = [
  { values: ['Low', 'Low', 'Low'], count: 6 },
  { values: ['Medium', 'Medium', 'Medium'], count: 5 },
  { values: ['High', 'High', 'High'], count: 4 },
  { values: ['Not applicable', 'Not applicable', 'Not applicable'], count: 2 },
  { values: ['Low', 'Medium', 'Low'], count: 2 },
  { values: ['Medium', 'High', 'Medium'], count: 2 },
  { values: ['Low', 'High', null], count: 1 },
  { values: ['High', 'Not applicable', 'High'], count: 1 },
  { values: ['Medium', 'Medium', null], count: 3 },
  { values: [null, 'Low', 'Low'], count: 2 },
  { values: ['Low', null, null], count: 2 },
  { values: ['Not applicable', 'Low', 'Not applicable'], count: 1 },
];
const LEVELS = ['Low', 'Medium', 'High'];

describe('multi-coder Krippendorff’s Alpha', () => {
  it('matches the krippendorff package for categories, with texts some coders skipped', () => {
    const agreement = multiCoderAgreement(COMBINATIONS, null);
    expect(agreement.alpha).toBeCloseTo(0.7605814450619923, 12);
    // A text coded by one coder alone has nothing to agree with.
    expect(agreement.pairableTexts).toBe(29);
  });

  it('matches the krippendorff package on an ordered scale', () => {
    expect(multiCoderAgreement(COMBINATIONS, { levels: LEVELS, outside: [] }).alpha).toBeCloseTo(
      0.8179134494755493,
      12,
    );
    expect(
      multiCoderAgreement(COMBINATIONS, { levels: LEVELS, outside: ['Not applicable'] }).alpha,
    ).toBeCloseTo(0.7783234431484892, 12);
  });

  it('builds a symmetric coincidence matrix that shares each text’s weight', () => {
    const { coincidences } = multiCoderAgreement([{ values: ['A', 'A', 'B'], count: 1 }], null);
    const cell = (reference: string, comparison: string) =>
      coincidences.find((row) => row.reference === reference && row.comparison === comparison)
        ?.count ?? 0;
    // Three codes on one text: six ordered pairs, each worth 1/2.
    expect(cell('A', 'A')).toBe(1);
    expect(cell('A', 'B')).toBe(1);
    expect(cell('B', 'A')).toBe(1);
    expect(coincidences.reduce((sum, row) => sum + row.count, 0)).toBe(3);
  });

  it('equals the two-column Alpha with two coders who coded the same texts', () => {
    const pairs: ConfusionCount[] = [
      { reference: 'Low', comparison: 'Low', count: 5 },
      { reference: 'Low', comparison: 'Medium', count: 2 },
      { reference: 'Medium', comparison: 'Medium', count: 6 },
      { reference: 'High', comparison: 'Low', count: 1 },
      { reference: 'High', comparison: 'High', count: 4 },
    ];
    const combinations = pairs.map((row) => ({
      values: [row.reference, row.comparison],
      count: row.count,
    }));
    expect(multiCoderAgreement(combinations, null).alpha).toBeCloseTo(
      calculateKrippendorffsAlpha(pairs) ?? Number.NaN,
      12,
    );
    const scale = { levels: LEVELS, outside: [] };
    expect(multiCoderAgreement(combinations, scale).alpha).toBeCloseTo(
      calculateOrdinalAlpha(pairs, scale) ?? Number.NaN,
      12,
    );
  });

  it('has no value without two coded texts to compare', () => {
    expect(multiCoderAgreement([], null).alpha).toBeNull();
    expect(multiCoderAgreement([{ values: ['A', null, null], count: 9 }], null)).toMatchObject({
      alpha: null,
      pairableTexts: 0,
    });
  });
});
