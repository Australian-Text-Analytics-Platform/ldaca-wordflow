/**
 * The Topic Modelling chart's layout on a wide card: the Display options and
 * legend in a compact column beside the chart, or below it (issue 433).
 * Used by: TopicModelingBubbleChartSection, and TopicModelingFeature, which
 * remembers the layout as tab settings on this device.
 */
export interface TopicChartLayout {
  /** Beside the chart on a wide card (default), or below it. */
  placement: 'side' | 'below';
  /** The chart's share of the width after a drag; null gives the options their default width. */
  chartShare: number | null;
}

export const DEFAULT_TOPIC_CHART_LAYOUT: TopicChartLayout = {
  placement: 'side',
  chartShare: null,
};

/** The options column's width until the divider is dragged (Chao, 2026-10-24: compact). */
const DEFAULT_SIDE_WIDTH = 380;
export const CHART_MIN_WIDTH = 420;
export const SIDE_MIN_WIDTH = 340;
export const DIVIDER_WIDTH = 8;
export const CHART_SHARE_STEP = 0.05;
/** Narrower cards keep the settings below the chart. */
export const SIDE_LAYOUT_MIN_WIDTH = CHART_MIN_WIDTH + DIVIDER_WIDTH + SIDE_MIN_WIDTH;

/**
 * The chart column's width: the rest of the card after the options' default
 * width, or the dragged share, leaving the options their minimum.
 */
export function topicChartWidth(box: { width: number }, chartShare: number | null): number {
  const max = box.width - DIVIDER_WIDTH - SIDE_MIN_WIDTH;
  const preferred =
    chartShare === null ? box.width - DIVIDER_WIDTH - DEFAULT_SIDE_WIDTH : chartShare * box.width;
  return Math.round(Math.max(CHART_MIN_WIDTH, Math.min(max, preferred)));
}
