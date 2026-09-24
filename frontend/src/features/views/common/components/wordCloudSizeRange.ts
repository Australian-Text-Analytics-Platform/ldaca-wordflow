/** Largest word height as a share of the canvas height. */
const MAX_FONT_SHARE_OF_HEIGHT = 1 / 5;
/** Smallest word size relative to the largest. */
const MIN_FONT_SHARE_OF_MAX = 1 / 6;
/** Floors that keep small clouds (such as topic bubbles) legible. */
const MIN_MAX_FONT_PX = 24;
const MIN_FONT_PX = 10;

/**
 * Scales the font range with the canvas so the cloud fills its pane and grows
 * or shrinks with it. echarts-wordcloud otherwise uses a fixed 12-60px range
 * at any canvas size. `shrinkToFit` still guards words that would not fit.
 * Used by: ResponsiveWordCloud on every layout pass.
 */
export const wordCloudSizeRange = (cloudHeight: number): [number, number] => {
  const maxFont = Math.max(MIN_MAX_FONT_PX, Math.round(cloudHeight * MAX_FONT_SHARE_OF_HEIGHT));
  const minFont = Math.max(MIN_FONT_PX, Math.round(maxFont * MIN_FONT_SHARE_OF_MAX));
  return [minFont, maxFont];
};
