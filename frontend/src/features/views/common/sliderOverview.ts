/**
 * The range slider's overview (issue 269). ECharts draws the shape inside a
 * dataZoom slider from the first series on the axis, spacing its points evenly
 * by order (true positions only on a time axis). Charts therefore put a hidden
 * overview series first: the total of the visible groups, sampled so that even
 * spacing matches the axis. Used by MultiSeriesChart (Trends) and the
 * Concordance density chart.
 */

/** Id of the hidden series that feeds the range slider's overview (issue 269). */
export const SLIDER_OVERVIEW_ID = '__wordflow_slider_overview__';
/** Hidden y axis for the overview, so it never stretches the visible scale. */
export const OVERVIEW_Y_AXIS = { type: 'value' as const, show: false, min: 0 };
/** Evenly spaced samples across a "To scale" axis; about the slider's width in pixels. */
const OVERVIEW_SAMPLES = 600;

/**
 * Data for the range slider's overview (issue 269): the total of the visible
 * groups per period. ECharts draws the overview from the first series and
 * spaces its points evenly by order, not by axis position. A category axis
 * ("Even") is evenly spaced already, so it gets one point per period. A value
 * axis ("To scale") gets evenly spaced samples across its range, each holding
 * the total of the period that covers it (about one typical period wide), so
 * empty periods show as gaps under the bars above.
 */
export const sliderOverviewData = ({
  data,
  xKey,
  xAxisType,
  totals,
  extent,
  samples = OVERVIEW_SAMPLES,
}: {
  data: readonly Record<string, unknown>[];
  xKey: string;
  xAxisType: string;
  totals: readonly number[];
  /** The value axis's [min, max] when it is fixed; defaults to the data's range. */
  extent?: readonly [number, number];
  samples?: number;
}): [unknown, number][] => {
  // Category points carry their period's own category, so the overview
  // shares the periods instead of adding categories of its own.
  if (xAxisType !== 'value') return data.map((row, index) => [row[xKey], totals[index] ?? 0]);
  const periods = data
    .map((row, index) => ({ x: Number(row[xKey]), total: totals[index] ?? 0 }))
    .filter((period) => Number.isFinite(period.x))
    .sort((a, b) => a.x - b.x);
  const firstPeriod = periods[0];
  const lastPeriod = periods[periods.length - 1];
  if (!firstPeriod || !lastPeriod) return [];
  const start = extent?.[0] ?? firstPeriod.x;
  const end = extent?.[1] ?? lastPeriod.x;
  if (end <= start) return [[firstPeriod.x, firstPeriod.total]];
  // A typical period's width: the median gap between neighbouring periods.
  const gaps = periods
    .slice(1)
    .map((period, index) => period.x - (periods[index]?.x ?? period.x))
    .filter((gap) => gap > 0)
    .sort((a, b) => a - b);
  const width = gaps[Math.floor(gaps.length / 2)] ?? end - start;
  const step = (end - start) / (samples - 1);
  const values = new Array<number>(samples).fill(0);
  for (const period of periods) {
    const from = Math.max(0, Math.ceil((period.x - width / 2 - start) / step));
    const to = Math.min(samples - 1, Math.floor((period.x + width / 2 - start) / step));
    for (let sample = from; sample <= to; sample += 1) {
      values[sample] = Math.max(values[sample] ?? 0, period.total);
    }
  }
  return values.map((value, sample): [unknown, number] => [start + sample * step, value]);
};

/** Invisible series carrying the overview; no tooltip, clicks or legend. */
export const sliderOverviewSeries = (data: [unknown, number][], yAxisIndex: number) => ({
  id: SLIDER_OVERVIEW_ID,
  type: 'line' as const,
  data,
  yAxisIndex,
  silent: true,
  // Also keeps it out of axis-pointer snapping, so clicks pick real periods.
  tooltip: { show: false },
  symbol: 'none',
  showSymbol: false,
  lineStyle: { opacity: 0, width: 0 },
  emphasis: { disabled: true },
  animation: false,
  z: -2,
});
