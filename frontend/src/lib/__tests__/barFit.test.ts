import { describe, expect, it } from 'vitest';

import { fitBars } from '../barFit';

describe('fitBars (issues 225, 226)', () => {
  it('fits side-by-side bars while every bar can be 6 px wide', () => {
    // 20 periods × 5 groups × 6 px = 600 px.
    expect(fitBars({ plotWidth: 600, pointCount: 20, seriesCount: 5, stacked: false })).toEqual({
      maxVisiblePoints: null,
      maxSpanPercent: 100,
    });
  });

  it('caps side-by-side bars to the periods whose groups fit', () => {
    // 600 px / (5 groups × 6 px) = 20 periods of 40, so half the axis.
    const fit = fitBars({ plotWidth: 600, pointCount: 40, seriesCount: 5, stacked: false });
    expect(fit.maxVisiblePoints).toBe(20);
    expect(fit.maxSpanPercent).toBeCloseTo(50);
  });

  it('lets stacked bars show more periods: 4 px each, whatever the groups', () => {
    expect(
      fitBars({ plotWidth: 600, pointCount: 40, seriesCount: 5, stacked: true }).maxVisiblePoints,
    ).toBeNull();
    const fit = fitBars({ plotWidth: 400, pointCount: 250, seriesCount: 3, stacked: true });
    expect(fit.maxVisiblePoints).toBe(100);
    expect(fit.maxSpanPercent).toBeCloseTo(40);
  });
});
