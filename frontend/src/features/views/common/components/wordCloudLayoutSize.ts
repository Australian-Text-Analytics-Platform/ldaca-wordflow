/**
 * Estimated padded word-box area as a multiple of the canvas area. It exceeds 1
 * because echarts-wordcloud packs glyphs at pixel level, so small words fit in
 * the gaps around large ones. Measured with the real layout in headless
 * Chromium (1000x600, Zipf-like counts, square-root sizing, circle mask, the
 * constants below): 1.5 spans about 88-97% of the pane at its widest and
 * tallest for 10-100 words with every word placed, with a visible size
 * hierarchy.
 */
const TARGET_FILL = 1.5;
/** Caps the largest word so frequent words cannot dominate the cloud. */
const MAX_FONT_SHARE_OF_HEIGHT = 1 / 3;
/** Default smallest word size relative to the largest. */
const MIN_FONT_SHARE_OF_MAX = 1 / 6;
/** When the cap binds, the smallest word may grow up to this share of the largest. */
const MAX_MIN_FONT_SHARE_OF_MAX = 1 / 3;
/** Floors that keep small clouds (such as topic bubbles) legible. */
const MIN_MAX_FONT_PX = 24;
const MIN_FONT_PX = 10;
/** Spacing between words grows with the largest font so big words never touch. */
const GRID_SHARE_OF_MAX_FONT = 1 / 10;
const MIN_GRID_PX = 4;
const LINE_HEIGHT_EM = 1.1;
/**
 * Approximate glyph widths in em: CJK ideographs and Hangul are full width. The
 * range starts after U+3000 (ideographic space), which needs no wide glyph.
 */
const WIDE_CHAR_RE = /[\u3001-\u9fff\uac00-\ud7af\uff00-\uffef]/u;
const NARROW_CHAR_EM = 0.6;
const WIDE_CHAR_EM = 1;
const SEARCH_STEPS = 20;

interface SizedWord {
  text: string;
  value: number;
}

interface WordCloudSizeInput {
  width: number;
  height: number;
  /** Words with values already compressed by `wordCloudSizingValue`. */
  words: readonly SizedWord[];
}

export interface WordCloudLayoutSize {
  sizeRange: [number, number];
  gridSize: number;
}

/**
 * Compresses word counts before they are mapped to font sizes, so the few most
 * frequent words do not dwarf the rest. echarts-wordcloud maps the value it is
 * given linearly into `sizeRange`, so the series receives these values; the
 * displayed counts and exports keep the exact counts.
 * Used by: ResponsiveWordCloud for the series data.
 */
export const wordCloudSizingValue = (count: number): number => Math.sqrt(Math.max(0, count));

/** Word spacing for a given largest font. Used by: wordCloudLayoutSize. */
const gridSizeFor = (maxFont: number): number =>
  Math.max(MIN_GRID_PX, Math.round(maxFont * GRID_SHARE_OF_MAX_FONT));

const textWidthEm = (text: string): number =>
  Array.from(text).reduce(
    (total, char) => total + (WIDE_CHAR_RE.test(char) ? WIDE_CHAR_EM : NARROW_CHAR_EM),
    0,
  );

/** Finds the largest value in [low, high] that still fits. Used by: wordCloudLayoutSize. */
const searchUpTo = (low: number, high: number, fits: (value: number) => boolean): number => {
  let lower = low;
  let upper = high;
  for (let step = 0; step < SEARCH_STEPS && upper - lower > 0.5; step += 1) {
    const middle = (lower + upper) / 2;
    if (fits(middle)) lower = middle;
    else upper = middle;
  }
  return lower;
};

/**
 * Chooses the font range and word spacing so the words fill the canvas without
 * the most frequent words dominating. It estimates each word's padded box at a
 * candidate range and searches for the range whose total reaches
 * `TARGET_FILL`. The largest word is capped at a third of the canvas height;
 * when that cap binds, the smallest word grows instead (up to a third of the
 * largest)
 * so short lists still fill the pane. `shrinkToFit` still guards words that
 * would not fit, and the range is recomputed whenever the pane resizes.
 * Used by: ResponsiveWordCloud on every layout pass.
 */
export const wordCloudLayoutSize = ({
  width,
  height,
  words,
}: WordCloudSizeInput): WordCloudLayoutSize => {
  const cap = Math.max(MIN_MAX_FONT_PX, Math.round(height * MAX_FONT_SHARE_OF_HEIGHT));
  const defaultMinFor = (maxFont: number) => Math.max(MIN_FONT_PX, maxFont * MIN_FONT_SHARE_OF_MAX);
  const result = (minFont: number, maxFont: number): WordCloudLayoutSize => ({
    sizeRange: [Math.round(minFont), Math.round(maxFont)],
    gridSize: gridSizeFor(maxFont),
  });
  if (words.length === 0 || width <= 0 || height <= 0) return result(defaultMinFor(cap), cap);

  const values = words.map((word) => word.value);
  const low = Math.min(...values);
  const span = Math.max(...values) - low;
  const measured = words.map((word) => ({
    widthEm: textWidthEm(word.text),
    // Position of the word's value within the range, as linearMap computes it.
    share: span > 0 ? (word.value - low) / span : 0.5,
  }));
  const target = TARGET_FILL * width * height;
  const fits = (minFont: number, maxFont: number) => {
    const padding = gridSizeFor(maxFont);
    const area = measured.reduce((total, word) => {
      const font = minFont + (maxFont - minFont) * word.share;
      return total + (word.widthEm * font + 2 * padding) * (LINE_HEIGHT_EM * font + 2 * padding);
    }, 0);
    return area <= target;
  };

  if (fits(defaultMinFor(cap), cap)) {
    const minFont = searchUpTo(defaultMinFor(cap), cap * MAX_MIN_FONT_SHARE_OF_MAX, (candidate) =>
      fits(candidate, cap),
    );
    return result(minFont, cap);
  }
  const maxFont = Math.max(
    MIN_MAX_FONT_PX,
    searchUpTo(MIN_MAX_FONT_PX, cap, (candidate) => fits(defaultMinFor(candidate), candidate)),
  );
  return result(defaultMinFor(maxFont), maxFont);
};
