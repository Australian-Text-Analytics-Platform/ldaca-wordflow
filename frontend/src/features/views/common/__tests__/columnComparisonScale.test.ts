import { describe, expect, it } from 'vitest';

import {
  type ConfusionCount,
  calculateCohensKappa,
  calculateIntercoderReliability,
  calculateKrippendorffsAlpha,
  calculateOrdinalAlpha,
  calculateWeightedKappa,
  formatIntercoderReliability,
  intercoderReliabilityLabel,
  scaleDistance,
} from '../columnComparisonModel';

const ORDER = { levels: ['Low', 'Medium', 'High'], outside: [] };
const WITH_NA = { levels: ['Low', 'Medium', 'High'], outside: ['Not applicable'] };

// Reference values from scikit-learn's cohen_kappa_score(weights='quadratic')
// and the krippendorff package (level_of_measurement='ordinal'), same data.
const ROWS: ConfusionCount[] = [
  { reference: 'Low', comparison: 'Low', count: 5 },
  { reference: 'Low', comparison: 'Medium', count: 2 },
  { reference: 'Medium', comparison: 'Medium', count: 6 },
  { reference: 'Medium', comparison: 'High', count: 1 },
  { reference: 'High', comparison: 'High', count: 4 },
  { reference: 'High', comparison: 'Low', count: 1 },
  { reference: 'Medium', comparison: 'Low', count: 1 },
];

const value = (result: number | null): number => {
  if (result === null) throw new Error('Expected a value');
  return result;
};

describe('ordered-scale reliability', () => {
  it('matches scikit-learn for quadratic-weighted Kappa', () => {
    expect(calculateWeightedKappa(ROWS, ORDER)).toBeCloseTo(0.6610169491525424, 12);
  });

  it('matches the krippendorff package for ordinal Alpha', () => {
    expect(calculateOrdinalAlpha(ROWS, ORDER)).toBeCloseTo(0.6608333333333334, 12);
  });

  it('keeps the nominal statistics when there is no scale', () => {
    expect(calculateIntercoderReliability(ROWS, 'cohens_kappa')).toBeCloseTo(
      0.6183206106870229,
      12,
    );
    expect(calculateIntercoderReliability(ROWS, 'krippendorffs_alpha')).toBeCloseTo(
      0.6278625954198473,
      12,
    );
    expect(calculateIntercoderReliability(ROWS, 'cohens_kappa', ORDER)).toBeCloseTo(0.661017, 6);
    expect(calculateIntercoderReliability(ROWS, 'percent_agreement', ORDER)).toBeCloseTo(15 / 20);
  });

  it('counts a far miss as a larger disagreement than a near one', () => {
    const near: ConfusionCount[] = [
      { reference: 'Low', comparison: 'Low', count: 4 },
      { reference: 'High', comparison: 'High', count: 4 },
      { reference: 'Medium', comparison: 'Medium', count: 4 },
      { reference: 'Low', comparison: 'Medium', count: 2 },
    ];
    const far = near.map((row) =>
      row.reference === 'Low' && row.comparison === 'Medium' ? { ...row, comparison: 'High' } : row,
    );
    expect(value(calculateWeightedKappa(near, ORDER))).toBeGreaterThan(
      value(calculateWeightedKappa(far, ORDER)),
    );
    expect(value(calculateOrdinalAlpha(near, ORDER))).toBeGreaterThan(
      value(calculateOrdinalAlpha(far, ORDER)),
    );
  });

  it('equals the nominal statistics on a two-level scale', () => {
    const rows: ConfusionCount[] = [
      { reference: 'No', comparison: 'No', count: 7 },
      { reference: 'No', comparison: 'Yes', count: 2 },
      { reference: 'Yes', comparison: 'No', count: 1 },
      { reference: 'Yes', comparison: 'Yes', count: 5 },
    ];
    expect(calculateWeightedKappa(rows, { levels: ['No', 'Yes'], outside: [] })).toBeCloseTo(
      value(calculateCohensKappa(rows)),
      12,
    );
    expect(calculateOrdinalAlpha(rows, { levels: ['No', 'Yes'], outside: [] })).toBeCloseTo(
      value(calculateKrippendorffsAlpha(rows)),
      12,
    );
  });

  it('leaves out labels outside the scale and has no value without pairs', () => {
    const withStray = [...ROWS, { reference: 'Sarcasm', comparison: 'Low', count: 9 }];
    expect(calculateWeightedKappa(withStray, ORDER)).toBeCloseTo(0.6610169491525424, 12);
    expect(calculateOrdinalAlpha([], ORDER)).toBeNull();
    expect(calculateWeightedKappa([], ORDER)).toBeNull();
    expect(calculateWeightedKappa(ROWS, { levels: ['Low'], outside: [] })).toBeNull();
  });

  it('counts Not applicable against a level as much as the two farthest levels', () => {
    // Reference: a NumPy weighted Kappa with the same weight table, and the
    // krippendorff package with the same distance (ordinal between levels,
    // scaled by the widest; 1 against Not applicable).
    const rows: ConfusionCount[] = [
      ...ROWS,
      { reference: 'Not applicable', comparison: 'Not applicable', count: 3 },
      { reference: 'Not applicable', comparison: 'High', count: 1 },
      { reference: 'Low', comparison: 'Not applicable', count: 1 },
    ];
    expect(calculateWeightedKappa(rows, WITH_NA)).toBeCloseTo(0.66996699669967, 12);
    expect(calculateOrdinalAlpha(rows, WITH_NA)).toBeCloseTo(0.6715289476928135, 12);

    // Not applicable is not near any level: it costs more than a near miss.
    const base: ConfusionCount[] = [
      { reference: 'Low', comparison: 'Low', count: 4 },
      { reference: 'Medium', comparison: 'Medium', count: 4 },
      { reference: 'High', comparison: 'High', count: 4 },
      { reference: 'Not applicable', comparison: 'Not applicable', count: 4 },
    ];
    const nearMiss = [...base, { reference: 'Low', comparison: 'Medium', count: 2 }];
    const notApplicable = [
      ...base,
      { reference: 'Not applicable', comparison: 'Medium', count: 2 },
    ];
    expect(value(calculateWeightedKappa(nearMiss, WITH_NA))).toBeGreaterThan(
      value(calculateWeightedKappa(notApplicable, WITH_NA)),
    );
    expect(value(calculateOrdinalAlpha(nearMiss, WITH_NA))).toBeGreaterThan(
      value(calculateOrdinalAlpha(notApplicable, WITH_NA)),
    );
  });

  it('measures how far apart two codes are on the scale, for shading', () => {
    expect(scaleDistance(WITH_NA, 'Low', 'Low')).toBe(0);
    expect(scaleDistance(WITH_NA, 'Low', 'Medium')).toBe(0.5);
    expect(scaleDistance(WITH_NA, 'High', 'Low')).toBe(1);
    expect(scaleDistance(WITH_NA, 'Not applicable', 'Medium')).toBe(1);
    expect(scaleDistance(WITH_NA, 'Not applicable', 'Not applicable')).toBe(0);
    expect(scaleDistance(WITH_NA, 'Sarcasm', 'Low')).toBeNull();
  });

  it('names and marks the scale statistics', () => {
    expect(intercoderReliabilityLabel('cohens_kappa', true)).toBe('Cohen’s Kappa (weighted)');
    expect(intercoderReliabilityLabel('krippendorffs_alpha', true)).toBe(
      'Krippendorff’s Alpha (ordinal)',
    );
    expect(intercoderReliabilityLabel('percent_agreement', true)).toBe('Percent Agreement');
    expect(intercoderReliabilityLabel('cohens_kappa')).toBe('Cohen’s Kappa');
    expect(formatIntercoderReliability(0.5, 'cohens_kappa', true)).toBe('κw 0.500');
    expect(formatIntercoderReliability(0.5, 'krippendorffs_alpha', true)).toBe('αo 0.500');
    expect(formatIntercoderReliability(0.5, 'cohens_kappa')).toBe('κ 0.500');
  });
});
