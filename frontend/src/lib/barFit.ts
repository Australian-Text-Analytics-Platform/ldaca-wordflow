/**
 * How many periods bars can show at once (issues 225, 226). Side-by-side bars
 * need at least `SIDE_BY_SIDE_MIN_BAR_PX` per bar, so a period needs that
 * times its groups; stacked bars need `STACKED_MIN_BAR_PX` per period. When the
 * periods don't all fit, the zoom is capped to those that do. The chart type
 * (Bars or Stacked bars) is the user's choice and never switches on its own.
 */

const SIDE_BY_SIDE_MIN_BAR_PX = 6;
const STACKED_MIN_BAR_PX = 4;

export interface BarFit {
  /** Most periods that can show at once, or null when all of them fit. */
  maxVisiblePoints: number | null;
  /** The widest zoom window, as a percentage of the axis (100 when all fit). */
  maxSpanPercent: number;
}

export function fitBars({
  plotWidth,
  pointCount,
  seriesCount,
  stacked,
}: {
  /** Width of the plotting area in CSS pixels. */
  plotWidth: number;
  /** Periods on the axis. */
  pointCount: number;
  /** Bar series, drawn side by side unless stacked. */
  seriesCount: number;
  stacked: boolean;
}): BarFit {
  const width = Math.max(1, plotWidth);
  const points = Math.max(0, Math.floor(pointCount));
  const perPoint = stacked
    ? STACKED_MIN_BAR_PX
    : SIDE_BY_SIDE_MIN_BAR_PX * Math.max(1, seriesCount);
  const fitting = Math.max(1, Math.floor(width / perPoint));
  const capped = points > fitting;
  return {
    maxVisiblePoints: capped ? fitting : null,
    maxSpanPercent: capped ? (fitting / points) * 100 : 100,
  };
}
