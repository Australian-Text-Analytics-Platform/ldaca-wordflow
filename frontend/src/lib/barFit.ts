/**
 * How bars fit a chart's width (issue 225). Bars sit side by side while each
 * one can be at least `SIDE_BY_SIDE_MIN_BAR_PX` wide; otherwise each period's
 * groups stack into one bar. When even stacked bars would be thinner than
 * `STACKED_MIN_BAR_PX`, the zoom is capped to the periods that fit.
 */

const SIDE_BY_SIDE_MIN_BAR_PX = 6;
const STACKED_MIN_BAR_PX = 4;

export interface BarFit {
  /** Stack each period's groups into one bar. */
  stacked: boolean;
  /** Most periods that can show at once, or null when all of them fit. */
  maxVisiblePoints: number | null;
  /** The widest zoom window, as a percentage of the axis (100 when all fit). */
  maxSpanPercent: number;
}

export function fitBars({
  plotWidth,
  pointCount,
  seriesCount,
  visiblePercent,
}: {
  /** Width of the plotting area in CSS pixels. */
  plotWidth: number;
  /** Periods on the axis. */
  pointCount: number;
  /** Bar series drawn side by side when not stacked. */
  seriesCount: number;
  /** Current zoom window width, 0 to 100. */
  visiblePercent: number;
}): BarFit {
  const width = Math.max(1, plotWidth);
  const points = Math.max(0, Math.floor(pointCount));
  const fitting = Math.max(1, Math.floor(width / STACKED_MIN_BAR_PX));
  const capped = points > fitting;
  const maxSpanPercent = capped ? (fitting / points) * 100 : 100;
  const shownPercent = Math.min(Math.max(visiblePercent, 0), maxSpanPercent);
  const visiblePoints = Math.max(1, Math.round((points * shownPercent) / 100));
  const stacked = seriesCount > 1 && visiblePoints * seriesCount * SIDE_BY_SIDE_MIN_BAR_PX > width;
  return { stacked, maxVisiblePoints: capped ? fitting : null, maxSpanPercent };
}
