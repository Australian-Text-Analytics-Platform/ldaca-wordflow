/**
 * The Topic Modelling chart's layout on a wide card: the Display options and
 * legend beside a 4:3 chart, or below it (issue 433).
 * Used by: TopicModelingBubbleChartSection, and TopicModelingFeature, which
 * remembers the layout as tab settings on this device.
 */
export interface TopicChartLayout {
  /** Beside the chart on a wide card (default), or below it. */
  placement: 'side' | 'below';
  /** The chart's share of the width after a drag; null keeps it 4:3. */
  chartShare: number | null;
}

export const DEFAULT_TOPIC_CHART_LAYOUT: TopicChartLayout = {
  placement: 'side',
  chartShare: null,
};

/** The chart's preferred shape beside the settings (Chao, 2026-10-24). */
const CHART_ASPECT = 4 / 3;
export const CHART_MIN_WIDTH = 420;
export const SIDE_MIN_WIDTH = 300;
export const DIVIDER_WIDTH = 8;
export const CHART_SHARE_STEP = 0.05;
/** Narrower cards keep the settings below the chart. */
export const SIDE_LAYOUT_MIN_WIDTH = CHART_MIN_WIDTH + DIVIDER_WIDTH + SIDE_MIN_WIDTH;

/** The chart column's width: 4:3 of its height, or the dragged share, leaving the side its minimum. */
export function topicChartWidth(
  box: { width: number; height: number },
  chartShare: number | null,
): number {
  const max = box.width - DIVIDER_WIDTH - SIDE_MIN_WIDTH;
  const preferred = chartShare === null ? box.height * CHART_ASPECT : chartShare * box.width;
  return Math.round(Math.max(CHART_MIN_WIDTH, Math.min(max, preferred)));
}
