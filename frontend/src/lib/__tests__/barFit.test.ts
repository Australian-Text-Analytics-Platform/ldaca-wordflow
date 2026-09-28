import { describe, expect, it } from 'vitest';

import { fitBars } from '../barFit';

describe('fitBars (issue 225)', () => {
  it('keeps bars side by side while every bar is at least 6 px wide', () => {
    // 20 periods × 5 groups × 6 px = 600 px.
    expect(
      fitBars({ plotWidth: 600, pointCount: 20, seriesCount: 5, visiblePercent: 100 }),
    ).toEqual({
      stacked: false,
      maxVisiblePoints: null,
      maxSpanPercent: 100,
    });
  });

  it('stacks when the groups no longer fit side by side, and unstacks when zoomed in', () => {
    expect(
      fitBars({ plotWidth: 600, pointCount: 40, seriesCount: 5, visiblePercent: 100 }).stacked,
    ).toBe(true);
    expect(
      fitBars({ plotWidth: 600, pointCount: 40, seriesCount: 5, visiblePercent: 50 }).stacked,
    ).toBe(false);
  });

  it('never stacks a single series', () => {
    expect(
      fitBars({ plotWidth: 100, pointCount: 25, seriesCount: 1, visiblePercent: 100 }).stacked,
    ).toBe(false);
  });

  it('caps the zoom when even stacked bars would be under 4 px', () => {
    // 400 px fits 100 stacked bars; 250 periods are capped to 40% of the axis.
    const fit = fitBars({ plotWidth: 400, pointCount: 250, seriesCount: 3, visiblePercent: 100 });
    expect(fit.maxVisiblePoints).toBe(100);
    expect(fit.maxSpanPercent).toBeCloseTo(40);
    expect(fit.stacked).toBe(true);
  });
});
